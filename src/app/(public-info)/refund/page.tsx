export const metadata = {
  title: '환불규정 | BBK 공간케어',
}

const refundRules = [
  {
    timing: '서비스 48시간 전 취소',
    rate: '전액 환불',
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
  },
  {
    timing: '서비스 24시간 전 취소',
    rate: '50% 환불',
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10',
  },
  {
    timing: '서비스 당일 취소',
    rate: '환불 불가',
    color: 'text-red-400',
    bg: 'bg-red-400/10',
  },
]

export default function RefundPage() {
  return (
    <div className="space-y-4">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-black text-white leading-tight">환불규정</h1>
        <p className="text-white/60 text-sm mt-2">서비스 취소 및 환불 안내</p>
      </div>

      {/* 취소 환불 기준 */}
      <div
        className="rounded-2xl border border-white/15 overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)' }}
      >
        <div className="px-5 py-4 border-b border-white/10">
          <h2 className="text-white font-bold text-base">취소 및 환불 기준</h2>
        </div>
        <div className="divide-y divide-white/10">
          {refundRules.map((rule) => (
            <div key={rule.timing} className="flex items-center justify-between px-5 py-4">
              <span className="text-white/80 text-sm">{rule.timing}</span>
              <span className={`text-sm font-bold px-3 py-1 rounded-full ${rule.color} ${rule.bg}`}>
                {rule.rate}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 서비스 불만족 환불 */}
      <div
        className="rounded-2xl border border-white/15 p-5"
        style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)' }}
      >
        <h2 className="text-white font-bold text-base mb-3">서비스 불만족 시</h2>
        <ul className="space-y-2 text-white/65 text-sm leading-relaxed">
          <li>• 서비스 완료 후 24시간 이내에 불만족 사항을 접수해 주세요.</li>
          <li>• 회사 귀책 사유로 확인된 경우 재시공 또는 부분 환불을 제공합니다.</li>
          <li>• 고객 측 사유(현장 접근 불가, 정보 오류 등)로 인한 경우 환불이 제한될 수 있습니다.</li>
        </ul>
      </div>

      {/* 예약금 환불 */}
      <div
        className="rounded-2xl border border-white/15 p-5"
        style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)' }}
      >
        <h2 className="text-white font-bold text-base mb-3">예약금 환불</h2>
        <ul className="space-y-2 text-white/65 text-sm leading-relaxed">
          <li>• 예약금은 서비스 총 금액에서 차감됩니다.</li>
          <li>• 환불 요건 충족 시 예약금은 결제 수단으로 3~5 영업일 이내 환불됩니다.</li>
          <li>• 가상계좌로 결제한 경우 환불 계좌 정보를 별도 안내드립니다.</li>
        </ul>
      </div>

      {/* 정기 서비스 해지 */}
      <div
        className="rounded-2xl border border-white/15 p-5"
        style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)' }}
      >
        <h2 className="text-white font-bold text-base mb-3">정기 서비스 해지</h2>
        <ul className="space-y-2 text-white/65 text-sm leading-relaxed">
          <li>• 정기딥케어·정기엔드케어는 다음 회차 7일 전까지 해지 요청 시 다음 달부터 미청구됩니다.</li>
          <li>• 7일 이내 해지 요청 시 당월 서비스는 정상 진행되며 이후 해지 처리됩니다.</li>
          <li>• 이미 청구된 회차는 위 취소 기준에 따라 처리됩니다.</li>
        </ul>
      </div>

      <div
        className="rounded-2xl border border-white/10 p-4"
        style={{ background: 'rgba(255,255,255,0.05)' }}
      >
        <p className="text-white/40 text-xs">환불 문의: 031-759-4877 | sunrise@bbkorea.co.kr</p>
        <p className="text-white/40 text-xs mt-1">범빌드코리아 | 사업자등록번호: 298-78-00455</p>
      </div>
    </div>
  )
}
