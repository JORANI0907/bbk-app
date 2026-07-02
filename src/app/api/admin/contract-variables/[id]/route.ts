import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

interface RouteParams {
  params: { id: string }
}

// PATCH — 변수 수정 (시스템 변수는 name 변경 불가)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ success: false, error: '권한이 없습니다.' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('contract_variables')
    .select('id, name, is_system')
    .eq('id', params.id)
    .single()

  if (!existing) {
    return NextResponse.json({ success: false, error: '변수를 찾을 수 없습니다.' }, { status: 404 })
  }

  const updates: Record<string, unknown> = {}
  if (typeof body.label === 'string') updates.label = body.label.trim()
  if (typeof body.description === 'string') updates.description = body.description.trim()
  if (body.mode === 'auto' || body.mode === 'manual') updates.mode = body.mode
  if ('auto_field' in body) updates.auto_field = body.auto_field ? String(body.auto_field).trim() : null

  // 시스템 변수가 아니면 name 변경 허용
  if (!existing.is_system && typeof body.name === 'string') {
    const normalized = body.name.toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
    if (normalized) updates.name = normalized
  }

  if (updates.mode === 'auto' && updates.auto_field === null) {
    return NextResponse.json({ success: false, error: '자동 변수는 매핑 필드를 선택해야 합니다.' }, { status: 400 })
  }
  if (updates.mode === 'manual') updates.auto_field = null

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: '수정할 필드가 없습니다.' }, { status: 400 })
  }

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('contract_variables')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ success: false, error: '이미 존재하는 변수명입니다.' }, { status: 409 })
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, data })
}

// DELETE — 커스텀 변수만 삭제 가능 (is_system=true는 403)
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ success: false, error: '권한이 없습니다.' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('contract_variables')
    .select('id, is_system')
    .eq('id', params.id)
    .single()

  if (!existing) {
    return NextResponse.json({ success: false, error: '변수를 찾을 수 없습니다.' }, { status: 404 })
  }
  if (existing.is_system) {
    return NextResponse.json({ success: false, error: '시스템 기본 변수는 삭제할 수 없습니다.' }, { status: 403 })
  }

  const { error } = await supabase
    .from('contract_variables')
    .delete()
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
