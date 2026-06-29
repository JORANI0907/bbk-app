import { CircularGauge } from '@/components/customer/CircularGauge'
import { CustomerIndices } from '@/lib/customer-indices'

interface OverviewCardProps {
  branchCount: number
  brandName: string
  indices: CustomerIndices
}

export function OverviewCard({ branchCount, brandName, indices }: OverviewCardProps) {
  const { comfortIndex, outerComfortIndex, progressPct } = indices

  return (
    <div
      className="rounded-3xl p-5 md:p-6 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 60%, #60a5fa 100%)' }}
    >
      <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div>
          <p className="text-white text-xl font-black leading-tight">
            {brandName}님 안녕하세요!
          </p>
          <p className="text-white/85 text-sm mt-1.5 leading-snug break-keep">
            BBK 공간케어와 함께 모든 지점의 위생관리 해보세요.
          </p>
          <p className="text-white/60 text-[11px] mt-2">
            쉽고 편하게 관리 데이트 확인 · 전체 {branchCount}개 지점
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
