import { redirect } from 'next/navigation'
import { requireAuditSession } from '@/lib/kg-audit/session'
import { KgAuditNav } from '../_components/KgAuditNav'

export const metadata = {
  title:       'BBK 공간케어',
  description: '상업 시설 전문 청소 서비스 · 정기 구독 및 1회성 서비스',
}

export default async function KgAuditLayout({ children }: { children: React.ReactNode }) {
  const isAuthed = await requireAuditSession()
  if (!isAuthed) redirect('/kg-audit/login')

  return (
    <div className="min-h-screen bg-surface-sunken">
      <header className="bg-surface border-b border-border-subtle">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center text-white font-black text-sm">
              BBK
            </div>
            <div>
              <p className="text-[10px] font-medium text-text-tertiary tracking-widest">범빌드코리아</p>
              <h1 className="text-base font-bold text-text-primary leading-tight">BBK 공간케어</h1>
            </div>
          </div>
          <form action="/api/kg-audit/logout" method="POST">
            <button type="submit" className="text-xs text-text-tertiary hover:text-text-primary">로그아웃</button>
          </form>
        </div>
        <KgAuditNav />
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
      <footer className="max-w-5xl mx-auto px-4 py-8 text-center text-[10px] text-text-tertiary leading-relaxed border-t border-border-subtle mt-8">
        <p className="font-semibold text-text-secondary mb-1">범빌드코리아 주식회사 (BBK 공간케어)</p>
        <p>대표: 조동환 · 사업자등록번호: 398-81-04260</p>
        <p>경기도 성남시 중원구 둔촌대로268번길 22, 1동 2층 201호</p>
        <p>통신판매업 신고번호: 제 2026-성남중원-0489호</p>
        <p className="mt-1">고객센터: 1522-9597 · sunrise@bbkorea.co.kr</p>
        <p className="mt-2">결제 대행: 포트원(주) · KG이니시스</p>
      </footer>
    </div>
  )
}
