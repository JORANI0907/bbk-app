import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

/**
 * Phase 28: 알림 템플릿 CRUD — send_mode / is_locked 기반 잠금 체계
 * - GET   ?scope=customer|application&type=1회성케어&location=customer_detail
 * - POST  { code, scope, applicable_types, applicable_locations, category, title, body, send_mode? }
 * - PATCH { id, ...fields } — is_locked=true 시 body/title/subject/category 만 비잠금 편집 가능
 * - DELETE ?id=... — is_locked=true 또는 is_system=true 는 삭제 불가
 */

export async function GET(request: NextRequest) {
  const session = getServerSession()
  if (session?.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const scope = searchParams.get('scope')
  const type = searchParams.get('type')
  const location = searchParams.get('location')
  const activeOnly = searchParams.get('active_only') === 'true'
  const sendMode = searchParams.get('send_mode')

  const supabase = createServiceClient()
  let query = supabase.from('notification_templates').select('*').order('send_mode').order('category').order('title')

  if (scope) query = query.eq('scope', scope)
  if (activeOnly) query = query.eq('is_active', true)
  if (type) query = query.contains('applicable_types', [type])
  if (location) query = query.contains('applicable_locations', [location])
  if (sendMode) query = query.eq('send_mode', sendMode)

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

  const sendMode = body.send_mode ?? 'manual'
  const isLocked = sendMode === 'auto' || sendMode === 'semi_auto'
  const autoUsed = sendMode === 'auto'

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
      auto_used: autoUsed,
      send_mode: sendMode,
      is_locked: isLocked,
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

  const { data: existing } = await supabase
    .from('notification_templates')
    .select('is_system, is_locked, send_mode')
    .eq('id', id)
    .single()

  // 시스템 템플릿: 일부 필드만 편집 허용
  const SYSTEM_EDITABLE = new Set([
    'title', 'subject', 'body', 'is_active', 'category',
    'applicable_types', 'applicable_locations',
    'send_mode', 'is_locked', 'auto_used',
    'linked_progress_status', 'linked_payment_status',
  ])
  const ALL_EDITABLE = new Set([...SYSTEM_EDITABLE, 'code', 'scope'])
  const editable = existing?.is_system ? SYSTEM_EDITABLE : ALL_EDITABLE

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: session.userId,
  }

  for (const key of Object.keys(rest)) {
    if (!editable.has(key)) continue
    updates[key] = rest[key]
  }

  // send_mode 변경 시 auto_used / is_locked 자동 동기화
  if ('send_mode' in updates) {
    const newMode = updates.send_mode as string
    updates.auto_used = newMode === 'auto'
    updates.is_locked = newMode === 'auto' || newMode === 'semi_auto'
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
    .select('is_system, is_locked, title')
    .eq('id', id)
    .single()

  if (existing?.is_locked) {
    return NextResponse.json({ error: '자동·반자동 템플릿은 삭제할 수 없습니다. 발송 로직이 참조 중입니다.' }, { status: 400 })
  }
  if (existing?.is_system) {
    return NextResponse.json({ error: '시스템 기본 템플릿은 삭제할 수 없습니다.' }, { status: 400 })
  }

  const { error } = await supabase.from('notification_templates').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
