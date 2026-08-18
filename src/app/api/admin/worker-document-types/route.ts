import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

interface DocTypeInput {
  value: string
  label: string
  hint?: string | null
  is_other?: boolean
  is_active?: boolean
}

/**
 * 서류 유형 마스터 조회. 관리자 인증 필요.
 * 요청 모달·기존 요청 상세 UI 에서 라벨 표시용으로 사용.
 */
export async function GET() {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('worker_document_types')
    .select('id, value, label, hint, sort_order, is_active, is_other')
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ types: data ?? [] })
}

/**
 * 서류 유형 마스터 전체 저장 (관리자 전용).
 * 편집 UI 에서 항목 추가/수정/삭제/순서변경 후 전체 배열을 통째로 PUT.
 * value 기준으로 upsert 하고, 이번 저장에 없는 기존 value 는 is_active=false 로 soft-delete.
 * (하드 삭제 안 함 — 기존 요청 이력의 document_label 스냅샷은 이미 저장되어 있어 표시엔 영향 없지만
 *  안전을 위해 마스터 레코드는 보존.)
 */
export async function PUT(request: NextRequest) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (session.role !== 'admin') {
    return NextResponse.json({ error: '관리자만 편집할 수 있습니다.' }, { status: 403 })
  }

  const body = await request.json()
  const items: DocTypeInput[] = Array.isArray(body?.types) ? body.types : []

  // 검증
  if (items.length === 0) {
    return NextResponse.json({ error: '최소 1개 이상 필요합니다.' }, { status: 400 })
  }
  const values = new Set<string>()
  for (const it of items) {
    if (!it.value?.trim() || !it.label?.trim()) {
      return NextResponse.json({ error: 'value 와 label 은 필수입니다.' }, { status: 400 })
    }
    if (!/^[a-z0-9_]+$/.test(it.value)) {
      return NextResponse.json({ error: `value 는 소문자·숫자·언더스코어만 허용됩니다: ${it.value}` }, { status: 400 })
    }
    if (values.has(it.value)) {
      return NextResponse.json({ error: `중복된 value: ${it.value}` }, { status: 400 })
    }
    values.add(it.value)
  }

  const supabase = createServiceClient()

  // upsert (value 기준) + sort_order 는 배열 순서
  const upsertRows = items.map((it, idx) => ({
    value:      it.value.trim(),
    label:      it.label.trim(),
    hint:       it.hint?.trim() || null,
    sort_order: idx + 1,
    is_other:   !!it.is_other,
    is_active:  it.is_active ?? true,
    updated_at: new Date().toISOString(),
  }))

  const { error: upsertErr } = await supabase
    .from('worker_document_types')
    .upsert(upsertRows, { onConflict: 'value' })

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  // 이번 저장에 없는 기존 value 는 soft-delete (is_active=false)
  const { data: allExisting } = await supabase
    .from('worker_document_types')
    .select('value')
  const existingValues = new Set((allExisting ?? []).map(r => r.value as string))
  const toDeactivate = Array.from(existingValues).filter(v => !values.has(v))
  if (toDeactivate.length > 0) {
    await supabase
      .from('worker_document_types')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in('value', toDeactivate)
  }

  const { data: finalRows } = await supabase
    .from('worker_document_types')
    .select('id, value, label, hint, sort_order, is_active, is_other')
    .order('sort_order', { ascending: true })

  return NextResponse.json({ types: finalRows ?? [], deactivated: toDeactivate })
}
