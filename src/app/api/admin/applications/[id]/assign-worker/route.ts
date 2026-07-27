import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * Phase 2: application에 작업자 단일 배정 (기존 assignments 정리 + 새로 insert)
 * POST /api/admin/applications/{id}/assign-worker
 * body: { worker_id: string | null }
 *   - worker_id === null 이면 배정 해제만 수행
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const applicationId = params.id
  if (!applicationId) {
    return NextResponse.json({ error: 'application id가 필요합니다.' }, { status: 400 })
  }

  let body: { worker_id?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON body 파싱 실패' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 1) application 조회 (construction_date, business_name 필요 — work_assignments 저장 시 필수)
  const { data: app, error: appErr } = await supabase
    .from('service_applications')
    .select('id, construction_date, business_name')
    .eq('id', applicationId)
    .is('deleted_at', null)
    .single()

  if (appErr || !app) {
    return NextResponse.json({ error: '신청서를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 2) 기존 assignments 삭제
  const { error: delErr } = await supabase
    .from('work_assignments')
    .delete()
    .eq('application_id', applicationId)

  if (delErr) {
    return NextResponse.json({ error: `기존 배정 삭제 실패: ${delErr.message}` }, { status: 500 })
  }

  // 3) 배정 해제 요청이면 삭제만 하고 종료
  if (!body.worker_id) {
    return NextResponse.json({ success: true, worker_id: null })
  }

  // 4) 새 assignment insert
  if (!app.construction_date || !app.business_name) {
    return NextResponse.json(
      { error: '시공일자 또는 업체명이 비어있어 배정할 수 없습니다.' },
      { status: 400 },
    )
  }

  const { error: insErr } = await supabase
    .from('work_assignments')
    .insert({
      worker_id: body.worker_id,
      application_id: applicationId,
      construction_date: app.construction_date,
      business_name: app.business_name,
    })

  if (insErr) {
    return NextResponse.json({ error: `배정 실패: ${insErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ success: true, worker_id: body.worker_id })
}
