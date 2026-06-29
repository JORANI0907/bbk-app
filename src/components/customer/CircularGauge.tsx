import { gaugeStrokeColor } from '@/lib/customer-indices'

interface CircularGaugeProps {
  pct: number | null
  displayTop: string
  displaySub: string
  title: string
  size?: number
  strokeWidth?: number
  variant?: 'dark' | 'light'
}

/**
 * 원형 게이지. customer 웰컴 카드 = dark, franchise 지점 카드 = light.
 * 색상 룰은 lib/customer-indices.ts의 gaugeStrokeColor 단일 정의를 사용.
 */
export function CircularGauge({
  pct,
  displayTop,
  displaySub,
  title,
  size = 72,
  strokeWidth = 7,
  variant = 'dark',
}: CircularGaugeProps) {
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - (pct ?? 0) / 100)
  const color = gaugeStrokeColor(pct)

  const trackColor = variant === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.08)'
  const topTextClass = variant === 'dark' ? 'text-white' : 'text-text-primary'
  const subTextClass = variant === 'dark' ? 'text-white/70' : 'text-text-tertiary'
  const titleClass = variant === 'dark' ? 'text-white/70' : 'text-text-secondary'

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          style={{ transform: 'rotate(-90deg)', display: 'block' }}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={trackColor}
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${circ}`}
            strokeDashoffset={`${offset}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-base font-black leading-none ${topTextClass}`}>{displayTop}</span>
          <span className={`text-[9px] leading-none mt-0.5 ${subTextClass}`}>{displaySub}</span>
        </div>
      </div>
      <p className={`text-[9px] font-semibold text-center leading-tight break-keep ${titleClass}`}>
        {title}
      </p>
    </div>
  )
}
