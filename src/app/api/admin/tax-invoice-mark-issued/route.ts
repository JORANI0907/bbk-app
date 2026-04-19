import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization')
  const bearerOk = !!CRON_SECRET && auth === `Bearer ${CRON_SECRET}`
  const session = getServerSession()
  const sessionOk = session?.role === 'admin'

  if (!bearerOk && !sessionOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const rawIds = body.application_ids
  const ids: string[] = Array.isArray(rawIds)
    ? rawIds.filter((v): v is string => typeof v === 'string' && v.length > 0)
    : typeof rawIds === 'string' && rawIds.length > 0
      ? [rawIds]
      : []

  if (ids.length === 0) {
    return NextResponse.json({ error: 'application_ids 필수 (배열 또는 문자열)' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const issuedAt = new Date().toISOString()

  // 상태 '계산서발행완료' 로 전환 — 다음 주기 조회에서 자동 제외됨 (중복 방지)
  const { data, error } = await supabase
    .from('service_applications')
    .update({ status: '계산서발행완료' })
    .in('id', ids)
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // invoice_logs 에도 기록 (감사용)
  const updatedIds = (data ?? []).map(r => r.id as string)
  if (updatedIds.length > 0) {
    await supabase
      .from('invoice_logs')
      .insert({
        issued_at: issuedAt,
        count: updatedIds.length,
        file_url: body.file_url ?? null,
        notes: body.notes ?? '자동 발행 (Make)',
        application_ids: updatedIds,
        issued_by: null,
      })
  }

  return NextResponse.json({
    ok: true,
    updated: updatedIds.length,
    application_ids: updatedIds,
  })
}
