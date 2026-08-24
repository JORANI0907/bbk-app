import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * Phase 27-AC: application 에 작업자 다중 배정 지원 (기존 assignments 정리 + 새로 insert).
 * POST /api/admin/applications/{id}/assign-worker
 * body:
 *   - { worker_ids: string[] } — 신규 (다중 배정)
 *   - { worker_id: string | null } — 하위호환 (단일 배정 · 자동으로 [worker_id] 로 변환)
 *   - worker_ids: []  또는 worker_id: null → 배정 해제
 *
 * 두 저장소 동기화:
 *   - work_assignments 테이블 (다중 배정 · 급여 정산 기준)
 *   - service_applications.assigned_to 컬럼 (단일 primary · 화면 표시·스케줄 동기화 기준)
 *   두 곳이 항상 함께 갱신되도록 이 API 안에서 처리 (첫 번째 worker_id 를 primary 로 assigned_to 에 반영).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const applicationId = params.id
  if (!applicationId) {
    return NextResponse.json({ error: 'application id가 필요합니다.' }, { status: 400 })
  }

  let body: { worker_id?: string | null; worker_ids?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON body 파싱 실패' }, { status: 400 })
  }

  // 신규 worker_ids 우선, 없으면 legacy worker_id 를 배열로 승격. 중복·빈 문자열 제거.
  const rawIds = Array.isArray(body.worker_ids)
    ? body.worker_ids
    : (body.worker_id ? [body.worker_id] : [])
  const workerIds = Array.from(new Set(rawIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)))

  const supabase = createServiceClient()

  // 1) application 조회
  const { data: app, error: appErr } = await supabase
    .from('service_applications')
    .select('id, construction_date, business_name')
    .eq('id', applicationId)
    .is('deleted_at', null)
    .single()

  if (appErr || !app) {
    return NextResponse.json({ error: '신청서를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 2) 기존 assignments 전체 삭제 (다중 배정도 이 방식으로 동기화)
  const { error: delErr } = await supabase
    .from('work_assignments')
    .delete()
    .eq('application_id', applicationId)

  if (delErr) {
    return NextResponse.json({ error: `기존 배정 삭제 실패: ${delErr.message}` }, { status: 500 })
  }

  // 3) 배정 해제 요청이면 assigned_to 도 null 로 함께 갱신하고 종료
  if (workerIds.length === 0) {
    await supabase
      .from('service_applications')
      .update({ assigned_to: null })
      .eq('id', applicationId)
    return NextResponse.json({ success: true, worker_ids: [] })
  }

  // 4) construction_date · business_name 확인 (work_assignments NOT NULL 제약)
  if (!app.construction_date || !app.business_name) {
    return NextResponse.json(
      { error: '시공일자 또는 업체명이 비어있어 배정할 수 없습니다.' },
      { status: 400 },
    )
  }

  // 5) 신규 배정 다중 insert (한 번의 요청으로)
  const rows = workerIds.map(wid => ({
    worker_id: wid,
    application_id: applicationId,
    construction_date: app.construction_date,
    business_name: app.business_name,
  }))
  const { error: insErr } = await supabase.from('work_assignments').insert(rows)

  if (insErr) {
    return NextResponse.json({ error: `배정 실패: ${insErr.message}` }, { status: 500 })
  }

  // 6) service_applications.assigned_to 를 primary(첫 번째) worker_id 로 동기화.
  //    두 저장소(work_assignments · assigned_to)가 어긋나는 것을 이 시점에 원천 차단.
  const { error: syncErr } = await supabase
    .from('service_applications')
    .update({ assigned_to: workerIds[0] })
    .eq('id', applicationId)

  if (syncErr) {
    // work_assignments 는 이미 insert 성공. assigned_to 동기화 실패는 상위 알림 남기고 성공으로 처리.
    // (다음 저장 시 동기화되므로 사용자 흐름을 막지 않음)
    console.error('assigned_to 동기화 실패:', syncErr.message)
  }

  // 하위호환: worker_id 는 첫 번째 반환
  return NextResponse.json({ success: true, worker_ids: workerIds, worker_id: workerIds[0] })
}
