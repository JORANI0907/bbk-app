export default function CustomerGuidePage() {
  return (
    <div className="px-4 py-5 flex flex-col gap-6 max-w-2xl mx-auto md:px-6 md:py-8">
      <h1 className="text-2xl font-bold text-text-primary leading-tight">이용안내</h1>

      {/* 문의하기 섹션 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wide">문의하기</h2>
        <div className="bg-surface rounded-2xl border border-border-subtle shadow-soft p-5 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-brand-600">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-text-secondary mb-1">이메일</p>
              <a
                href="mailto:sunrise@bbkorea.co.kr"
                className="text-sm font-semibold text-brand-600 hover:underline break-all"
              >
                sunrise@bbkorea.co.kr
              </a>
            </div>
          </div>

          <div className="w-full h-px bg-border-subtle" />

          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-brand-600">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-text-secondary mb-1">고객센터 운영시간</p>
              <p className="text-sm font-semibold text-text-primary">평일 09:00 ~ 18:00</p>
              <p className="text-xs text-text-tertiary mt-0.5">주말 및 공휴일 휴무</p>
            </div>
          </div>
        </div>
      </section>

      {/* 구독서비스 섹션 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wide">구독서비스 안내</h2>
        <div className="bg-surface rounded-2xl border border-border-subtle shadow-soft p-5 flex flex-col gap-4">

          {/* 정기딥케어 */}
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-indigo-600">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-bold text-text-primary">정기딥케어</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">구독</span>
              </div>
              <p className="text-xs text-text-secondary leading-normal">
                정기적인 주방 딥 클리닝 서비스입니다. 후드·덕트·바닥 등 주방 전반을 전문적으로 관리합니다.
              </p>
            </div>
          </div>

          <div className="w-full h-px bg-border-subtle" />

          {/* 정기엔드케어 */}
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-sky-600">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-bold text-text-primary">정기엔드케어</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-medium">구독</span>
              </div>
              <p className="text-xs text-text-secondary leading-normal">
                에어컨·바닥 등 공간 종합 엔드 클리닝 서비스입니다. 시설 전반의 위생과 쾌적함을 정기적으로 유지합니다.
              </p>
            </div>
          </div>

          <div className="w-full h-px bg-border-subtle" />

          {/* 문의 안내 */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-surface-sunken flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-text-secondary">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-text-secondary mb-0.5">서비스 문의</p>
              <a
                href="mailto:sunrise@bbkorea.co.kr"
                className="text-sm text-brand-600 font-medium hover:underline"
              >
                sunrise@bbkorea.co.kr
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
