import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

interface RouteParams {
  params: { id: string }
}

// GET /api/admin/contract-templates/[id] — 단일 템플릿 조회 (html_body 포함)
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('contract_templates')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ success: false, error: error.message }, { status })
  }

  return NextResponse.json({ success: true, data })
}

// PATCH /api/admin/contract-templates/[id] — 템플릿 수정
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const supabase = createServiceClient()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const ALLOWED = ['name', 'description', 'html_body', 'is_active', 'custom_vars'] as const
  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: '수정할 필드가 없습니다.' }, { status: 400 })
  }

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('contract_templates')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ success: false, error: error.message }, { status })
  }

  return NextResponse.json({ success: true, data })
}

// DELETE /api/admin/contract-templates/[id] — 템플릿 삭제
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('contract_templates')
    .delete()
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
