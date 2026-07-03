/**
 * 앱 전역 하단 footer — 회사 정보 (PG 심사 요구 사항).
 * 모든 페이지 하단에 작은 글씨로 표시.
 * 모바일 하단 nav가 있는 페이지(고객 포털 등)는 nav 위에 표시되어야 함.
 */
function Sep() {
  return <span className="text-border select-none" aria-hidden>|</span>
}

export function GlobalFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="w-full border-t border-border-subtle bg-surface-sunken/60 mt-auto">
      <div className="max-w-4xl mx-auto px-4 py-5 leading-relaxed break-keep">
        {/* 상단 네비 링크 — 넓게 벌린 4~5개 CTA */}
        <nav className="flex flex-wrap gap-x-8 gap-y-2 text-[13px] font-medium text-text-secondary">
          <a href="/guide" className="hover:text-text-primary transition-colors">서비스 안내</a>
          <a href="/terms" className="hover:text-text-primary transition-colors">서비스 이용약관</a>
          <a href="/privacy" className="hover:text-text-primary transition-colors">개인정보처리방침</a>
          <a href="/guide#refund" className="hover:text-text-primary transition-colors">환불규정</a>
        </nav>

        {/* 회사 정보 — 파이프 구분 */}
        <div className="mt-3 pt-3 border-t border-border-subtle space-y-1.5 text-[11px] text-text-tertiary">
          {/* Row 1: 법인·사업자·대표 */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="font-semibold text-text-secondary">범빌드코리아 주식회사</span>
            <Sep />
            <span>사업자등록번호 : 398-81-04260</span>
            <Sep />
            <span>대표이사 : 조동환</span>
          </div>

          {/* Row 2: 연락처·이메일·주소 */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span>
              대표전화 :{' '}
              <a href="tel:0317594877" className="hover:text-text-secondary">031-759-4877</a>
            </span>
            <Sep />
            <span>
              영업 :{' '}
              <a href="tel:01054344877" className="hover:text-text-secondary">010-5434-4877</a>
            </span>
            <Sep />
            <span>
              이메일 :{' '}
              <a href="mailto:sunrise@bbkorea.co.kr" className="hover:text-text-secondary">sunrise@bbkorea.co.kr</a>
            </span>
            <Sep />
            <span>주소 : 경기도 성남시 중원구 둔촌대로268번길 22, 201호</span>
          </div>

          {/* Copyright */}
          <p className="pt-1 text-[10px] text-text-tertiary/80">
            Copyright © {year} 범빌드코리아 주식회사. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
