const SCHEDULES = [
  { date: '7월 5일 (금)', time: '14:00 ~ 16:00', worker: '김위생', items: ['주방 후드', '바닥', '화장실'], status: 'upcoming', dday: 'D-5' },
  { date: '6월 19일 (목)', time: '14:00 ~ 16:00', worker: '김위생', items: ['주방 후드', '바닥'], status: 'done', cond: '양호' },
  { date: '6월 12일 (목)', time: '14:00 ~ 16:00', worker: '박위생', items: ['주방 후드', '에어컨'], status: 'done', cond: '주의' },
  { date: '6월 5일 (목)', time: '14:00 ~ 16:00', worker: '김위생', items: ['주방 후드', '바닥'], status: 'done', cond: '양호' },
]

function StatusBadge({ status, cond }: { status: string; cond?: string }) {
  if (status === 'upcoming') {
    return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-state-info-bg text-state-info">예정</span>
  }
  const condClass = cond === '양호'
    ? 'bg-green-50 text-green-700 border-green-200'
    : cond === '주의'
      ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
      : 'bg-red-50 text-red-700 border-red-200'
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-brand-50 text-brand-700 border border-brand-200">완료</span>
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${condClass}`}>{cond}</span>
    </div>
  )
}

export default function DemoSchedulePage() {
  return (
    <div className="px-4 py-5 flex flex-col gap-4 max-w-2xl mx-auto md:px-6 md:py-8">
      <h1 className="text-xl font-bold text-text-primary">서비스 일정</h1>
      <p className="text-xs text-text-tertiary -mt-3">샘플 카페 강남점 · 정기딥케어</p>

      <div className="flex flex-col gap-2">
        {SCHEDULES.map((s, i) => (
          <div key={i} className="bg-surface rounded-2xl border border-border-subtle shadow-flat p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-2 min-w-0">
                <p className="text-sm font-bold text-text-primary whitespace-nowrap">{s.date}</p>
                <p className="text-[11px] text-text-tertiary truncate">담당 {s.worker}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {s.dday && <span className="text-[11px] font-bold text-brand-600">{s.dday}</span>}
                <StatusBadge status={s.status} cond={s.cond} />
              </div>
            </div>
            <p className="text-[11px] text-text-tertiary">{s.time}</p>
            <div className="flex flex-wrap gap-1">
              {s.items.map(item => (
                <span key={item} className="text-[10px] bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded-full font-medium">{item}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 text-center mt-2">
        <p className="text-xs text-brand-700 leading-relaxed">
          위 일정은 미리보기 데이터입니다.
          <br />
          실제 일정 관리는 로그인 후 이용 가능합니다.
        </p>
      </div>
    </div>
  )
}
