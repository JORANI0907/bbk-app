import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createAuthUser, updateAuthUserEmailAndPassword, updateAuthUserEmail, customerEmail } from '@/lib/auth-helpers'
import { generateBillingSchedule, computeBillingAmountFromCustomer, shouldAutoGenerateBillings } from '@/lib/billing-generator'

const ALLOWED = [
  // 일반정보
  'business_name', 'contact_name', 'contact_phone', 'contact_phone_2', 'email',
  'phone_notify_1', 'phone_notify_2',
  'platform_nickname', 'business_number', 'account_number',
  // 작업장정보
  'address', 'address_detail',
  'elevator', 'building_access', 'access_method',
  'business_hours_start', 'business_hours_end',
  'door_password', 'parking_info',
  // 시공정보
  'care_scope', 'special_notes',
  // Phase 27-AS: 관리자 메모 (누락되어 있어 저장 후 사라지던 이슈 해결)
  'admin_notes',
  // 결제정보
  'payment_method',
  'unit_price', 'deposit', 'supply_amount', 'vat', 'balance',
  // 계약/정기 정보
  'customer_type', 'status', 'pipeline_status',
  'billing_cycle', 'billing_timing', 'billing_amount',
  'billing_start_date', 'billing_next_date',
  // 자동 알림 전면 중단 옵션
  'auto_notification_paused', 'auto_notification_pause_reason',
  'contract_start_date', 'contract_end_date',
  'visit_interval_days', 'next_visit_date',
  'visit_schedule_type', 'visit_weekdays', 'visit_monthly_dates',
  'rotation_type', 'visit_count_per_month',
  'payment_status', 'payment_date', 'schedule_generation_day',
  'notes', 'drive_folder_url',
  // Phase 9-B: 1회성 진행/결제 상태 이원화 (customers 기반 통합)
  'progress_status', 'payment_status_detail', 'tax_invoice_issued',
  // Phase 20-C: 투입주기 (몇 개월에 1회)
  'injection_cycle_months',
  // Phase 29: 연간 결제 월/일 (정기딥케어 연간 전용)
  'yearly_billing_month', 'yearly_billing_day',
  // 담당 직원/작업자
  'assigned_user_id', 'assigned_worker_id',
  // 성향
  'disposition',
  // 고객 등급
  'grade',
  // Phase 37: 통합 방문주기
  'visit_cycle_unit', 'visit_cycle_value', 'visit_cycle_config',
]

/**
 * Phase 22 v11: 계약 저장 시 billings(청구 예정) 자동 생성.
 * - 정기딥 연간·정기엔드 월간·정기엔드 연간이 대상
 * - 이미 존재하는 billing_period는 skip (idempotent)
 * - 실패해도 고객 저장은 성공 처리 (log만 남김)
 */
