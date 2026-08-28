const REFUND_RULES = [
  { timing: '서비스 예정일 48시간 전 취소', rate: '전액 환불', tone: 'bg-state-success-bg text-state-success border-state-success/20' },
  { timing: '서비스 예정일 24시간 전 취소', rate: '50% 환불',  tone: 'bg-state-warning-bg text-state-warning border-state-warning/20' },
  { timing: '서비스 당일 취소',              rate: '환불 불가', tone: 'bg-state-danger-bg text-state-danger border-state-danger/20' },
]

export default function KgAuditRefundPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-text-primary mb-2">환불 규정</h2>
        <p className="text-sm text-text-secondary">
          BBK 공간케어의 서비스 취소 및 환불 처리 정책입니다.
        </p>
      </div>

      {/* 취소 시점별 환불율 */}
      <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle">
          <h3 className="text-base font-bold text-text-primary">서비스 취소 시점별 환불율</h3>
        </div>
        <div className="divide-y divide-border-subtle">
          {REFUND_RULES.map((rule) => (
            <div key={rule.timing} className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-text-secondary">{rule.timing}</span>
              <span className={`text-xs font-bold px-3 py-1 rounded-full border ${rule.tone}`}>{rule.rate}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 환불 처리 안내 */}
      <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft p-5">
        <h3 className="text-sm font-bold text-text-primary mb-3">환불 처리 안내</h3>
        <ul className="space-y-1.5 text-xs text-text-secondary leading-relaxed break-keep">
          <li>• 환불 요건 충족 시 결제 수단으로 3~5 영업일 이내 환불됩니다.</li>
          <li>• 카드 결제 취소는 카드사 정책에 따라 취소 반영 시점이 다를 수 있습니다.</li>
          <li>• 환불 관련 문의는 고객센터 1522-9597 또는 sunrise@bbkorea.co.kr로 접수해주세요.</li>
        </ul>
      </section>

      {/* 서비스 불만족 */}
      <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft p-5">
        <h3 className="text-sm font-bold text-text-primary mb-3">서비스 불만족 시</h3>
        <ul className="space-y-1.5 text-xs text-text-secondary leading-relaxed break-keep">
          <li>• 서비스 완료 후 24시간 이내에 불만족 사항을 접수해 주세요.</li>
          <li>• 회사 귀책 사유로 확인된 경우 재시공 또는 부분 환불을 제공합니다.</li>
          <li>• 고객 측 사유(현장 접근 불가, 정보 오류 등)로 인한 경우 환불이 제한될 수 있습니다.</li>
        </ul>
      </section>

      {/* 정기 서비스 해지 */}
      <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft p-5">
        <h3 className="text-sm font-bold text-text-primary mb-3">정기 서비스 해지</h3>
        <ul className="space-y-1.5 text-xs text-text-secondary leading-relaxed break-keep">
          <li>• 정기딥케어·정기엔드케어는 다음 회차 7일 전까지 해지 요청 시 다음 달부터 미청구됩니다.</li>
          <li>• 7일 이내 해지 요청 시 당월 서비스는 정상 진행되며 이후 해지 처리됩니다.</li>
          <li>• 이미 청구된 회차는 위 취소 기준에 따라 처리됩니다.</li>
        </ul>
      </section>
    </div>
  )
}
