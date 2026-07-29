/**
 * BBK 로딩 스피너 — Toss 스타일 breathing 로고 + sonar 링
 *
 * - 로고: 절제된 scale(1↔1.04) + 브랜드 컬러 glow 확장/수축
 * - 뒤에 파장처럼 확산되는 sonar 링 (브랜드 컬러 반투명)
 * - 텍스트: subtle opacity pulse
 */
export function LoadingSpinner({ text = '불러오는 중...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="relative w-16 h-16">
        {/* 확산되는 sonar 링 (로고 뒤) */}
        <span
          className="absolute inset-0 rounded-2xl bg-brand-400 animate-bbk-sonar"
          aria-hidden="true"
        />
        {/* 로고 */}
        <img
          src="/icons/icon-192x192.png"
          alt="BBK 공간케어"
          className="relative w-16 h-16 rounded-2xl animate-bbk-breathe"
          style={{ objectFit: 'cover' }}
        />
      </div>
      <p className="text-sm text-text-tertiary animate-pulse">{text}</p>
    </div>
  )
}
