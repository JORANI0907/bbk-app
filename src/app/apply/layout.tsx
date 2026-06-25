import type { ReactNode } from 'react'

export default function ApplyLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg overflow-hidden bg-sky-600 flex items-center justify-center">
            <span className="text-white font-black text-xs">BBK</span>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-none">BBK 공간케어</p>
            <p className="text-[10px] text-gray-500">청결한 공간, 신뢰할 수 있는 서비스</p>
          </div>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-6">{children}</main>
      <footer className="max-w-lg mx-auto px-4 py-8 text-center space-y-1">
        <p className="text-[11px] text-gray-400">범빌드코리아 주식회사 · 대표자: 조동환 · 사업자번호: 398-81-04260</p>
        <p className="text-[11px] text-gray-400">문의: 031-759-4877</p>
      </footer>
    </div>
  )
}
