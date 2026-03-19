import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createAuthUser, updateAuthUserPassword } from '@/lib/auth-helpers'

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

// GET: 전체 사용자 목록 (role 필터 지원)
export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const role = searchParams.get('role')

  let query = supabase.from('users').select('*').order('role').order('name')
  if (role) query = query.eq('role', role)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ users: data })
}

// POST: 새 사용자 등록 (관리자만)
export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const { role, name, phone, email } = await request.json()

  if (!role || !name || !phone) {
    return NextResponse.json({ error: '역할, 이름, 전화번호는 필수입니다.' }, { status: 400 })
  }

  const normalized = phone.replace(/-/g, '')
  if (!/^(010|011|016|017|018|019)\d{7,8}$/.test(normalized)) {
    return NextResponse.json({ error: '올바른 전화번호 형식이 아닙니다.' }, { status: 400 })
  }

  // 중복 확인
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('phone', normalized)
    .single()

  if (existing) {
    return NextResponse.json({ error: '이미 등록된 전화번호입니다.' }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('users')
    .insert({ role, name, phone: normalized, email: email || null, is_active: true })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ user: data }, { status: 201 })
}

// PATCH: 사용자 정보 수정 또는 비밀번호 초기화
export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { id, reset_password, new_password, ...updates } = body

  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  // 비밀번호 설정 또는 변경
  if (reset_password && new_password) {
    if (new_password.length < 8) {
      return NextResponse.json({ error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 })
    }
    const { data: user } = await supabase
      .from('users')
      .select('auth_id, email, phone, role, name')
      .eq('id', id)
      .single()

    if (!user) return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })

    try {
      if (user.auth_id) {
        // 기존 Auth 계정 비밀번호 변경
        await updateAuthUserPassword(user.auth_id, new_password)
      } else {
        // Auth 계정 없음 → 신규 생성
        const email = user.email ?? `${(user.phone ?? '').replace(/-/g, '')}@bbkorea.app`
        const newAuthUser = await createAuthUser(email, new_password, { role: user.role, name: user.name })
        // users 테이블에 auth_id + email 연결
        await supabase
          .from('users')
          .update({ auth_id: newAuthUser.id, email })
          .eq('id', id)
      }
      return NextResponse.json({ success: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : '비밀번호 변경 실패'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  if (updates.phone) {
    updates.phone = updates.phone.replace(/-/g, '')
  }

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ user: data })
}

// DELETE: 사용자 삭제 (Auth 계정 포함)
export async function DELETE(request: NextRequest) {
  const supabase = createServiceClient()
  const { id } = await request.json()

  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const { data: user } = await supabase
    .from('users')
    .select('auth_id, role, name')
    .eq('id', id)
    .single()

  if (!user) return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })

  // Auth 계정 삭제
  if (user.auth_id) {
    try {
      await deleteAuthUser(user.auth_id)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Auth 삭제 실패'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  // users 테이블에서 삭제
  const { error } = await supabase.from('users').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
