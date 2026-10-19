import { NextRequest, NextResponse } from 'next/server'

/**
 * 2026-10-19: 자동 생성 전면 중단 — 수동 UI(Phase B)로 전환.
 *
 * 과거: 매일 KST 01:00 Make.com cron 이 호출해서
 *   계약기간 안의 비어있는 billing_period 를 자동으로 전부 INSERT 하던 안전망.
 *
 * 현재: 사장님이 모르는 사이에 미래 결제청구를 대량 생성하는 문제로 비활성화.
 *   Make.com cron 이 호출해도 아무것도 하지 않음.
 *   원 로직은 git log 로 복구 가능. Phase B 완성 후 이 파일 자체 삭제 예정.
 */
export async function GET(_request: NextRequest) {
  return NextResponse.json({ ok: true, disabled: true, note: 'manual UI only — see Phase B' })
}
