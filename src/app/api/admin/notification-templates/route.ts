import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

/**
 * Phase 25: 알림 템플릿 CRUD
 * - GET   ?scope=customer|application&type=1회성케어&location=customer_detail
 * - POST  { code, scope, applicable_types, applicable_locations, category, title, subject, body }
 * - PATCH { id, ...fields } — 시스템 템플릿은 body/subject/title/is_active만 수정 가능
 * - DELETE ?id=... — is_system=true는 삭제 불가
 */

export async function GET(request: NextRequest) {
  const session = getServerSession()
  if (session?.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const scope = searchParams.get('scope')
  const type = searchParams.get('type')
  const location = searchParams.get('location')
  const activeOnly = searchParams.get('active_only') === 'true'

  const supabase = createServiceClient()
  let query = supabase.from('notification_templates').select('*').order('category').order('title')

  if (scope) query = query.eq('scope', scope)
  if (activeOnly) query = query.eq('is_active', true)
  if (type) query = query.contains('applicable_types', [type])
  if (location) query = query.contains('applicable_locations', [location])

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data })
}

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (session?.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const required = ['code', 'scope', 'title', 'body']
  for (const k of required) {
    if (!body[k]) return NextResponse.json({ error: `${k}는 필수입니다.` }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('notification_templates')
    .insert({
      code: body.code,
      scope: body.scope,
      applicable_types: body.applicable_types ?? [],
      applicable_locations: body.applicable_locations ?? [],
      category: body.category ?? null,
      title: body.title,
      subject: body.subject ?? null,
      body: body.body,
      is_active: body.is_active ?? true,
      is_system: false,
      updated_by: session.userId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const session = getServerSession()
  if (session?.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { id, ...rest } = body
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const supabase = createServiceClient()

  // 시스템 템플릿 여부 확인 → 수정 가능 필드 제한
  const { data: existing } = await supabase
    .from('notification_templates')
    .select('is_system')
    .eq('id', id)
    .single()

  const SYSTEM_EDITABLE = new Set(['title', 'subject', 'body', 'is_active', 'category',
    'applicable_types', 'applicable_locations'])
  const ALL_EDITABLE = new Set([...SYSTEM_EDITABLE, 'code', 'scope'])

  // Phase 25c: auto_used 템플릿은 is_active 잠금 (본문·제목만 편집)
  const { data: existingFull } = await supabase
    .from('notification_templates')
    .select('is_system, auto_used')
    .eq('id', id)
    .single()

  const editable = existingFull?.is_system ? SYSTEM_EDITABLE : ALL_EDITABLE
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: session.userId }
  for (const key of Object.keys(rest)) {
    if (!editable.has(key)) continue
    // auto_used면 is_active 변경 무시 (항상 true 유지)
    if (existingFull?.auto_used && key === 'is_active') continue
    updates[key] = rest[key]
  }

  const { data, error } = await supabase
    .from('notification_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data })
}

export async function DELETE(request: NextRequest) {
  const session = getServerSession()
  if (session?.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('notification_templates')
    .select('is_system, auto_used')
    .eq('id', id)
    .single()

  if (existing?.auto_used) {
    return NextResponse.json({ error: '자동 발송용 템플릿은 삭제할 수 없습니다. 자동화 로직이 참조 중입니다.' }, { status: 400 })
  }
  if (existing?.is_system) {
    return NextResponse.json({ error: '시스템 기본 템플릿은 삭제할 수 없습니다. 비활성화하세요.' }, { status: 400 })
  }

  const { error } = await supabase.from('notification_templates').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
