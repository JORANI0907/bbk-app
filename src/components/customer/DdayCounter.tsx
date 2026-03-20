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

  return (
    <div className={`relative overflow-hidden rounded-3xl p-6 text-white shadow-xl ${
      isToday
        ? 'bg-gradient-to-br from-orange-500 to-pink-600 shadow-orange-200'
        : 'bg-gradient-to-br from-blue-600 to-indigo-700 shadow-blue-200'
    }`}>
      {/* Background decoration */}
      <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10" />
      <div className="absolute -right-4 top-8 w-24 h-24 rounded-full bg-white/5" />

      <div className="relative">
        <p className={`text-sm font-medium mb-1 ${isToday ? 'text-orange-100' : 'text-blue-200'}`}>
          다음 서비스까지
        </p>

        <div className={`text-6xl font-black tracking-tight mb-4 ${isToday ? 'text-white' : 'text-white'}`}>
          {ddayLabel}
        </div>

        <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-xl px-3 py-2 w-fit mb-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-white/80">
            <path d="M3 22l4-8 8-8 5-5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7 14c0 0 1-3 5-5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 22c0 0 3-1 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm font-semibold">{serviceName}</span>
        </div>

        <p className={`text-xs font-medium ${isToday ? 'text-orange-100' : 'text-blue-200'}`}>
          {isToday ? '오늘 서비스 예정입니다!' : dateLabel}
        </p>
      </div>
    </div>
  )
}
