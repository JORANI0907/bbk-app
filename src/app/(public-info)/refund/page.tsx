import { KbEscrowBadge } from '@/components/KbEscrowBadge'

export const metadata = {
  title: '환불 규정 | BBK 공간케어',
}

const sections = [
  {
    title: '1. 환불 원칙',
    content: `범빌드코리아(이하 "회사")는 「전자상거래 등에서의 소비자 보호에 관한 법률」 및 「방문판매 등에 관한 법률」에 따라 서비스 이용자의 환불 요청을 처리합니다.

서비스 특성상 시공 실행 전·후로 환불 규정이 상이하며, 아래 조항을 준수합니다.`,
  },
  {
    title: '2. 청약철회 (시공 시작 전)',
    content: `이용자는 서비스 시공일 전까지 청약철회 및 계약해지를 요청할 수 있습니다.

[전액 환불 대상]
• 결제 완료 후 시공일자 7일 이전 취소: 결제 금액 100% 환불
• 회사의 귀책 사유(작업자 배정 불가, 일정 조정 불가 등)로 인한 취소: 결제 금액 100% 환불

[부분 환불 대상]
• 시공일 6일 이내 ~ 3일 이전 취소: 결제 금액의 70% 환불 (인력 배정·자재 준비 비용 공제)
• 시공일 2일 이내 ~ 1일 이전 취소: 결제 금액의 50% 환불
• 시공 당일 취소: 환불 불가 (인력 파견 완료 상태)`,
  },
  {
    title: '3. 청약철회 제한 사항',
    content: `아래의 경우 청약철회가 제한됩니다.

• 서비스 제공이 이미 완료된 경우
• 이용자의 사업장 현장 상태(잠금, 부재 등)로 인해 시공이 불가능한 상태에서 회사가 방문한 경우
• 이용자의 요청에 따라 개별적으로 맞춤 진행된 서비스 (재활용·재사용 불가)

단, 회사가 청약철회 제한 사실을 사전에 명시하지 않았거나, 시제품·시연 등 확인 방법을 제공하지 않은 경우 청약철회가 가능합니다.`,
  },
  {
    title: '4. 환불 처리 절차',
    content: `[환불 요청 방법]
• 전화: 031-759-4877 (평일·토요일 09:00 - 18:00)
• 이메일: sunrise@bbkorea.co.kr
• 카카오상담: http://pf.kakao.com/_JTNxin

[환불 처리 기간]
• 환불 요청 접수 → 검토 → 승인 → 결제 취소 순으로 진행
• 카드 결제: 취소 승인 후 3~7영업일 이내 카드사에서 환불 처리
• 계좌이체·가상계좌: 환불 승인 후 3영업일 이내 이용자 계좌로 입금
• 세금계산서가 발행된 건은 취소 세금계산서(수정 세금계산서)를 동시에 발행합니다.`,
  },
  {
    title: '5. 서비스 하자에 대한 재시공·환불',
    content: `시공 완료 후 서비스 하자가 확인된 경우, 이용자는 시공 완료일로부터 7일 이내에 아래 조치를 요청할 수 있습니다.

• 무상 재시공: 하자가 명확한 부분에 대해 회사가 재방문하여 재시공
• 부분 환불: 재시공이 불가능하거나 이용자가 원하지 않는 경우 협의를 통해 부분 환불
• 전액 환불: 서비스 전반이 계약 내용과 명백히 다른 경우 협의를 통해 전액 환불

하자 판정은 회사와 이용자의 협의로 결정하며, 협의 불성립 시 소비자분쟁조정위원회의 조정에 따릅니다.`,
  },
  {
    title: '6. 이용자의 귀책 사유',
    content: `아래의 경우 이용자에게 위약금이 발생할 수 있습니다.

• 이용자의 사전 통보 없이 시공 예정일에 부재하여 서비스 제공이 불가능한 경우: 인력 파견 비용(최대 결제 금액의 50%)이 위약금으로 청구됩니다.
• 이용자가 제공한 사업장 정보가 명백히 허위·부정확하여 서비스 제공이 불가능한 경우: 방문 비용이 위약금으로 청구됩니다.`,
  },
  {
    title: '7. 손해배상 및 분쟁 해결',
    content: `서비스 이용 중 발생한 손해에 대해서는 회사와 이용자 간 성실히 협의하여 해결합니다. 협의가 이루어지지 않을 경우 「소비자분쟁해결기준」(공정거래위원회 고시)에 따라 처리하며, 최종적으로는 관할 법원(회사 소재지)의 판결에 따릅니다.

소비자보호 관련 문의: 소비자상담센터 1372 (국번 없이)`,
  },
]

export default function RefundPage() {
  return (
    <div className="space-y-4">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-black text-white leading-tight">환불 규정</h1>
        <p className="text-white/50 text-xs mt-2">시행일: 2025년 1월 1일</p>
      </div>

      {sections.map((sec) => (
        <div
          key={sec.title}
          className="rounded-2xl border border-white/15 p-5"
          style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)' }}
        >
          <h2 className="text-white font-bold text-sm mb-2">{sec.title}</h2>
          <p className="text-white/65 text-sm leading-relaxed whitespace-pre-line">{sec.content}</p>
        </div>
      ))}

      <div
        className="rounded-2xl border border-white/10 p-4"
        style={{ background: 'rgba(255,255,255,0.05)' }}
      >
        <p className="text-white/40 text-xs">문의: 031-759-4877 | sunrise@bbkorea.co.kr</p>
        <p className="text-white/40 text-xs mt-1">범빌드코리아 | 대표: 조동환 | 사업자등록번호: 398-81-04260</p>
        <p className="text-white/40 text-xs mt-1">경기도 성남시 중원구 둔촌대로268번길 22, 1동 2층 201호</p>
        <p className="text-white/40 text-xs mt-1">통신판매업 신고번호: 제 2025-경기성남중원-XXXX호 (신고 진행 중)</p>
        <div className="mt-3">
          <KbEscrowBadge theme="dark" />
        </div>
      </div>
    </div>
  )
}
