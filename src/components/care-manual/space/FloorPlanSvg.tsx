'use client'

/**
 * 평면도 한 층 (SVG, 2026-11-08) — 도면 분석 결과의 방 다각형을 그린다.
 *   방 색 = 연결된 구역 색, 연결 안 됨 = 회색. 모서리 점 = 구역 관리 상태. 클릭 → 구역 선택.
 *   showImage 면 원본 도면을 반투명 배경으로 깔아 분석 결과를 대조할 수 있다 (관리자 미리보기).
 */

import type { CareManualZoneV2, FloorPlanV2, RoomV2 } from '@/types/care-manual'
import type { ItemStatus } from '@/lib/care-manual-status'
import { STATUS_HEX } from '@/lib/care-manual-status'
import { ZONE_HEX } from '../zone-theme'
import { centroid, fitLabel, roomStatus, roomZone } from './plan-geometry'

interface Props {
  plan: FloorPlanV2
  zones: CareManualZoneV2[]
  zoneStatuses: Record<string, ItemStatus>
  selectedZoneId: string | null
  onSelectZone?: (zoneId: string) => void
  /** 관리자 미리보기: 방 클릭 시 방 자체를 돌려준다 */
  onSelectRoom?: (room: RoomV2) => void
  selectedRoomId?: string | null
  showImage?: boolean
  className?: string
}

const VB_W = 1000
const UNLINKED = '#cbd5e1'
const KIND_FILL: Partial<Record<RoomV2['kind'], string>> = { core: '#94a3b8', outdoor: '#e2e8f0' }

export function FloorPlanSvg({ plan, zones, zoneStatuses, selectedZoneId, onSelectZone, onSelectRoom, selectedRoomId = null, showImage = false, className = '' }: Props) {
  const vbH = VB_W / Math.min(4, Math.max(0.25, plan.aspect))
  const pt = (p: [number, number]) => `${(p[0] * VB_W).toFixed(1)},${(p[1] * vbH).toFixed(1)}`
  return (
    <svg viewBox={`0 0 ${VB_W} ${vbH}`} className={`h-full w-full ${className}`} role="img" aria-label={`${plan.floor}층 평면도`}>
      <rect x={0} y={0} width={VB_W} height={vbH} fill="#f8fafc" stroke="#cbd5e1" strokeWidth={3} />
      {showImage && plan.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <image href={plan.image_url} x={0} y={0} width={VB_W} height={vbH} preserveAspectRatio="none" opacity={0.45} />
      )}
      {plan.rooms.map(room => {
        const zone = roomZone(room, zones)
        const fill = zone ? ZONE_HEX[zone.color] : KIND_FILL[room.kind] ?? UNLINKED
        const selected = (zone && zone.id === selectedZoneId) || room.id === selectedRoomId
        const status = roomStatus(room, zoneStatuses)
        const [cx, cy] = centroid(room.polygon)
        const clickable = !!onSelectRoom || (!!zone && !!onSelectZone)
        // 방 크기에 맞는 글자만 그린다. 선택된 방은 작아도 읽을 수 있게 최소 크기로 표시
        const label = fitLabel(room.name || zone?.name || '', room.polygon, VB_W, vbH, { maxFont: 34 })
          ?? (selected ? { text: (room.name || zone?.name || '').replace(/^(호실|객실|방)\s*/, ''), fontSize: 14 } : null)
        const fontSize = label?.fontSize ?? 14
        return (
          <g
            key={room.id}
            onClick={() => { if (onSelectRoom) onSelectRoom(room); else if (zone && onSelectZone) onSelectZone(zone.id) }}
            className={clickable ? 'cursor-pointer' : ''}
            opacity={showImage ? 0.85 : 1}
          >
            <polygon
              points={room.polygon.map(pt).join(' ')}
              fill={fill}
              fillOpacity={zone ? 0.75 : 0.5}
              stroke={selected ? '#0f172a' : '#ffffff'}
              strokeWidth={selected ? 8 : 4}
              strokeLinejoin="round"
            />
            {label && (
              <text x={cx * VB_W} y={cy * vbH} textAnchor="middle" dominantBaseline="middle" fontSize={fontSize} fontWeight={700} fill="#1e293b" style={{ pointerEvents: 'none' }}>
                {label.text}
              </text>
            )}
            <title>{room.name || zone?.name || ''}</title>
            {status !== 'none' && (
              <circle cx={cx * VB_W} cy={cy * vbH + (label ? fontSize * 0.95 : 0)} r={Math.max(5, fontSize * 0.28)} fill={STATUS_HEX[status]} stroke="#fff" strokeWidth={3} />
            )}
          </g>
        )
      })}
    </svg>
  )
}
