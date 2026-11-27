import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { renderRegulationHtml } from '@/lib/regulations/articles'
import { formatRegulationTitle, normalizeKeyClauses, stripRegulationCodes, type RegulationDocSnapshot } from '@/lib/contract-regulation-vars'
import { describeAmount } from '@/lib/contract-terms'
import type { ContractCustomerInfo } from '@/lib/contractTemplate'

type RouteParams = { params: { token: string } }

// GET /api/contracts/sign/[token] — 토큰으로 계약서 조회 (공개 엔드포인트)
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const supabase = createServiceClient()

  const { data: contract, error } = await supabase
    .from('contracts')
    .select('id, signing_status, token_expires_at, contract_snapshot, subscription_plan, visit_frequency, start_date, end_date, customer_phone, customers(business_name)')
    .eq('signing_token', params.token)
    .is('deleted_at', null) // 2026-11-25: 삭제(파기)된 계약의 링크는 404 — 재발행 후 옛 링크로 서명되는 것 방지
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

  const snapshot = contract.contract_snapshot as {
    html?: string; customer_info?: Partial<ContractCustomerInfo>; regulation_docs?: RegulationDocSnapshot[]; agreements_required?: unknown
  } | null
  const info = snapshot?.customer_info ?? {}
  const rawHtml = snapshot?.html ?? ''
  // 준거 문서: 계약 생성 시점에 스냅샷에 고정한 규정 본문. 공개 페이지 없이 이 토큰으로만 열람한다.
  // 고객에게는 내부 코드(CP-03 등)를 보이지 않는다 — 제목만. 본문 안의 상호 참조 코드도 지운다.
  const regulationDocs = (snapshot?.regulation_docs ?? []).map(d => ({
    code: d.code, title: d.title, label: formatRegulationTitle(d), html: stripRegulationCodes(renderRegulationHtml(d.html, d.effective_date)),
  }))

  return NextResponse.json({
    success: true,
    data: {
      id: contract.id,
      signingStatus: contract.signing_status,
      html: rawHtml,
      servicePlan: contract.subscription_plan,
      visitOption: contract.visit_frequency,
      contractStartDate: contract.start_date,
      contractEndDate: contract.end_date,
      businessName: (contract.customers as { business_name?: string } | null)?.business_name,
      // 관리자가 계약서 생성 시 등록한 OTP 수신 번호. UI에서 편집 불가로 표시하고
      // 서버 send-otp/agree 도 이 값을 강제 사용 (다른 번호 입력 방지).
      customerPhone: contract.customer_phone as string | null,
      regulationDocs,
      // 계약 정보 요약 — 계약서 작성 모달에서 입력한 값 (별지 「계약 내용」과 같은 출처)
      contactName: info.contact_name ?? null,
      amountText: describeAmount(info) || null,
      visitSchedule: info.visit_schedule || null,
      paymentTerms: info.payment_terms || null,
      // 서명 전 확인 항목. 비어 있으면 화면이 옛 방식(제8조·제14조)으로 동작한다.
      agreementsRequired: normalizeKeyClauses(snapshot?.agreements_required),
    },
  })
}
