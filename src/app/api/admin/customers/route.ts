import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createAuthUser, updateAuthUserEmailAndPassword, updateAuthUserEmail, customerEmail } from '@/lib/auth-helpers'
import { generateBillingSchedule, computeBillingAmountFromCustomer, shouldAutoGenerateBillings } from '@/lib/billing-generator'

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
  'progress_status', 'payment_status_detail',
  // Phase 20-C: 투입주기 (몇 개월에 1회)
  'injection_cycle_months',
  // 담당 직원/작업자
  'assigned_user_id', 'assigned_worker_id',
  // 성향
  'disposition',
  // 고객 등급
  'grade',
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
): Promise<{ inserted: number; skipped: number }> {
  // Phase 23: 일시정지 고객은 청구 생성 skip
  if (customer.status === 'paused') return { inserted: 0, skipped: 0 }
  const amount = computeBillingAmountFromCustomer(customer)
  const input = {
    customerType: customer.customer_type,
    billingCycle: customer.billing_cycle,
    contractStartDate: customer.contract_start_date,
    contractEndDate: customer.contract_end_date,
    paymentDay: customer.payment_date,
    billingAmount: amount,
  }
  if (!shouldAutoGenerateBillings(input)) return { inserted: 0, skipped: 0 }

  const schedule = generateBillingSchedule(input)
  if (schedule.length === 0) return { inserted: 0, skipped: 0 }

  // 기존 청구 기간 조회
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
    .select('id, business_name, contact_name, contact_phone, contact_phone_2, email, address, address_detail, business_number, account_number, platform_nickname, payment_method, elevator, building_access, access_method, business_hours_start, business_hours_end, door_password, parking_info, special_notes, care_scope, pipeline_status, customer_type, status, disposition, billing_cycle, billing_amount, supply_amount, vat, deposit, balance, billing_start_date, billing_next_date, contract_start_date, contract_end_date, unit_price, visit_interval_days, next_visit_date, visit_schedule_type, visit_weekdays, visit_monthly_dates, notes, rotation_type, visit_count_per_month, payment_status, payment_date, schedule_generation_day, assigned_user_id, assigned_worker_id, user_id, account_user_id, progress_status, payment_status_detail, injection_cycle_months, archived_at, archived_by, created_at, updated_at')
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
  return NextResponse.json({ customers: data })
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

  // Phase 22 v11: 계약 관련 필드가 변경됐거나 계약 조건이 충족되면 billings 자동 생성/추가 (idempotent)
  const billingRelevantChanged = ['billing_cycle', 'contract_start_date', 'contract_end_date',
    'payment_date', 'supply_amount', 'vat', 'billing_amount', 'payment_method', 'customer_type']
    .some(k => k in rest)
  if (billingRelevantChanged) {
    try {
      await autoGenerateBillings(supabase, updatedCustomer)
    } catch (e) {
      console.error('billings 자동 생성 실패(PATCH):', e instanceof Error ? e.message : e)
    }
  }

  // Phase 27-AG: 1회성·일반일정은 이번달 일정 섹션이 없어 시공일자를 세부화면 상단에서 직접 편집.
  // 이 경우 next_visit_date 변경을 linked application 의 construction_date 로 자동 동기화.
  // 정기딥/엔드는 이번달 일정 섹션에서 회차별로 편집하므로 이 로직 스킵.
  if ('next_visit_date' in rest &&
      (updatedCustomer.customer_type === '1회성케어' || updatedCustomer.customer_type === '일반일정')) {
    try {
      // 해당 customer 의 유일한 활성 application 찾기 (1회성은 1:1)
      const { data: linkedApps } = await supabase
        .from('service_applications')
        .select('id, construction_date')
        .eq('customer_id', id)
        .is('deleted_at', null)
        .is('archived_at', null)
        .limit(2)   // 유일성 확인용

      if (linkedApps && linkedApps.length === 1) {
        const targetApp = linkedApps[0]
        const newDate = (rest.next_visit_date as string | null) || null
        if (targetApp.construction_date !== newDate) {
          await supabase
            .from('service_applications')
            .update({ construction_date: newDate })
            .eq('id', targetApp.id)
        }
      }
      // linkedApps.length !== 1 이면 애매하므로 스킵 (분리 마이그레이션 후엔 항상 1이어야 정상)
    } catch (e) {
      console.error('시공일자 application 동기화 실패:', e instanceof Error ? e.message : e)
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
