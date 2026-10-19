import { NextRequest, NextResponse } from 'next/server'

/**
 * 2026-10-19: 자동 생성 전면 중단 — 수동 UI(Phase B)로 전환.
 *
 * 과거: 매일 KST 09:00 Make.com cron 이 호출해서 정기딥/정기엔드 고객의
 *   월간·연간 service_billings 레코드를 자동 생성하던 로직.
 *
 * 현재: 사장님이 "결제청구 생성" 버튼으로 명시적 생성만 허용.
 *   Make.com cron 이 호출해도 아무것도 하지 않음.
 *   원 로직은 git log 로 복구 가능. Phase B 완성 후 이 파일 자체 삭제 예정.
 */
export async function GET(_request: NextRequest) {
  return NextResponse.json({ ok: true, disabled: true, note: 'manual UI only — see Phase B' })
}