async function autoGenerateBillings(
  supabase: ReturnType<typeof createServiceClient>,
  customer: {
    id: string
    customer_type: string | null
    billing_cycle: string | null
    billing_timing?: 'prepaid' | 'postpaid' | null
    contract_start_date: string | null
    contract_end_date: string | null
    payment_date: number | null
    supply_amount: number | null
    vat: number | null
    billing_amount: number | null
    payment_method: string | null
    status?: string | null
  },
  regenerate = false,
): Promise<{ inserted: number; skipped: number }> {
  // Phase 23: 일시정지 고객은 청구 생성 skip
  if (customer.status === 'paused') return { inserted: 0, skipped: 0 }
  const amount = computeBillingAmountFromCustomer(customer)
  const timing = customer.billing_timing ?? 'prepaid'
  const input = {
    serviceType: customer.customer_type,
    billingCycle: customer.billing_cycle,
    contractStartDate: customer.contract_start_date,
    contractEndDate: customer.contract_end_date,
    paymentDay: customer.payment_date,
    billingAmount: amount,
    billingTiming: timing,
  }
  if (!shouldAutoGenerateBillings(input)) return { inserted: 0, skipped: 0 }

  const schedule = generateBillingSchedule(input)
  if (schedule.length === 0) return { inserted: 0, skipped: 0 }

  // billing 관련 필드 변경 시 pending 레코드 삭제 후 전체 재생성
  if (regenerate) {
    await supabase
      .from('service_billings')
      .delete()
      .eq('customer_id', customer.id)
      .eq('status', 'pending')
  }

  // 기존 청구 기간 조회 (paid/overdue 등 non-pending 레코드 보호)
  const { data: existing } = await supabase
    .from('service_billings')
    .select('billing_period')
    .eq('customer_id', customer.id)

  const existingSet = new Set((existing ?? []).map((r: { billing_period: string }) => r.billing_period))
  const toInsert = schedule.filter(s => !existingSet.has(s.billing_period))

  if (toInsert.length === 0) return { inserted: 0, skipped: schedule.length }

  const rows = toInsert.map(s => ({
    customer_id: customer.id,
    billing_type: s.billing_type,
    billing_period: s.billing_period,
    amount: s.amount,
    due_date: s.due_date,
    status: 'pending' as const,
    service_type: customer.customer_type,
    billing_timing: timing,
  }))

  const { error } = await supabase.from('service_billings').insert(rows)
  if (error) {
    console.error('[autoGenerateBillings] insert 실패:', error.message)
    return { inserted: 0, skipped: schedule.length }
  }
  return { inserted: toInsert.length, skipped: schedule.length - toInsert.length }
}

async function createPortalAccount(
  supabase: ReturnType<typeof createServiceClient>,
  customerId: string,
  phone: string,
  name: string,
  businessNumber?: string,
): Promise<string> {
  const normalizedPhone = phone.replace(/-/g, '')
  const email = customerEmail(normalizedPhone)
  // 초기 비밀번호: 사업자등록번호 (없으면 전화번호)
  const normalizedBN = (businessNumber ?? '').replace(/-/g, '')
  const password = normalizedBN || normalizedPhone

  const { data: existingUser } = await supabase
    .from('users')
    .select('id, auth_id')
    .eq('phone', normalizedPhone)
    .eq('role', 'customer')
    .single()

  let userId: string

  if (existingUser) {
    userId = existingUser.id
    if (existingUser.auth_id) {
      await updateAuthUserEmailAndPassword(existingUser.auth_id, email, password)
    } else {
      const authUser = await createAuthUser(email, password, { role: 'customer', name })
      await supabase.from('users').update({ auth_id: authUser.id }).eq('id', existingUser.id)
    }
  } else {
    const authUser = await createAuthUser(email, password, { role: 'customer', name })
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({ auth_id: authUser.id, role: 'customer', name, phone: normalizedPhone, is_active: true })
      .select('id')
      .single()
    if (insertError) throw new Error(insertError.message)
    userId = newUser!.id
  }

  await supabase.from('customers').update({ user_id: userId }).eq('id', customerId)
  return password
}

