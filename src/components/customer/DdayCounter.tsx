import { differenceInCalendarDays } from 'date-fns'

interface Props {
  nextScheduledDate: string // ISO date string
  serviceName: string
}

export function DdayCounter({ nextScheduledDate, serviceName }: Props) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(nextScheduledDate)
  target.setHours(0, 0, 0, 0)

  const diff = differenceInCalendarDays(target, today)

  const ddayLabel =
    diff === 0 ? 'D-Day' : diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`

  return (
    <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-6 text-white shadow-lg">
      <p className="text-blue-200 text-sm font-medium mb-2">다음 서비스까지</p>
      <div className={`text-7xl font-black mb-3 ${ddayLabel === 'D-Day' ? 'text-orange-300' : 'text-white'}`}>
        {ddayLabel}
      </div>
      <div className="flex items-center gap-2 bg-white/20 rounded-xl px-3 py-2 w-fit">
        <span className="text-lg">🧹</span>
        <span className="text-sm font-semibold">{serviceName}</span>
      </div>
      {diff > 0 && (
        <p className="text-blue-200 text-xs mt-3">
          {new Date(nextScheduledDate).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'short',
          })}
        </p>
      )}
      {diff === 0 && (
        <p className="text-orange-200 text-xs mt-3 font-medium">오늘 서비스 예정입니다!</p>
      )}
    </div>
  )
}
