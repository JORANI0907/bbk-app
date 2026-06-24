import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { updateAuthUserEmail, staffEmail } from '@/lib/auth-helpers'

const ALLOWED_COLUMNS = [
  'name', 'employment_type', 'phone', 'account_number',
  'department', 'position', 'job_title', 'email', 'join_date',
  'skill_level', 'specialties', 'day_wage', 'night_wage', 'avg_salary',
  'anniversary', 'hobby', 'home_address', 'emergency_contact', 'personal_id',
  'photo_url', 'birth_date', 'gender', 'blood_type',
]

export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)

  // 앱 계정 목록 조회 (연결 드롭다운용)
  if (searchParams.get('accounts') === 'true') {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, phone')
      .eq('role', 'worker')
      .order('name')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ accounts: data ?? [] })
  }

  const employment_type = searchParams.get('employment_type')
  const search = searchParams.get('search')

  let query = supabase
    .from('workers')
    .select('*')
    .order('created_at', { ascending: false })

  if (employment_type) {
    query = query.eq('employment_type', employment_type)
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ workers: data })
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()

  const insert: Record<string, unknown> = {}
  for (const key of ALLOWED_COLUMNS) {
    if (key in body) insert[key] = body[key]
  }

  if (!insert.name) {
    return NextResponse.json({ error: '이름은 필수입니다.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('workers')
    .insert(insert)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ worker: data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { id, user_id, ...rest } = body

  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
  }

  const phoneChanged = 'phone' in rest

  // phone 변경 전 현재 worker의 user_id 조회
  let existingUserId: string | null = null
  if (phoneChanged) {
    const { data: currentWorker } = await supabase
      .from('workers')
      .select('user_id')
      .eq('id', id)
      .single()
    existingUserId = currentWorker?.user_id ?? null
  }

  const updates: Record<string, unknown> = {}

  // user_id는 별도 처리 (null 허용 — 연결 해제 지원)
  if ('user_id' in body) {
    updates.user_id = user_id ?? null
  }

  for (const key of ALLOWED_COLUMNS) {
    if (key in rest) updates[key] = rest[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '업데이트할 필드가 없습니다.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('workers')
    .update(updates)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // phone 변경 시 users + Auth 동기화 (실패해도 직원 정보 수정은 성공)
  if (phoneChanged && existingUserId) {
    const newPhone = ((rest.phone as string) ?? '').replace(/-/g, '')
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
        await updateAuthUserEmail(userRow.auth_id, staffEmail(newPhone))
      }
    } catch (e) {
      console.error('직원 전화번호 동기화 실패:', e instanceof Error ? e.message : e)
    }
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { id } = body

  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('workers')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
