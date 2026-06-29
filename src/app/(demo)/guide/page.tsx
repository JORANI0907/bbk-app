export const metadata = {
  title: '이용안내 | BBK 공간케어',
  description: '서비스 안내 및 환불규정',
}

const SERVICES = [
  {
    category: '1회성케어',
    desc: '단발성 전문 청소 서비스',
    items: [
      { name: '소형 (20평 이하)', price: '120,000원~' },
      { name: '중형 (21~40평)', price: '200,000원~' },
      { name: '대형 (41~60평)', price: '300,000원~' },
      { name: '특대형 (61평 이상)', price: '400,000원~' },
    ],
  },
  {
    category: '정기딥케어',
    desc: '정기 딥 클리닝 구독 서비스',
    items: [
      { name: '월 1회 기본형', price: '150,000원~/회' },
      { name: '월 2회 기본형', price: '270,000원~/회' },
    ],
  },
  {
    category: '정기엔드케어',
    desc: '정기 엔드 클리닝 구독 서비스',
    items: [
      { name: '기본형', price: '100,000원~/회' },
      { name: '확장형', price: '180,000원~/회' },
    ],
  },
]

const REFUND_RULES = [
  { timing: '서비스 48시간 전 취소', rate: '전액 환불', tone: 'bg-green-50 text-green-700 border-green-200' },
  { timing: '서비스 24시간 전 취소', rate: '50% 환불', tone: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  { timing: '서비스 당일 취소', rate: '환불 불가', tone: 'bg-red-50 text-red-700 border-red-200' },
]

export default function DemoGuidePage() {
  return (
    <div className="px-4 py-5 flex flex-col gap-6 max-w-2xl mx-auto md:px-6 md:py-8">
      <h1 className="text-2xl font-bold text-text-primary leading-tight">이용안내</h1>

      {/* 문의하기 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wide">문의하기</h2>
        <div className="bg-surface rounded-2xl border border-border-subtle shadow-soft p-5 flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-text-tertiary">이메일</span>
            <a href="mailto:sunrise@bbkorea.co.kr" className="font-semibold text-brand-600">sunrise@bbkorea.co.kr</a>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-tertiary">연락처</span>
            <div className="flex flex-col items-end">
              <a href="tel:0317594877" className="font-semibold text-text-primary">031-759-4877</a>
              <a href="tel:01054344877" className="font-semibold text-text-primary">010-5434-4877</a>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-tertiary">운영시간</span>
            <span className="font-semibold text-text-primary">평일 09:00 ~ 18:00</span>
          </div>
        </div>
      </section>

      {/* 서비스 안내 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wide">서비스 안내 및 요금</h2>
        {SERVICES.map((svc) => (
          <div key={svc.category} className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
            <div className="px-5 py-3 border-b border-border-subtle">
              <h3 className="text-sm font-bold text-text-primary">{svc.category}</h3>
              <p className="text-xs text-text-tertiary mt-0.5">{svc.desc}</p>
            </div>
            <div className="divide-y divide-border-subtle">
              {svc.items.map((item) => (
                <div key={item.name} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-text-secondary">{item.name}</span>
                  <span className="text-sm font-semibold text-brand-600">{item.price}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="rounded-xl border border-border-subtle bg-surface-sunken/40 px-4 py-3">
          <p className="text-xs text-text-secondary leading-relaxed break-keep">
            ※ 표기 금액은 기본 요금이며, 실제 금액은 현장 면적·오염도·서비스 옵션에 따라 달라질 수 있습니다.
            <br />
            ※ 모든 금액은 부가세(VAT 10%) 포함 기준입니다.
            <br />
            ※ 예약 및 상세 견적은 전화(031-759-4877) 또는 이메일로 문의해 주세요.
          </p>
        </div>
      </section>

      {/* 환불규정 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wide">환불규정</h2>

        <div className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle">
            <h3 className="text-sm font-bold text-text-primary">취소 및 환불 기준</h3>
          </div>
          <div className="divide-y divide-border-subtle">
            {REFUND_RULES.map((rule) => (
              <div key={rule.timing} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-text-secondary">{rule.timing}</span>
                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${rule.tone}`}>{rule.rate}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface rounded-2xl border border-border-subtle shadow-soft p-5">
          <h3 className="text-sm font-bold text-text-primary mb-3">서비스 불만족 시</h3>
          <ul className="space-y-1.5 text-xs text-text-secondary leading-relaxed break-keep">
            <li>• 서비스 완료 후 24시간 이내에 불만족 사항을 접수해 주세요.</li>
            <li>• 회사 귀책 사유로 확인된 경우 재시공 또는 부분 환불을 제공합니다.</li>
            <li>• 고객 측 사유(현장 접근 불가, 정보 오류 등)로 인한 경우 환불이 제한될 수 있습니다.</li>
          </ul>
        </div>

        <div className="bg-surface rounded-2xl border border-border-subtle shadow-soft p-5">
          <h3 className="text-sm font-bold text-text-primary mb-3">예약금 환불</h3>
          <ul className="space-y-1.5 text-xs text-text-secondary leading-relaxed break-keep">
            <li>• 예약금은 서비스 총 금액에서 차감됩니다.</li>
            <li>• 환불 요건 충족 시 결제 수단으로 3~5 영업일 이내 환불됩니다.</li>
            <li>• 가상계좌 결제는 환불 계좌 정보를 별도 안내드립니다.</li>
          </ul>
        </div>

        <div className="bg-surface rounded-2xl border border-border-subtle shadow-soft p-5">
          <h3 className="text-sm font-bold text-text-primary mb-3">정기 서비스 해지</h3>
          <ul className="space-y-1.5 text-xs text-text-secondary leading-relaxed break-keep">
            <li>• 정기딥케어·정기엔드케어는 다음 회차 7일 전까지 해지 요청 시 다음 달부터 미청구됩니다.</li>
            <li>• 7일 이내 해지 요청 시 당월 서비스는 정상 진행되며 이후 해지 처리됩니다.</li>
            <li>• 이미 청구된 회차는 위 취소 기준에 따라 처리됩니다.</li>
          </ul>
        </div>
      </section>
    </div>
  )
}
