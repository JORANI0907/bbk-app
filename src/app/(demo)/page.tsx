import { CircularGauge } from '@/components/customer/CircularGauge'
import { GAUGE_DESCRIPTIONS } from '@/lib/customer-indices'

const DEMO = {
  business_name: '샘플 카페 강남점',
  customer_type: '정기딥케어',
  grade: '블루',
  year: '2년차',
  comfort: 90,
  outer: 85,
  progress: 75,
  monthly_done: 3,
  monthly_total: 4,
}

const RECENT = [
  {
    id: 1,
    date: '6월 19일 (목)',
    worker: '김위생',
    cond: { label: '양호', dot: 'bg-green-500', text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
    outerLabel: '주의',
    outerDot: 'bg-yellow-500',
    recs: ['에어컨 필터', '창문 틀'],
    comment: '전반적으로 깔끔하게 관리되고 있습니다. 카운터 옆 카펫 얼룩 주의 부탁드립니다.',
  },
  {
    id: 2,
    date: '6월 12일 (목)',
    worker: '박위생',
    cond: { label: '주의', dot: 'bg-yellow-500', text: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200' },
    outerLabel: '불량',
    outerDot: 'bg-red-500',
    recs: ['후드 딥클리닝', '바닥 트랩'],
    comment: '주방 후드 기름때 누적이 보입니다. 정기 외 1회성 딥클리닝을 권장드립니다.',
  },
]

const NEXT_SCHEDULE = {
  date: '7월 5일 (금)',
  time: '14:00 ~ 16:00',
  worker: '김위생',
  type: '정기딥케어',
  items: ['주방 후드', '바닥', '화장실'],
}

export default function DemoHomePage() {
  return (
    <div className="px-4 py-5 flex flex-col gap-5 max-w-2xl mx-auto md:px-6 md:py-8 md:gap-6">
      {/* 웰컴 베너 */}
      <div
        className="rounded-3xl p-5 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 60%, #60a5fa 100%)' }}
      >
        <div className="relative z-10">
          <div className="mb-1">
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-white/20 text-white">
              {DEMO.customer_type}
            </span>
          </div>
          <p className="text-white/80 text-sm mb-0.5">안녕하세요</p>
          <h1 className="text-xl font-black text-white leading-tight">{DEMO.business_name}님</h1>
          <p className="text-white/90 text-xs mt-1.5 font-semibold">연간 720,000원 절약 중</p>
          <p className="text-white/70 text-xs mt-1.5">BBK 공간케어를 이용해 주셔서 감사합니다.</p>

          {/* 등급 카드 */}
          <div className="mt-4 rounded-2xl bg-white/10 px-4 py-3.5">
            <p className="text-[9px] font-bold text-white/50 uppercase tracking-widest mb-3">고객 등급</p>
            <div className="grid grid-cols-5 items-center mb-2">
              <div className="flex justify-center">
                <div className="w-11 h-11 rounded-full flex items-center justify-center font-black text-sm bg-white/30 text-white/60">W</div>
              </div>
              <div className="h-px bg-white/60" />
              <div className="flex justify-center">
                <div className="w-11 h-11 rounded-full flex items-center justify-center font-black text-sm bg-sky-300 text-sky-900 ring-2 ring-sky-200 shadow-lg scale-110">B</div>
              </div>
              <div className="h-px bg-white/20" />
              <div className="flex justify-center">
                <div className="w-11 h-11 rounded-full flex items-center justify-center font-black text-sm bg-gray-800/25 text-white/30">K</div>
              </div>
            </div>
            <div className="grid grid-cols-5">
              <div className="flex flex-col items-center gap-0.5">
                <p className="text-[10px] font-bold text-white/40">화이트</p>
                <p className="text-[9px] text-white/25">1년차</p>
              </div>
              <div />
              <div className="flex flex-col items-center gap-0.5">
                <p className="text-[10px] font-bold text-white">블루</p>
                <p className="text-[9px] text-white/65">2년차</p>
              </div>
              <div />
              <div className="flex flex-col items-center gap-0.5">
                <p className="text-[10px] font-bold text-white/40">블랙</p>
                <p className="text-[9px] text-white/25">3년차</p>
              </div>
            </div>
          </div>

          {/* 게이지 3개 */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            <CircularGauge
              pct={DEMO.comfort}
              displayTop={`${DEMO.comfort}`}
              displaySub="점"
              title="쾌적 지수"
              caption={`최근 ${RECENT.length}회 기준`}
              description={GAUGE_DESCRIPTIONS.comfort}
            />
            <CircularGauge
              pct={DEMO.outer}
              displayTop={`${DEMO.outer}`}
              displaySub="점"
              title="범위 외 쾌적"
              caption={`최근 ${RECENT.length}회 기준`}
              description={GAUGE_DESCRIPTIONS.outerComfort}
            />
            <CircularGauge
              pct={DEMO.progress}
              displayTop={`${DEMO.progress}`}
              displaySub="%"
              title="이번달 진행률"
              caption={`${DEMO.monthly_done}/${DEMO.monthly_total}회`}
              description={GAUGE_DESCRIPTIONS.progress}
            />
          </div>
        </div>
        <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10" />
        <div className="absolute -right-2 -bottom-8 w-20 h-20 rounded-full bg-white/10" />
      </div>

      {/* 관리 리포트 */}
      <section>
        <p className="text-xs font-semibold text-brand-600 uppercase tracking-wide mb-2">관리 리포트</p>
        <div className="rounded-2xl border border-border-subtle bg-surface shadow-soft overflow-hidden">
          <div className="flex border-b border-border-subtle bg-surface-sunken/40">
            <div className="flex-1 py-2.5 text-sm font-semibold text-text-tertiary text-center">
              예정 <span className="text-[11px] ml-1">1</span>
            </div>
            <div className="flex-1 py-2.5 text-sm font-semibold bg-surface text-brand-600 border-b-2 border-brand-600 -mb-px text-center">
              완료 <span className="text-[11px] ml-1 text-brand-500">{RECENT.length}</span>
            </div>
          </div>
          <div className="p-3 flex flex-col gap-2">
            {/* 예정 카드 1개 (미니) */}
            <div className="bg-surface rounded-2xl border border-brand-100 shadow-soft p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2 min-w-0">
                  <p className="text-sm font-bold text-text-primary whitespace-nowrap">{NEXT_SCHEDULE.date}</p>
                  <p className="text-[11px] text-text-tertiary truncate">담당 {NEXT_SCHEDULE.worker}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] font-bold text-brand-600">D-5</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-state-info-bg text-state-info">예정</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {NEXT_SCHEDULE.items.map(item => (
                  <span key={item} className="text-[10px] bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded-full font-medium">{item}</span>
                ))}
              </div>
            </div>

            {/* 완료 카드들 */}
            {RECENT.map(r => (
              <div key={r.id} className="bg-surface rounded-2xl border border-border-subtle shadow-flat p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <p className="text-sm font-bold text-text-primary whitespace-nowrap">{r.date}</p>
                    <p className="text-[11px] text-text-tertiary truncate">담당 {r.worker}</p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-brand-50 text-brand-700 border border-brand-200">완료</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] flex-wrap pt-0.5">
                  <span className="inline-flex items-center gap-1">
                    <span className="text-text-tertiary">쾌적</span>
                    <span className={`inline-flex items-center gap-0.5 font-semibold ${r.cond.text}`}>
                      <span className={`w-1 h-1 rounded-full ${r.cond.dot}`} />
                      {r.cond.label}
                    </span>
                  </span>
                  <span className="text-border">·</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="text-text-tertiary">범위외</span>
                    <span className={`inline-flex items-center gap-0.5 font-semibold ${r.outerLabel === '주의' ? 'text-yellow-700' : 'text-red-700'}`}>
                      <span className={`w-1 h-1 rounded-full ${r.outerDot}`} />
                      {r.outerLabel}
                    </span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-text-tertiary shrink-0">권장</span>
                  {r.recs.map(rec => (
                    <span key={rec} className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium bg-yellow-50 text-yellow-700 border-yellow-200">
                      {rec}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-text-secondary leading-snug break-keep line-clamp-1">
                  <span className="text-text-tertiary mr-1">전달</span>{r.comment}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 안내 카드 */}
      <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 text-center">
        <p className="text-sm font-bold text-brand-700 mb-1">실제 데이터는 로그인 후 확인하실 수 있습니다</p>
        <p className="text-xs text-brand-600 leading-relaxed">
          위 화면은 BBK 공간케어 고객 포털 미리보기입니다.
          <br />
          서비스 신청은 <a href="/apply/deepcare" className="font-semibold underline">정기딥케어</a> 또는 <a href="/apply/endcare" className="font-semibold underline">정기엔드케어</a> 페이지에서 가능합니다.
        </p>
      </div>
    </div>
  )
}