// 리스트 화면 카드에서 실제로 렌더링·판독되는 필드 세트.
// 케어범위·총액·계산서발행상태·계약기간·방문주기·방문일정 등 리스트 UI 에 표시되는
// 값이 비어 보이지 않도록 포함. 세부창 편집 전용의 무거운 필드/개인정보/jsonb 만 제외.
// 하위호환: page/fields 파라미터 없으면 기존 FULL 필드 그대로 반환.
const FIELDS_SLIM = [
  // 기본 식별·연락처 (리스트 표시)
  'id', 'business_name', 'contact_name', 'contact_phone', 'contact_phone_2',
  'phone_notify_1', 'phone_notify_2',
  'address',
  // 유형·상태·성향 (뱃지)
  'customer_type', 'status', 'pipeline_status', 'disposition', 'grade',
  'progress_status', 'payment_status_detail',
  'archived_at', 'auto_notification_paused',
  // 시공정보 (리스트에 표시되는 케어범위)
  'care_scope',
  // 결제·금액 (리스트에 총액·잔금 표시)
  'payment_method', 'supply_amount', 'vat', 'deposit', 'balance',
  'tax_invoice_issued',
  // 방문/계약 (계약기간·방문주기·다음 결제일 표시)
  'billing_cycle', 'billing_timing', 'billing_amount',
  'billing_start_date', 'billing_next_date',
  'contract_start_date', 'contract_end_date',
  'visit_interval_days', 'visit_schedule_type', 'visit_weekdays', 'visit_monthly_dates',
  'rotation_type', 'visit_count_per_month',
  'next_visit_date', 'construction_time',
  // 통합 방문주기 (Phase 37) — 초기값 { }/1 이 있어 lazy merge 로직으로는
  // full 값이 안 덮여져 방문일정 섹션이 자꾸 초기화되던 문제 해결.
  'visit_cycle_unit', 'visit_cycle_value', 'visit_cycle_config',
  'yearly_billing_month', 'yearly_billing_day', 'injection_cycle_months',
  // 담당자
  'assigned_user_id', 'assigned_worker_id',
  // 최근 알림 이력 (리스트 인라인 표시용) — 배열이지만 대부분 몇 개 안 됨
  'notification_log',
  // 메타
  'created_at', 'updated_at',
].join(', ')

const FIELDS_FULL = 'id, business_name, contact_name, contact_phone, contact_phone_2, email, address, address_detail, business_number, account_number, platform_nickname, payment_method, elevator, building_access, access_method, business_hours_start, business_hours_end, door_password, parking_info, special_notes, care_scope, pipeline_status, customer_type, status, disposition, grade, billing_cycle, billing_timing, billing_amount, supply_amount, vat, deposit, balance, billing_start_date, billing_next_date, contract_start_date, contract_end_date, unit_price, visit_interval_days, next_visit_date, visit_schedule_type, visit_weekdays, visit_monthly_dates, visit_cycle_unit, visit_cycle_value, visit_cycle_config, yearly_billing_month, yearly_billing_day, notes, rotation_type, visit_count_per_month, payment_status, payment_date, schedule_generation_day, assigned_user_id, assigned_worker_id, user_id, account_user_id, progress_status, payment_status_detail, tax_invoice_issued, injection_cycle_months, drive_folder_url, notification_log, phone_notify_1, phone_notify_2, construction_time, admin_notes, archived_at, archived_by, auto_notification_paused, created_at, updated_at'

