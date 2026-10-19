import { NextRequest, NextResponse } from 'next/server'

/**
 * 2026-10-19: 벌크 자동 생성 전면 중단 — 수동 UI(Phase B)로 전환.
 *
 * 과거: customer_ids 배열을 받아서 각 고객의 계약기간 전 schedule 을 service_billings 에
 *   한번에 벌크 INSERT 하던 레거시 엔드포인트. 코드 내부에서는 호출 안 되지만 공개 라우트라
 *   외부(Make.com cron, 레거시 스크립트)에서 POST 만 던지면 사장님 모르게 수십~수백 건을
 *   생성해버리는 통로였음.
 *
 * 현재: 전면 비활성화. 결제청구는 반드시 사장님이 모달에서 체크 후 생성해야 함
 *   (/api/admin/customers/[id]/billings/generate).
 *   원 로직은 git log 로 복구 가능.
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { ok: false, disabled: true, note: 'manual UI only — use /customers/[id]/billings/generate' },
    { status: 410 },
  )
}
