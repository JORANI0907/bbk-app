import { CircularGauge } from '@/components/customer/CircularGauge'
import { CustomerIndices } from '@/lib/customer-indices'

interface OverviewCardProps {
  branchCount: number
  indices: CustomerIndices
}

export function OverviewCard({ branchCount, indices }: OverviewCardProps) {
  const { comfortIndex, outerComfortIndex, progressPct } = indices

  return (
    <div
      className="rounded-3xl p-5 md:p-6 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 60%, #60a5fa 100%)' }}
    >
      <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div>
          <p className="text-white/70 text-xs font-semibold uppercase tracking-widest">
            총괄 지수
          </p>
          <p className="text-white text-xl font-black mt-1 leading-tight">
            전체 {branchCount}개 지점 평균
          </p>
          <p className="text-white/60 text-[11px] mt-1">
            범위 쾌적 · 범위 외 쾌적 · 이번 달 진행률
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 md:gap-6 md:min-w-[280px]">
          <CircularGauge
            variant="dark"
            size={80}
            strokeWidth={8}
            pct={comfortIndex}
            displayTop={comfortIndex !== null ? `${comfortIndex}` : '-'}
            displaySub="점"
            title="범위 쾌적"
          />
          <CircularGauge
            variant="dark"
            size={80}
            strokeWidth={8}
            pct={outerComfortIndex}
            displayTop={outerComfortIndex !== null ? `${outerComfortIndex}` : '-'}
            displaySub="점"
            title="범위 외 쾌적"
          />
          <CircularGauge
            variant="dark"
            size={80}
            strokeWidth={8}
            pct={progressPct}
            displayTop={progressPct !== null ? `${progressPct}` : '-'}
            displaySub="%"
            title="이번달 진행률"
          />
        </div>
      </div>
      <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10" />
      <div className="absolute -right-4 -bottom-10 w-24 h-24 rounded-full bg-white/10" />
    </div>
  )
}
