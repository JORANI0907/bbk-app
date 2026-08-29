import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createAuthUser, updateAuthUserPassword, updateAuthUserEmail, customerEmail, staffEmail, franchiseEmail } from '@/lib/auth-helpers'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function deleteAuthUser(authId: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authId}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.message ?? 'Auth 계정 삭제 실패')
  }
}

// GET: 사용자 목록 (활성만 기본. ?include_deleted=true 로 삭제된 사용자 포함 조회 가능)
export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const role = searchParams.get('role')
  const includeDeleted = searchParams.get('include_deleted') === 'true'

  let query = supabase.from('users').select('*').order('role').order('name')
  if (role) query = query.eq('role', role)
  if (!includeDeleted) query = query.is('deleted_at', null)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ users: data })
}

// POST: 새 사용자 등록 (관리자만)
export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const { role, name, phone, customer_id } = await request.json()

  if (!role || !name || !phone) {
    return NextResponse.json({ error: '역할, 이름, 전화번호는 필수입니다.' }, { status: 400 })
  }

  const normalized = phone.replace(/-/g, '')
  if (!/^(010|011|016|017|018|019)\d{7,8}$/.test(normalized)) {
    return NextResponse.json({ error: '올바른 전화번호 형식이 아닙니다.' }, { status: 400 })
  }

  // 중복 확인 — 활성 사용자만 대상 (소프트 삭제된 사용자와 같은 전화번호 재등록 허용)
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('phone', normalized)
    .is('deleted_at', null)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: '이미 등록된 전화번호입니다.' }, { status: 409 })
  }

  // 역할별 가상 이메일 도메인 — 로그인 라우트와 일치해야 함
  // admin/worker → @bbkorea.co.kr, customer → @bbkorea.app, franchise_hq → @bbkorea.hq
  const virtualEmail = role === 'customer'
    ? customerEmail(normalized)
    : role === 'franchise_hq'
      ? franchiseEmail(normalized)
      : staffEmail(normalized)

  // 초기 비밀번호 — B안 정책: 관리자·직원·고객 모두 {전화번호}만
  // (본사는 별도 API /api/admin/franchise-hq/issue-account에서 사업자번호로 처리)
  const initialPassword = normalized

  // Auth 계정 생성
  let authId: string | null = null
  try {
    const authUser = await createAuthUser(virtualEmail, initialPassword, { role, name })
    authId = authUser.id
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Auth 계정 생성 실패'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('users')
    // approved_at: 관리자가 직접 등록하면 이미 승인된 상태로 기록. 자가가입(현재 비활성)만 null 유지.
    .insert({ role, name, phone: normalized, email: virtualEmail, auth_id: authId, is_active: true, password_hint: initialPassword, approved_at: new Date().toISOString() })
    .select()
    .single()

  if (error) {
    await deleteAuthUser(authId!).catch(() => {})
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 고객 DB와 연결
  if (customer_id && role === 'customer') {
    await supabase.from('customers').update({ user_id: data.id }).eq('id', customer_id)
  }

  return NextResponse.json({ user: data }, { status: 201 })
}

// PATCH: 사용자 정보 수정 또는 비밀번호 초기화
export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { id, reset_password, new_password, ...updates } = body

  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  // 비밀번호 설정 또는 변경 — A안 정책: 최소 6자(자동생성 {phone}bbk 기준 11자 이상)
  if (reset_password && new_password) {
    if (new_password.length < 6) {
      return NextResponse.json({ error: '비밀번호는 6자 이상이어야 합니다.' }, { status: 400 })
    }
    const { data: user } = await supabase
      .from('users')
      .select('auth_id, email, phone, role, name')
      .eq('id', id)
      .single()

    if (!user) return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })

    try {
      if (user.auth_id) {
        await updateAuthUserPassword(user.auth_id, new_password)
      } else {
        // Auth 계정 없음 → 역할별 가상 이메일로 신규 생성 (로그인 라우트와 일치)
        const phone = (user.phone ?? '').replace(/-/g, '')
        const email = user.email ?? (user.role === 'customer'
          ? customerEmail(phone)
          : user.role === 'franchise_hq'
            ? franchiseEmail(phone)
            : staffEmail(phone))
        const newAuthUser = await createAuthUser(email, new_password, { role: user.role, name: user.name })
        await supabase.from('users').update({ auth_id: newAuthUser.id, email, password_hint: new_password }).eq('id', id)
        return NextResponse.json({ success: true })
      }
      // password_hint 동기화 — 회원관리 UI 표시와 실제 비번 일치 보장
      await supabase.from('users').update({ password_hint: new_password }).eq('id', id)
      return NextResponse.json({ success: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : '비밀번호 변경 실패'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  const phoneChanged = 'phone' in updates
  if (phoneChanged) {
    updates.phone = (updates.phone as string).replace(/-/g, '')
  }

  // phone 변경 시: Auth 이메일 먼저 동기화 (실패하면 중단)
  if (phoneChanged) {
    const { data: currentUser } = await supabase
      .from('users')
      .select('auth_id, role')
      .eq('id', id)
      .single()

    if (currentUser?.auth_id) {
      const newPhone = updates.phone as string
      const newEmail = currentUser.role === 'customer'
        ? customerEmail(newPhone)
        : currentUser.role === 'franchise_hq'
          ? franchiseEmail(newPhone)
          : staffEmail(newPhone)
      try {
        await updateAuthUserEmail(currentUser.auth_id, newEmail)
        updates.email = newEmail
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Auth 이메일 업데이트 실패'
        return NextResponse.json({ error: msg }, { status: 500 })
      }
    }
  }

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // phone 변경 시: 연결된 customers/workers DB 동기화
  if (phoneChanged && data) {
    const newPhone = data.phone as string
    if (data.role === 'customer') {
      await supabase
        .from('customers')
        .update({ contact_phone: newPhone })
        .eq('user_id', id)
    } else {
      await supabase
        .from('workers')
        .update({ phone: newPhone })
        .eq('user_id', id)
    }
  }

  return NextResponse.json({ user: data })
}

// DELETE: 사용자 소프트 삭제 (Auth 계정만 즉시 삭제, users row 는 deleted_at 세팅으로 보존)
// 이유: users 하드 삭제 시 payroll_records / incident_reports / 급여정산 이력이 매핑을 잃어
//       과거 급여·경위서 조회에서 사라져 보이는 문제가 있었음.
//       Auth 는 즉시 삭제해 로그인은 차단하고, users row 는 남겨 과거 이력 보존.
export async function DELETE(request: NextRequest) {
  const supabase = createServiceClient()
  const { id } = await request.json()

  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const { data: user } = await supabase
    .from('users')
    .select('auth_id, role, name, deleted_at')
    .eq('id', id)
    .single()

  if (!user) return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })
  if (user.deleted_at) return NextResponse.json({ error: '이미 삭제된 사용자입니다.' }, { status: 400 })

  if (user.auth_id) {
    try {
      await deleteAuthUser(user.auth_id)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Auth 삭제 실패'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  // 소프트 삭제 — deleted_at 세팅 + is_active=false 로 활성 조회에서 자동 제외.
  // auth_id 는 null 로 지워서 향후 같은 전화번호로 재가입 시 unique 충돌 방지.
  const { error } = await supabase
    .from('users')
    .update({ deleted_at: new Date().toISOString(), is_active: false, auth_id: null })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
