import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createAuthUser, updateAuthUserEmailAndPassword, customerEmail } from '@/lib/auth-helpers'
import crypto from 'crypto'

const ALLOWED = [
  // 일반정보
  'business_name', 'contact_name', 'contact_phone', 'email',
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
  // 담당 직원/작업자
  'assigned_user_id', 'assigned_worker_id',
  // 성향
  'disposition',
]

// 읽기 쉬운 8자리 난수 비밀번호 (혼동하기 쉬운 I, O, 0, 1 제외)
function generateRandomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let pw = ''
  for (let i = 0; i < 8; i++) {
    pw += chars[crypto.randomInt(chars.length)]
  }
  return pw
}

async function createPortalAccount(
  supabase: ReturnType<typeof createServiceClient>,
  customerId: string,
  phone: string,
  name: string,
): Promise<string> {
  const normalizedPhone = phone.replace(/-/g, '')
  const email = customerEmail(normalizedPhone)
  const password = generateRandomPassword()

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

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, contact_phone, email, address, address_detail, business_number, account_number, platform_nickname, payment_method, elevator, building_access, access_method, business_hours_start, business_hours_end, door_password, parking_info, special_notes, care_scope, pipeline_status, customer_type, status, disposition, billing_cycle, billing_amount, supply_amount, vat, deposit, balance, billing_start_date, billing_next_date, contract_start_date, contract_end_date, unit_price, visit_interval_days, next_visit_date, visit_schedule_type, visit_weekdays, visit_monthly_dates, notes, rotation_type, visit_count_per_month, payment_status, payment_date, schedule_generation_day, assigned_user_id, assigned_worker_id, created_at, updated_at')
    .is('deleted_at', null)
    .order('business_name', { ascending: true })

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
    return NextResponse.json({ success: true, skipped: true, data: existing })
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
      generatedPassword = await createPortalAccount(supabase, data.id, body.contact_phone, name)
    } catch (e) {
      // 포털 계정 생성 실패해도 고객 등록은 성공 처리
      console.error('포털 계정 자동 생성 실패:', e instanceof Error ? e.message : e)
    }
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

  const { data: updatedCustomer, error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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
