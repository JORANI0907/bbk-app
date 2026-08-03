import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createAuthUser, updateAuthUserEmailAndPassword, updateAuthUserEmail, customerEmail } from '@/lib/auth-helpers'
import { generateBillingSchedule, computeBillingAmountFromCustomer, shouldAutoGenerateBillings } from '@/lib/billing-generator'
import { buildAppUpdatesFromCustomerPatch } from '@/lib/customer-app-sync'

const ALLOWED = [
  // 일반정보
  'business_name', 'contact_name', 'contact_phone', 'contact_phone_2', 'email',
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
  'billing_cycle', 'billing_amount',
  'billing_start_date', 'billing_next_date',
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
  const input = {
    serviceType: customer.customer_type,
    billingCycle: customer.billing_cycle,
    contractStartDate: customer.contract_start_date,
    contractEndDate: customer.contract_end_date,
    paymentDay: customer.payment_date,
    billingAmount: amount,
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

export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const subscriptionOnly = searchParams.get('subscription_only') === 'true'
  // Phase 4: 이관 필터 — 기본은 활성(archived_at IS NULL), 'true'면 이관됨만, 'all'이면 전체
  const archived = searchParams.get('archived')

  let query = supabase
    .from('customers')
    .select('id, business_name, contact_name, contact_phone, contact_phone_2, email, address, address_detail, business_number, account_number, platform_nickname, payment_method, elevator, building_access, access_method, business_hours_start, business_hours_end, door_password, parking_info, special_notes, care_scope, pipeline_status, customer_type, status, disposition, grade, billing_cycle, billing_amount, supply_amount, vat, deposit, balance, billing_start_date, billing_next_date, contract_start_date, contract_end_date, unit_price, visit_interval_days, next_visit_date, visit_schedule_type, visit_weekdays, visit_monthly_dates, notes, rotation_type, visit_count_per_month, payment_status, payment_date, schedule_generation_day, assigned_user_id, assigned_worker_id, user_id, account_user_id, progress_status, payment_status_detail, tax_invoice_issued, injection_cycle_months, drive_folder_url, notification_log, phone_notify_1, phone_notify_2, construction_time, admin_notes, archived_at, archived_by, created_at, updated_at')
    .is('deleted_at', null)
    .order('business_name', { ascending: true })

  if (subscriptionOnly) {
    query = query.in('customer_type', ['정기딥케어', '정기엔드케어'])
  }

  if (archived === 'true') {
    query = query.not('archived_at', 'is', null)
  } else if (archived !== 'all') {
    query = query.is('archived_at', null)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Phase 27-AH: 각 customer 에 assigned_worker_ids: string[] 배열 병합 (다중 작업자 지원).
  // 1회성/일반일정은 linked application 의 work_assignments 전체를, 정기는 customer 대표 worker 만.
  // 첫 번째 id 는 하위호환용 assigned_worker_id 와 정합 유지.
  const customers = data ?? []
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

  // Phase 27-AY: customer 편집 시 service_applications 스냅샷 필드 일괄 동기화.
  // 매핑은 lib/customer-app-sync.ts 의 CUSTOMER_TO_APP_FIELD_MAP 중앙 관리.
  // 새 필드 sync 필요 시 그 파일에만 한 줄 추가하면 여기 로직 자동 반영됨.
  // 배정관리·캘린더·재무·급여 등 service_applications 를 읽는 모든 화면에 즉시 반영.
  // deleted_at IS NULL 조건: 삭제된 일정(위에서 처리)은 동기화 대상에서 제외.
  const appUpdates = buildAppUpdatesFromCustomerPatch(rest)
  if (Object.keys(appUpdates).length > 0) {
    try {
      await supabase
        .from('service_applications')
        .update(appUpdates)
        .eq('customer_id', id)
        .is('deleted_at', null)
    } catch (e) {
      console.error('신청서 스냅샷 동기화 실패:', e instanceof Error ? e.message : e)
    }
  }

  // Phase 22 v11: 계약 관련 필드가 변경됐거나 계약 조건이 충족되면 billings 재생성
  // regenerate=true: pending 레코드 삭제 후 현재 조건(billing_cycle 등)으로 전체 재생성
  // paid/overdue 등 non-pending 레코드는 보호됨
  const billingRelevantChanged = ['billing_cycle', 'contract_start_date', 'contract_end_date',
    'payment_date', 'supply_amount', 'vat', 'billing_amount', 'payment_method', 'customer_type']
    .some(k => k in rest)
  if (billingRelevantChanged) {
    try {
      await autoGenerateBillings(supabase, updatedCustomer, true)
    } catch (e) {
      console.error('billings 자동 생성 실패(PATCH):', e instanceof Error ? e.message : e)
    }
  }

  // Phase 27-AR: 담당자(assigned_user_id) 변경을 linked application(1:1 또는 다건)의 assigned_to 로 자동 동기화.
  // 이전에 캘린더뷰가 service_applications.assigned_to 를 기준으로 잡음 제거(assigned_to NULL 자동 배제)하는
  // 로직 때문에, customers 만 담당자 지정하고 신청서엔 반영 안 되어 캘린더에서 사라지던 이슈 해결.
  if ('assigned_user_id' in rest) {
    try {
      const targetUserId = (rest.assigned_user_id as string | null) || null
      await supabase
        .from('service_applications')
        .update({ assigned_to: targetUserId })
        .eq('customer_id', id)
        .is('deleted_at', null)
        .is('archived_at', null)
    } catch (e) {
      console.error('담당자 application 동기화 실패:', e instanceof Error ? e.message : e)
    }
  }

  // Phase 27-AT: 금액(supply_amount/vat/payment_method) 을 linked application 으로 자동 동기화.
  // 1회성케어만 대상 — 정기딥/정기엔드는 회차별 금액이 다를 수 있어 무조건 동기화하면 캘린더 다중 카운트 발생.
  // 캘린더뷰(computeAppAmount) 가 service_applications 의 supply_amount 를 기준으로 하기 때문에
  // customers 만 금액 수정하고 신청서에는 반영 안 되면 일일 합계에 0으로 잡히던 이슈 해결.
  if (updatedCustomer.customer_type === '1회성케어') {
    const amountRelevantChanged = ['supply_amount', 'vat', 'payment_method'].some(k => k in rest)
    if (amountRelevantChanged) {
      try {
        const patch: Record<string, unknown> = {}
        if ('supply_amount' in rest) patch.supply_amount = rest.supply_amount
        if ('vat' in rest) patch.vat = rest.vat
        if ('payment_method' in rest) patch.payment_method = rest.payment_method
        await supabase
          .from('service_applications')
          .update(patch)
          .eq('customer_id', id)
          .is('deleted_at', null)
          .is('archived_at', null)
      } catch (e) {
        console.error('금액 application 동기화 실패:', e instanceof Error ? e.message : e)
      }
    }
  }

  // Phase 27-AG: 1회성·일반일정은 이번달 일정 섹션이 없어 시공일자를 세부화면 상단에서 직접 편집.
  // 이 경우 next_visit_date 변경을 linked application 의 construction_date 로 자동 동기화.
  // Fix: .limit(1) + order로 최신 앱 1개만 사용 (반복 방문 고객의 다수 앱 문제 해결).
  const isOneShot = updatedCustomer.customer_type === '1회성케어' || updatedCustomer.customer_type === '일반일정'
  if ('next_visit_date' in rest && isOneShot) {
    try {
      const { data: linkedApps } = await supabase
        .from('service_applications')
        .select('id, construction_date')
        .eq('customer_id', id)
        .is('deleted_at', null)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
      if (linkedApps && linkedApps.length === 1) {
        const targetApp = linkedApps[0]
        const newDate = (rest.next_visit_date as string | null) || null
        if (targetApp.construction_date !== newDate) {
          await supabase.from('service_applications').update({ construction_date: newDate }).eq('id', targetApp.id)
        }
      }
    } catch (e) {
      console.error('시공일자 application 동기화 실패:', e instanceof Error ? e.message : e)
    }
  }

  // Phase 27-AH: worker_ids 배열이 들어오면 linked application 의 work_assignments 다중 배정 동기화.
  // 1회성/일반일정에서 다중 작업자 배정 지원 — 정기는 이번달 일정 섹션에서 회차별 배정.
  // Fix: .limit(1) + order로 최신 앱 사용, construction_date 없으면 next_visit_date 폴백.
  if ('worker_ids' in rest && Array.isArray(rest.worker_ids) && isOneShot) {
    try {
      const workerIds = (rest.worker_ids as unknown[])
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      const nextVisitDate = (rest.next_visit_date as string | null) || null
      const { data: linkedApps } = await supabase
        .from('service_applications')
        .select('id, construction_date, business_name')
        .eq('customer_id', id)
        .is('deleted_at', null)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
      if (linkedApps && linkedApps.length === 1) {
        const app = linkedApps[0]
        // construction_date 없으면 next_visit_date 폴백 (work_assignments NOT NULL 제약 대응)
        const effectiveDate = app.construction_date ?? nextVisitDate
        await supabase.from('work_assignments').delete().eq('application_id', app.id)
        if (workerIds.length > 0 && effectiveDate && app.business_name) {
          const rows = workerIds.map(wid => ({
            worker_id: wid,
            application_id: app.id,
            construction_date: effectiveDate,
            business_name: app.business_name,
          }))
          await supabase.from('work_assignments').insert(rows)
        }
        // customer.assigned_worker_id 도 첫 번째 로 동기화 (하위호환)
        await supabase
          .from('customers')
          .update({ assigned_worker_id: workerIds[0] ?? null })
          .eq('id', id)
      }
    } catch (e) {
      console.error('worker_ids 동기화 실패:', e instanceof Error ? e.message : e)
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

  return NextResponse.json({ success: true })
}
