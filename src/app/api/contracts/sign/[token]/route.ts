import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

type RouteParams = { params: { token: string } }

// GET /api/contracts/sign/[token] — 토큰으로 계약서 조회 (공개 엔드포인트)
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const supabase = createServiceClient()

  const { data: contract, error } = await supabase
    .from('contracts')
    .select('id, signing_status, token_expires_at, contract_snapshot, subscription_plan, visit_frequency, start_date, end_date, customers(business_name)')
    .eq('signing_token', params.token)
    .single()

  if (error || !contract) {
    return NextResponse.json({ success: false, error: '유효하지 않은 링크입니다.' }, { status: 404 })
  }

  // 만료 체크
  const expiresAt = new Date(contract.token_expires_at as string)
  if (expiresAt < new Date()) {
    return NextResponse.json({ success: false, error: '링크가 만료되었습니다. 담당자에게 재발송을 요청해주세요.' }, { status: 410 })
  }

  // 이미 서명 완료된 경우
  if (contract.signing_status === 'completed') {
    return NextResponse.json({ success: false, error: '이미 완료된 계약서입니다.' }, { status: 409 })
  }

  // draft 상태는 아직 서명 요청 전
  if (contract.signing_status === 'draft') {
    return NextResponse.json({ success: false, error: '아직 서명 요청이 발송되지 않은 계약서입니다.' }, { status: 400 })
  }

  const snapshot = contract.contract_snapshot as { html?: string } | null
  const html = snapshot?.html ?? ''

  return NextResponse.json({
    success: true,
    data: {
      id: contract.id,
      signingStatus: contract.signing_status,
      html,
      servicePlan: contract.subscription_plan,
      visitOption: contract.visit_frequency,
      contractStartDate: contract.start_date,
      contractEndDate: contract.end_date,
      businessName: (contract.customers as { business_name?: string } | null)?.business_name,
    },
  })
}
