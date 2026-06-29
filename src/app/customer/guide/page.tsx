import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { getCustomerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { ScheduleChangeRequest } from '@/components/customer/ScheduleChangeRequest'
import { ServiceSchedule } from '@/types/database'

export default async function CustomerGuidePage() {
  const session = getCustomerSession()
  if (!session || session.role !== 'customer') redirect('/login')

  const supabase = createServiceClient()
  const { data: customerRow } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', session.userId)
    .maybeSingle()

  const today = new Date().toISOString().slice(0, 10)
  let upcomingSchedules: ServiceSchedule[] = []
  if (customerRow) {
    const { data } = await supabase
      .from('service_schedules')
      .select('*')
      .eq('customer_id', customerRow.id)
      .gte('scheduled_date', today)
      .in('status', ['scheduled', 'confirmed'])
      .is('deleted_at', null)
      .order('scheduled_date', { ascending: true })
    upcomingSchedules = (data ?? []) as ServiceSchedule[]
  }

  return (
    <div className="px-4 py-5 flex flex-col gap-6 max-w-2xl mx-auto md:px-6 md:py-8">
      <h1 className="text-2xl font-bold text-text-primary leading-tight">이용안내</h1>

      {/* 문의하기 섹션 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wide">문의하기</h2>
        <div className="bg-surface rounded-2xl border border-border-subtle shadow-soft p-5 flex flex-col gap-4">

          {/* 이메일 */}
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

          {/* 연락처 */}
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-brand-600">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.6a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-text-secondary mb-1">연락처</p>
              <div className="flex flex-col gap-0.5">
                <a href="tel:0317594877" className="text-sm font-semibold text-text-primary hover:text-brand-600 transition-colors">
                  031-759-4877
                </a>
                <a href="tel:01054344877" className="text-sm font-semibold text-text-primary hover:text-brand-600 transition-colors">
                  010-5434-4877
                </a>
              </div>
            </div>
          </div>

          <div className="w-full h-px bg-border-subtle" />

          {/* 운영시간 */}
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

          {/* 정기딥케어 — 홈페이지로 이동 */}
          <a
            href="https://bbkorea.co.kr/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 group"
          >
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-indigo-600">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-bold text-text-primary group-hover:text-brand-600 transition-colors">정기딥케어</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">구독</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-text-tertiary ml-auto">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </div>
              <p className="text-xs text-text-secondary leading-normal">
                정기적인 주방 딥 클리닝 서비스입니다. 후드·덕트·바닥 등 주방 전반을 전문적으로 관리합니다.
              </p>
            </div>
          </a>

          <div className="w-full h-px bg-border-subtle" />

          {/* 정기엔드케어 — 모바일에서 전화앱 이동 */}
          <a
            href="tel:0317594877"
            className="flex items-start gap-3 group md:pointer-events-none"
          >
            <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-sky-600">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-bold text-text-primary group-hover:text-brand-600 transition-colors md:group-hover:text-text-primary">정기엔드케어</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-medium">구독</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-text-tertiary ml-auto md:hidden">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.6a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </div>
              <p className="text-xs text-text-secondary leading-normal">
                마감청소 클리닝 서비스입니다. 쓰레기 배출, 청소, 설거지 등 전문적으로 관리합니다.
              </p>
            </div>
          </a>
        </div>
      </section>

      {/* 서비스 범위 안내 섹션 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wide">서비스 범위 안내</h2>
        <Link
          href="/customer/services"
          className="bg-surface rounded-2xl border border-border-subtle shadow-soft p-5 flex items-center gap-4 group hover:bg-surface-sunken active:scale-[0.98] transition-all"
        >
          <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-brand-600">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text-primary group-hover:text-brand-600 transition-colors">청소 서비스 항목 보기</p>
            <p className="text-xs text-text-secondary mt-0.5 leading-normal">
              주방기기 · 공간 · 위생설비 · 설비 등 17개 항목
            </p>
          </div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-text-tertiary shrink-0">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </Link>
      </section>

      {/* 일정 변경 요청 (가장 하단) */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wide">일정 변경</h2>
        <div className="bg-surface rounded-2xl border border-border-subtle shadow-soft p-5 flex flex-col gap-3">
          <div>
            <p className="text-sm font-bold text-text-primary">일정 변경 요청</p>
            <p className="text-xs text-text-secondary mt-1 leading-normal">
              방문일 <span className="font-semibold text-text-primary">7일 전</span>까지 가능합니다.
              <br />
              이내 변경은 고객센터(<span className="text-text-secondary font-medium">031-759-4877</span>)로 직접 연락 바랍니다.
            </p>
          </div>
          {upcomingSchedules.length > 0 ? (
            <ScheduleChangeRequest upcomingSchedules={upcomingSchedules} />
          ) : (
            <div className="bg-surface-sunken rounded-xl px-4 py-3 text-center">
              <p className="text-xs text-text-tertiary">변경할 예정 일정이 없습니다.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
