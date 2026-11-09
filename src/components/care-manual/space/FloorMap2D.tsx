'use client'

/**
 * 평면 보기 (2026-11-08) — 3D 가 안 되는 기기·"평면" 선택 시 쓰는 구역 지도.
 *   층별로 구역 칸을 늘어놓고, 칸 색 = 구역 색, 모서리 점 = 종합 관리 상태.
 */

import type { CareManualZoneV2, FloorPlanV2 } from '@/types/care-manual'
import type { ItemStatus } from '@/lib/care-manual-status'
import { STATUS_HEX, STATUS_LABEL } from '@/lib/care-manual-status'
import { ZONE_THEME } from '../zone-theme'
import { floorLabel, listFloors, zoneFloor } from './space-layout'
import { FloorPlanSvg } from './FloorPlanSvg'
import { plansByFloor } from './plan-geometry'

interface Props {
  zones: CareManualZoneV2[]
  zoneStatuses: Record<string, ItemStatus>
  selectedZoneId: string | null
  onSelectZone: (zoneId: string) => void
  /** 도면 분석 결과 — 있으면 칸 대신 진짜 평면도를 그린다 */
  floorPlans?: FloorPlanV2[]
  floor: number | null
}

export default function FloorMap2D({ zones, zoneStatuses, selectedZoneId, onSelectZone, floorPlans = [], floor }: Props) {
  if (floorPlans.length > 0) {
    const plans = plansByFloor(floorPlans).reverse().filter(p => floor === null || p.floor === floor)
    return (
      <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
        {plans.map(p => (
          <section key={p.id} className="rounded-xl border border-border-subtle bg-surface-sunken p-2">
            <p className="mb-1 px-1 text-xs font-bold text-text-secondary">{floorLabel(p.floor)}</p>
            <FloorPlanSvg plan={p} zones={zones} zoneStatuses={zoneStatuses} selectedZoneId={selectedZoneId} onSelectZone={onSelectZone} className="max-h-72" />
          </section>
        ))}
      </div>
    )
  }
  const floors = listFloors(zones).reverse()
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      {floors.filter(f => floor === null || f === floor).map(f => (
        <section key={f} className="rounded-xl border border-border-subtle bg-surface-sunken p-3">
          <p className="mb-2 text-xs font-bold text-text-secondary">{floorLabel(f)}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {zones.filter(z => zoneFloor(z) === f).map(z => {
              const t = ZONE_THEME[z.color]
              const s = zoneStatuses[z.id] ?? 'none'
              const selected = z.id === selectedZoneId
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => onSelectZone(z.id)}
                  className={`relative flex min-h-[64px] items-center justify-center rounded-xl px-2 py-3 text-sm font-semibold text-text-primary transition-all active:scale-[0.98] ${t.soft} ${selected ? 'ring-2 ring-text-primary shadow-card' : 'ring-1 ring-border-subtle'}`}
                >
                  <span className="break-keep text-center">{z.name || '이름 없는 구역'}</span>
                  {s !== 'none' && (
                    <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: STATUS_HEX[s] }} title={STATUS_LABEL[s]} />
                  )}
                  {(z.panoramas?.length ?? 0) > 0 && (
                    <span className="absolute bottom-1.5 right-2 text-[10px] font-medium text-text-tertiary">사진 {z.panoramas!.length}</span>
                  )}
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
