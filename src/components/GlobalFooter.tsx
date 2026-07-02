/**
 * 앱 전역 하단 footer — 회사 정보 (PG 심사 요구 사항).
 * 모든 페이지 하단에 작은 글씨로 표시.
 * 모바일 하단 nav가 있는 페이지(고객 포털 등)는 nav 위에 표시되어야 함.
 */
export function GlobalFooter() {
  return (
    <footer className="w-full border-t border-border-subtle bg-surface-sunken/60 mt-auto">
      <div className="max-w-4xl mx-auto px-4 py-4 text-[11px] text-text-tertiary leading-relaxed break-keep">
        {/* 회사명 (단독 줄) */}
        <p className="font-semibold text-text-secondary">
          범빌드코리아 주식회사 (BBK Korea)
        </p>

        {/* 2열 그리드 — 이름/사업자, 전화/이메일 등 */}
        <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
          <p>대표 조동환</p>
          <p>사업자등록번호 398-81-04260</p>
        </div>

        {/* 주소 (1열, 단독) */}
        <p className="mt-1">경기도 성남시 중원구 둔촌대로268번길 22, 201호</p>

        {/* 2열: 전화 / 이메일 */}
        <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
          <p>
            전화 <a href="tel:0317594877" className="hover:text-text-secondary">031-759-4877</a>
            <span className="mx-1.5">·</span>
            <a href="tel:01054344877" className="hover:text-text-secondary">010-5434-4877</a>
          </p>
          <p>
            이메일 <a href="mailto:sunrise@bbkorea.co.kr" className="hover:text-text-secondary">sunrise@bbkorea.co.kr</a>
          </p>
        </div>

        {/* 이용약관 등 4개 버튼 */}
        <div className="mt-2 pt-2 border-t border-border-subtle flex flex-wrap gap-x-3 gap-y-1">
          <a href="/terms" className="hover:text-text-secondary">이용약관</a>
          <a href="/privacy" className="hover:text-text-secondary font-semibold">개인정보처리방침</a>
          <a href="/guide" className="hover:text-text-secondary">서비스 안내</a>
          <a href="/guide#refund" className="hover:text-text-secondary">환불규정</a>
        </div>

        {/* 저작권 */}
        <p className="mt-2 text-[10px]">
          © {new Date().getFullYear()} 범빌드코리아 주식회사. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
