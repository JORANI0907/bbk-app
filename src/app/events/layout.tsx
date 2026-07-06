import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '이벤트 혜택 | BBK 범빌드코리아',
  description: '범빌드코리아 공간케어 서비스의 특별 이벤트와 할인 혜택을 확인하세요.',
}

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f0f7fb] flex flex-col">
      {/* 헤더 */}
      <header className="sticky top-0 z-30 bg-white border-b border-[#c7eaf7] shadow-sm">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/events" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#1e8fc0] flex items-center justify-center">
              <span className="text-white font-black text-xs">B</span>
            </div>
            <span className="font-black text-[#0f5474] text-base tracking-tight">
              BBK <span className="text-[#1e8fc0]">공간케어</span>
            </span>
          </Link>
          <a
            href="https://pf.kakao.com/_bbkkorea"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#fee500] rounded-lg text-xs font-bold text-[#3c1e1e] hover:bg-[#fdd800] transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3C6.477 3 2 6.477 2 10.5c0 2.667 1.556 5.01 3.938 6.42L5 21l4.438-2.344C10.252 18.875 11.112 19 12 19c5.523 0 10-3.477 10-8.5S17.523 3 12 3z"/>
            </svg>
            카카오 문의
          </a>
        </div>
      </header>

      {/* 본문 */}
      <main className="flex-1">{children}</main>

      {/* 푸터 */}
      <footer className="bg-white border-t border-[#c7eaf7] py-6 px-4 mt-8">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs text-gray-400 text-center">
            © 2026 범빌드코리아 | 사업자번호: 398-81-04260 | 문의: 031-759-4877
          </p>
          <div className="flex justify-center gap-4 mt-2">
            <Link href="/terms" className="text-xs text-gray-400 hover:text-gray-600">이용약관</Link>
            <Link href="/privacy" className="text-xs text-gray-400 hover:text-gray-600">개인정보처리방침</Link>
          </div>
        </div>
      </footer>

      {/* 하단 고정 카카오 CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-40 p-3 bg-white/90 backdrop-blur-sm border-t border-[#c7eaf7]">
        <a
          href="https://pf.kakao.com/_bbkkorea"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full max-w-3xl mx-auto py-3 bg-[#fee500] rounded-xl font-bold text-[#3c1e1e] text-sm hover:bg-[#fdd800] active:scale-[0.98] transition-all shadow-md"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3C6.477 3 2 6.477 2 10.5c0 2.667 1.556 5.01 3.938 6.42L5 21l4.438-2.344C10.252 18.875 11.112 19 12 19c5.523 0 10-3.477 10-8.5S17.523 3 12 3z"/>
          </svg>
          카카오톡으로 빠르게 문의하기
        </a>
      </div>
    </div>
  )
}
