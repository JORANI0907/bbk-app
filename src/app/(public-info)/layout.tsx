import Link from 'next/link'

export default function PublicInfoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* 배경 */}
      <div
        className="absolute inset-0 bg-center bg-cover bg-no-repeat"
        style={{ backgroundImage: "url('/login-bg.png')" }}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(160deg, rgba(0,30,80,0.85) 0%, rgba(0,10,40,0.80) 50%, rgba(30,0,80,0.85) 100%)' }}
      />

      {/* 상단 헤더 */}
      <header className="relative z-10 flex items-center justify-between px-5 py-4 border-b border-white/10">
        <Link href="/login" className="flex items-center gap-2 text-white/60 hover:text-white/90 transition-colors text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          로그인으로 돌아가기
        </Link>
        <span className="text-white font-black text-lg tracking-tight">
          BBK <span className="text-sky-300">공간케어</span>
        </span>
      </header>

      {/* 본문 */}
      <main className="relative z-10 flex-1 px-4 py-8 max-w-2xl mx-auto w-full">
        {children}
      </main>

      {/* 하단 네비 */}
      <footer className="relative z-10 border-t border-white/10 px-4 py-4">
        <div className="flex justify-center gap-4 flex-wrap max-w-2xl mx-auto">
          {[
            { href: '/services', label: '서비스 안내' },
            { href: '/terms', label: '이용약관' },
            { href: '/privacy', label: '개인정보처리방침' },
            { href: '/refund', label: '환불규정' },
          ].map(({ href, label }) => (
            <Link key={href} href={href} className="text-xs text-white/40 hover:text-white/70 transition-colors">
              {label}
            </Link>
          ))}
        </div>
        <p className="text-center text-xs text-white/25 mt-3">© 2025 BBK Korea. All rights reserved.</p>
      </footer>
    </div>
  )
}
