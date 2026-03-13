import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET: 전체 사용자 목록
export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('role')
    .order('name')

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

// PATCH: 사용자 정보 수정
export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient()
  const { id, ...updates } = await request.json()

  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

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