export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const subscriptionOnly = searchParams.get('subscription_only') === 'true'
  // Phase 4: 이관 필터 — 기본은 활성(archived_at IS NULL), 'true'면 이관됨만, 'all'이면 전체
  const archived = searchParams.get('archived')

  // 성능 최적화 파라미터 (있으면 페이지네이션 모드, 없으면 기존 동작 유지)
  const pageParam = searchParams.get('page')
  const paginationMode = pageParam !== null
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50))
  const search = (searchParams.get('search') ?? '').trim()
  const customerTypeFilter = searchParams.get('customer_type') // '1회성케어' | '정기딥케어' | '정기엔드케어' | null
  const visitDateRange = searchParams.get('visit_date_range') // 'YYYY-MM' → next_visit_date 그 달만
  const fieldsMode = searchParams.get('fields') // 'slim' 강제 지정 가능

  // 페이지네이션 모드거나 명시적으로 slim 요청 시 슬림 필드만
  const useSlim = paginationMode || fieldsMode === 'slim'

  let query = supabase
    .from('customers')
    .select(useSlim ? FIELDS_SLIM : FIELDS_FULL, paginationMode ? { count: 'exact' } : undefined)
    .is('deleted_at', null)
    .order('business_name', { ascending: true })

  if (subscriptionOnly) {
    query = query.in('customer_type', ['정기딥케어', '정기엔드케어'])
  }

  if (customerTypeFilter) {
    query = query.eq('customer_type', customerTypeFilter)
  }

  if (search) {
    // 상호명 또는 대표자명 또는 전화번호 부분일치 (하이픈 제거 대응)
    const raw = search.replace(/-/g, '')
    query = query.or(
      `business_name.ilike.%${search}%,contact_name.ilike.%${search}%,contact_phone.ilike.%${raw}%`
    )
  }

  if (visitDateRange && /^\d{4}-\d{2}$/.test(visitDateRange)) {
    const [y, m] = visitDateRange.split('-').map(Number)
    const monthStart = `${visitDateRange}-01`
    const nextMonth = m === 12
      ? `${y + 1}-01-01`
      : `${y}-${String(m + 1).padStart(2, '0')}-01`
    query = query.gte('next_visit_date', monthStart).lt('next_visit_date', nextMonth)
  }

  if (archived === 'true') {
    query = query.not('archived_at', 'is', null)
  } else if (archived !== 'all') {
    query = query.is('archived_at', null)
  }

  // 페이지네이션 range 적용
  if (paginationMode) {
    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)
  }

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Phase 27-AH: 각 customer 에 assigned_worker_ids: string[] 배열 병합 (다중 작업자 지원).
  // 1회성/일반일정은 linked application 의 work_assignments 전체를, 정기는 customer 대표 worker 만.
  // 첫 번째 id 는 하위호환용 assigned_worker_id 와 정합 유지.
  // FIELDS_SLIM/FULL 이 동적 문자열이라 Supabase 타입 추론이 실패 → 명시적 캐스트 (실제 필드는 select 문에 정의됨)
  type CustomerRow = Record<string, unknown> & {
    id: string
    customer_type?: string | null
    assigned_worker_id?: string | null
  }
  const customers = (data ?? []) as unknown as CustomerRow[]
  if (customers.length > 0) {
    const oneShotIds = customers
      .filter(c => c.customer_type === '1회성케어' || c.customer_type === '일반일정')
      .map(c => c.id)
    if (oneShotIds.length > 0) {
      const { data: apps } = await supabase
        .from('service_applications')
        .select('id, customer_id')
        .in('customer_id', oneShotIds)
        .is('deleted_at', null)
        .is('archived_at', null)
      const appIdToCustomer = new Map<string, string>()
      const appIds: string[] = []
      for (const a of apps ?? []) {
        if (a.id && a.customer_id) {
          appIdToCustomer.set(a.id, a.customer_id)
          appIds.push(a.id)
        }
      }
      if (appIds.length > 0) {
        const { data: assignments } = await supabase
          .from('work_assignments')
          .select('application_id, worker_id, id')
          .in('application_id', appIds)
          .order('id', { ascending: true })
        const customerWorkers = new Map<string, string[]>()
        for (const wa of assignments ?? []) {
          const custId = appIdToCustomer.get(wa.application_id)
          if (!custId || !wa.worker_id) continue
          if (!customerWorkers.has(custId)) customerWorkers.set(custId, [])
          const arr = customerWorkers.get(custId)!
          if (!arr.includes(wa.worker_id)) arr.push(wa.worker_id)
        }
        for (const c of customers) {
          // 1회성/일반일정만 work_assignments 기반으로 오버라이드.
          // 정기딥/엔드는 아래 fallback 블록에서 assigned_worker_id 단일 값을 배열로 감싸 처리.
          if (c.customer_type !== '1회성케어' && c.customer_type !== '일반일정') continue
          const ids = customerWorkers.get(c.id) ?? []
          ;(c as Record<string, unknown>).assigned_worker_ids = ids
          // 하위호환: assigned_worker_id 첫 번째로 override (기존 필드값이 어긋난 경우 자동 정합)
          if (ids.length > 0) (c as Record<string, unknown>).assigned_worker_id = ids[0]
        }
      }
    }
    // 정기딥/엔드 등 나머지는 assigned_worker_ids 빈 배열
    for (const c of customers) {
      if (!(c as Record<string, unknown>).assigned_worker_ids) {
        (c as Record<string, unknown>).assigned_worker_ids = c.assigned_worker_id ? [c.assigned_worker_id] : []
      }
    }
  }

  // 페이지네이션 응답: total/hasMore 포함. 아니면 기존 형식 유지 (하위호환)
  if (paginationMode) {
    const total = count ?? 0
    const hasMore = page * limit < total
    return NextResponse.json({ customers, total, page, limit, hasMore })
  }
  return NextResponse.json({ customers })
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()

  if (!body.business_name?.trim()) {
    return NextResponse.json({ error: '업체명은 필수입니다.' }, { status: 400 })
  }

  // 중복 체크: business_name 기준
  const { data: existing } = await supabase
    .from('customers')
    .select('*')
    .eq('business_name', body.business_name.trim())
    .is('deleted_at', null)
    .maybeSingle()

  if (existing) {
    // Phase 27-Z fix: 이전엔 data:existing 로 반환해 프론트의 data.customer 참조가 undefined 되어
    // handleSelect(undefined)에서 TypeError → 화면 크래시. customer 키로 통일 + skipped 플래그 유지.
    return NextResponse.json({ customer: existing, skipped: true })
  }

  const insert: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (key in body) insert[key] = body[key]
  }

  const { data, error } = await supabase
    .from('customers')
    .insert(insert)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 연락처가 있으면 포털 계정 자동 생성
  let generatedPassword: string | null = null
  if (body.contact_phone) {
    try {
      const name = (body.contact_name || body.business_name || '').trim()
      generatedPassword = await createPortalAccount(supabase, data.id, body.contact_phone, name, body.business_number)
    } catch (e) {
      // 포털 계정 생성 실패해도 고객 등록은 성공 처리
      console.error('포털 계정 자동 생성 실패:', e instanceof Error ? e.message : e)
    }
  }

  // Phase 22 v11: 계약 정보가 충분하면 billings 자동 생성 (정기딥 연간·정기엔드 월/연간 대상)
  try {
    await autoGenerateBillings(supabase, data)
  } catch (e) {
    console.error('billings 자동 생성 실패(POST):', e instanceof Error ? e.message : e)
  }

  // 견적관리 연동: customers 만 등록되고 service_applications 가 없으면 견적관리 검색에서
  // 잡히지 않아 성수/연남 케이스처럼 "누락된 고객" 이 발생. 신규 customer 마다 대응 신청서
  // (source='customer_direct') 를 자동 생성해 두 테이블 정합성 유지. 견적 저장(saved_quotes)은
  // 여전히 service_applications 만 사용하는 구조를 유지하면서, 검색·매칭만 정상화한다.
  try {
    await supabase.from('service_applications').insert({
      customer_id: data.id,
      business_name: data.business_name,
      owner_name: data.contact_name,
      phone: data.contact_phone,
      phone_2: data.contact_phone_2,
      email: data.email,
      address: data.address,
      business_hours_start: data.business_hours_start,
      business_hours_end: data.business_hours_end,
      construction_date: data.next_visit_date,
      construction_time: data.construction_time,
      care_scope: data.care_scope,
      service_type: data.customer_type,
      payment_method: data.payment_method,
      assigned_to: data.assigned_user_id,
      source: 'customer_direct',
      status: '기존고객',
      saved_quotes: [],
    })
  } catch (e) {
    console.error('customer→service_applications 자동 생성 실패:', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({ customer: data, generatedPassword }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { id, ...rest } = body

  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of ALLOWED) {
    if (key in rest) updates[key] = rest[key]
  }

  const phoneChanged = 'contact_phone' in rest

  // contact_phone 변경 전 현재 고객의 user_id 조회
  let existingUserId: string | null = null
  if (phoneChanged) {
    const { data: currentCustomer } = await supabase
      .from('customers')
      .select('user_id')
      .eq('id', id)
      .single()
    existingUserId = currentCustomer?.user_id ?? null
  }

  const { data: updatedCustomer, error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // contact_phone 변경 시 users + Auth 동기화 (실패해도 고객 수정은 성공)
  if (phoneChanged && existingUserId) {
    const newPhone = ((rest.contact_phone as string) ?? '').replace(/-/g, '')
    try {
      await supabase
        .from('users')
        .update({ phone: newPhone })
        .eq('id', existingUserId)

      const { data: userRow } = await supabase
        .from('users')
        .select('auth_id')
        .eq('id', existingUserId)
        .single()

      if (userRow?.auth_id) {
        await updateAuthUserEmail(userRow.auth_id, customerEmail(newPhone))
      }
    } catch (e) {
      console.error('고객 전화번호 동기화 실패:', e instanceof Error ? e.message : e)
    }
  }

  // 유형 변경 시 이전 유형 일정만 소프트 삭제 (양방향: 정기↔다른유형)
  // 반드시 스냅샷 동기화(아래) 전에 실행해야 함 —
  // 동기화가 먼저 실행되면 이전 유형의 service_type이 바뀌어 삭제 대상을 못 찾음.
  if (typeof rest.deleteScheduleType === 'string' && rest.deleteScheduleType) {
    try {
      await supabase
        .from('service_applications')
        .update({ deleted_at: new Date().toISOString() })
        .eq('customer_id', id)
        .is('deleted_at', null)
        .eq('service_type', rest.deleteScheduleType)
    } catch (e) {
      console.error('유형 변경 일정 삭제 실패:', e instanceof Error ? e.message : e)
    }
  }

  // customer → service_applications 자동 필드 sync 는 정기딥/정기엔드에는 여전히 폐지.
  //   마스터 편집이 기존 회차 일정에 영향을 주면 업무량·정산이 왜곡됨.
  //   회차 일정은 생성 시점(generate-schedules)의 스냅샷을 유지하고,
  //   개별 회차 수정은 이번달 일정 섹션의 아코디언에서만 수행.
  //
  // 예외: 1회성케어·일반일정은 원칙상 customer 1건 = 신청서 1건 구조라
  //   담당자·시공일자가 마스터와 어긋나면 배정관리에서 매칭 실패 →
  //   customer:접두사 마킹 → 편집 불가로 고객관리로 튕겨나감.
  //   open 상태(결제·작업완료 전) 신청서만 좁게 sync.
  const oneShotSyncable =
    updatedCustomer.customer_type === '1회성케어' ||
    updatedCustomer.customer_type === '일반일정'
  const oneShotFieldsChanged =
    'assigned_user_id' in rest ||
    'next_visit_date' in rest ||
    'drive_folder_url' in rest
  if (oneShotSyncable && oneShotFieldsChanged) {
    try {
      const appUpdates: Record<string, unknown> = {}
      if ('assigned_user_id' in rest) appUpdates.assigned_to = rest.assigned_user_id
      if ('next_visit_date' in rest) appUpdates.construction_date = rest.next_visit_date
      // drive_folder_url 도 마스터 편집 시 짝 신청서에 동기화 (사진올리기 폴백과 정합)
      if ('drive_folder_url' in rest) appUpdates.drive_folder_url = rest.drive_folder_url
      if (Object.keys(appUpdates).length > 0) {
        // 작업완료·결제 상태도 포함 — 사후 담당자/시공일자 정정을 허용해야
        // 이미 완료된 건의 배정 오류를 관리자가 수정할 수 있다.
        await supabase
          .from('service_applications')
          .update(appUpdates)
          .eq('customer_id', id)
          .is('deleted_at', null)
          .in('status', ['신규', '예약확정', '예약1일전', '예약당일', '기존고객', '작업완료', '결제'])
      }
    } catch (e) {
      console.error(
        '1회성/일반일정 customer→service_applications sync 실패:',
        e instanceof Error ? e.message : e,
      )
    }
  }

  // Phase 27-AH sync: 1회성/일반일정 마스터에서 worker_ids 편집 시 짝 신청서의
  // work_assignments 를 재구성. 그동안 customers PATCH 가 worker_ids 를 무시해서
  // UI 상태만 바뀌고 DB 에는 저장 안 되던 광범위 버그를 근본 해결.
  //
  // 정기딥/엔드는 이번달 일정 아코디언(MonthlyScheduleSection)에서 회차별로
  // 직접 배정하므로 여기서는 스킵.
  if (oneShotSyncable && Array.isArray((rest as Record<string, unknown>).worker_ids)) {
    const workerIds = ((rest as Record<string, unknown>).worker_ids as unknown[])
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
    try {
      // 작업완료·결제 상태도 포함 — 이미 완료된 회차의 담당자 정정을 허용.
      // (급여 재계산은 관리자가 급여관리에서 별도로 확인)
      const { data: openApp } = await supabase
        .from('service_applications')
        .select('id, construction_date, business_name')
        .eq('customer_id', id)
        .is('deleted_at', null)
        .in('status', ['신규', '예약확정', '예약1일전', '예약당일', '기존고객', '작업완료', '결제'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (openApp && openApp.construction_date && openApp.business_name) {
        // 기존 배정 전량 삭제 후 새로 삽입 (multi-set replace)
        await supabase
          .from('work_assignments')
          .delete()
          .eq('application_id', openApp.id)

        if (workerIds.length > 0) {
          const rows = workerIds.map(worker_id => ({
            worker_id,
            application_id: openApp.id,
            construction_date: openApp.construction_date,
            business_name: openApp.business_name,
          }))
          await supabase.from('work_assignments').insert(rows)
        }
      }
    } catch (e) {
      console.error(
        '1회성/일반일정 worker_ids sync 실패:',
        e instanceof Error ? e.message : e,
      )
    }
  }

  // Phase 22 v11: 계약 관련 필드가 변경됐거나 계약 조건이 충족되면 billings 재생성
  // regenerate=true: pending 레코드 삭제 후 현재 조건(billing_cycle 등)으로 전체 재생성
  // paid/overdue 등 non-pending 레코드는 보호됨
  const billingRelevantChanged = ['billing_cycle', 'billing_timing', 'contract_start_date', 'contract_end_date',
    'payment_date', 'supply_amount', 'vat', 'billing_amount', 'payment_method', 'customer_type']
    .some(k => k in rest)
  if (billingRelevantChanged) {
    try {
      await autoGenerateBillings(supabase, updatedCustomer, true)
    } catch (e) {
      console.error('billings 자동 생성 실패(PATCH):', e instanceof Error ? e.message : e)
    }
  }

  return NextResponse.json({ success: true, customer: updatedCustomer })
}

export async function DELETE(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const now = new Date().toISOString()

  // 고객 소프트 삭제
  const { error } = await supabase
    .from('customers')
    .update({ deleted_at: now })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 연결된 service_schedules도 cascade 소프트 삭제
  await supabase
    .from('service_schedules')
    .update({ deleted_at: now })
    .eq('customer_id', id)
    .is('deleted_at', null)

  // 연결된 service_applications도 cascade 소프트 삭제.
  // 누락 시 캘린더가 orphan 앱을 계속 표시하고, 클릭하면 customers 리스트에서 못 찾아
  // "이 회차의 고객 정보를 찾을 수 없습니다" 토스트가 발생함.
  await supabase
    .from('service_applications')
    .update({ deleted_at: now })
    .eq('customer_id', id)
    .is('deleted_at', null)

  return NextResponse.json({ success: true })
}
