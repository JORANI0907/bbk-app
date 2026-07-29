import { differenceInCalendarDays, format } from 'date-fns'
import { ko } from 'date-fns/locale'

interface Props {
  nextScheduledDate: string
  serviceName: string
}

export function DdayCounter({ nextScheduledDate, serviceName }: Props) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(nextScheduledDate)
  target.setHours(0, 0, 0, 0)

  const diff = differenceInCalendarDays(target, today)
  const isToday = diff === 0
  const isPast = diff < 0

  const ddayLabel = isToday ? 'D-Day' : isPast ? `D+${Math.abs(diff)}` : `D-${diff}`
  const dateLabel = format(new Date(nextScheduledDate), 'yyyy년 M월 d일 (EEE)', { locale: ko })

  // Toss 스타일: gradient/decoration 제거 → 명도로 위계 표현
  // 오늘: brand-600 filled (최강조) / 미래: white 카드 + brand accent (차분한 정보)
  const container = isToday
    ? 'bg-brand-600 text-white'
    : 'bg-surface border border-border-subtle shadow-soft text-text-primary'
  const label = isToday ? 'text-brand-100' : 'text-text-tertiary'
  const dday = isToday ? 'text-white' : 'text-brand-700'
  const chip = isToday
    ? 'bg-white/20 text-white'
    : 'bg-brand-50 text-brand-700'

  return (
    <div className={`rounded-2xl p-6 ${container}`}>
      <p className={`text-sm font-medium mb-1 ${label}`}>다음 서비스까지</p>

      <div className={`text-6xl font-black tracking-tight mb-4 tabular-nums ${dday}`}>
        {ddayLabel}
      </div>

      <div className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 mb-3 ${chip}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
          <path d="M3 22l4-8 8-8 5-5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7 14c0 0 1-3 5-5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 22c0 0 3-1 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-sm font-semibold">{serviceName}</span>
      </div>

      <p className={`text-xs font-medium ${label}`}>
        {isToday ? '오늘 서비스 예정입니다!' : dateLabel}
      </p>
    </div>
  )
}
