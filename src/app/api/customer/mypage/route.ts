import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { signInWithPassword, updateAuthUserPassword, customerEmail } from '@/lib/auth-helpers'

// GET: 마이페이지 정보 조회 (유저 + 고객사)
export async function GET(_request: NextRequest) {
  const session = getServerSession()
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, name, phone, email, role')
    .eq('id', session.userId)
    .single()

  if (userError || !user) {
    return NextResponse.json({ error: '사용자 정보를 찾을 수 없습니다.' }, { status: 404 })
  }

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select(
      'id, business_name, contact_name, contact_phone, email, address, address_detail, ' +
      'business_number, customer_type, status, pipeline_status, ' +
      'contract_start_date, contract_end_date, billing_next_date, billing_cycle, ' +
      'care_scope, special_notes, payment_method, ' +
      'next_visit_date, visit_interval_days'
    )
    .eq('user_id', user.id)
    .single()

  if (customerError && customerError.code !== 'PGRST116') {
    return NextResponse.json({ error: customerError.message }, { status: 500 })
  }

  return NextResponse.json({ user, customer: customer ?? null })
}

// PATCH: 비밀번호 변경
export async function PATCH(request: NextRequest) {
  const session = getServerSession()
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const body: { current_password?: string; new_password?: string } = await request.json()
  const { current_password, new_password } = body

  if (!current_password || !new_password) {
    return NextResponse.json({ error: '현재 비밀번호와 새 비밀번호를 입력해주세요.' }, { status: 400 })
  }

  if (new_password.length < 8) {
    return NextResponse.json({ error: '새 비밀번호는 8자 이상이어야 합니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('auth_id, email, phone')
    .eq('id', session.userId)
    .single()

  if (userError || !user) {
    return NextResponse.json({ error: '사용자 정보를 찾을 수 없습니다.' }, { status: 404 })
  }

  const loginEmail = user.email ?? customerEmail((user.phone ?? '').replace(/-/g, ''))

  try {
    await signInWithPassword(loginEmail, current_password)
  } catch {
    return NextResponse.json({ error: '현재 비밀번호가 올바르지 않습니다.' }, { status: 400 })
  }

  if (!user.auth_id) {
    return NextResponse.json({ error: '연결된 인증 계정이 없습니다.' }, { status: 400 })
  }

  try {
    await updateAuthUserPassword(user.auth_id, new_password)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '비밀번호 변경에 실패했습니다.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
