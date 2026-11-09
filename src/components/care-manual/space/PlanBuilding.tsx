'use client'

/**
 * 도면 기반 3D 건물 (2026-11-08) — 분석된 방 다각형을 벽 높이만큼 올려 층층이 쌓는다.
 *   방 색 = 구역 색(연결 안 됨 회색) · 방 위 점 = 구역 상태 · 클릭 → 구역 선택.
 *   visibleKinds 로 호실/복도/공용부/외부를 골라 보고, labelMode 로 글자 양을 조절한다.
 *   라벨은 클릭을 통과시킨다 (pointerEvents none) — 확대했을 때 라벨이 방 클릭을 막던 문제 수정.
 *   SpaceModel3D 의 <Canvas> 안에서만 쓴다.
 */

import { useMemo, useState } from 'react'
import { Edges, Html, useCursor } from '@react-three/drei'
import { Shape } from 'three'
import type { CareManualZoneV2, FloorPlanV2, RoomKind, RoomV2 } from '@/types/care-manual'
import type { ItemStatus } from '@/lib/care-manual-status'
import { STATUS_HEX } from '@/lib/care-manual-status'
import { ZONE_HEX } from '../zone-theme'
import { FLOOR_HEIGHT, SLAB } from './space-layout'
import { WALL_HEIGHT, centroid, planSize, plansByFloor, roomStatus, roomZone, toWorld } from './plan-geometry'
import { polygonArea } from '@/lib/ai/floor-plan/validate'

export type LabelMode = 'all' | 'zones' | 'none'

interface Props {
  plans: FloorPlanV2[]
  zones: CareManualZoneV2[]
  zoneStatuses: Record<string, ItemStatus>
  selectedZoneId: string | null
  onSelectZone: (zoneId: string) => void
  floor: number | null
  visibleKinds: ReadonlySet<RoomKind>
  labelMode: LabelMode
}

const UNLINKED = '#cbd5e1'
const KIND_COLOR: Partial<Record<RoomKind, string>> = { core: '#94a3b8', outdoor: '#e2e8f0' }
/** 이보다 작은 방은 이름을 숨긴다 (겹침 방지). 마우스를 올리거나 선택하면 보인다 */
const SMALL_ROOM_AREA = 0.012
const LABEL_DISTANCE_FACTOR = 12

export function PlanBuilding({ plans, zones, zoneStatuses, selectedZoneId, onSelectZone, floor, visibleKinds, labelMode }: Props) {
  const sorted = useMemo(() => plansByFloor(plans), [plans])
  return (
    <>
      {sorted.map((plan, i) => {
        const dim = floor !== null && plan.floor !== floor
        const { width, depth } = planSize(plan)
        return (
          <group key={plan.id} position={[0, i * FLOOR_HEIGHT, 0]}>
            <mesh position={[0, -SLAB / 2, 0]}>
              <boxGeometry args={[width + 0.3, SLAB, depth + 0.3]} />
              <meshStandardMaterial color="#e2e8f0" transparent opacity={dim ? 0.08 : 1} depthWrite={!dim} />
            </mesh>
            <Html position={[-width / 2 - 0.4, 0.1, depth / 2]} center pointerEvents="none" style={{ opacity: dim ? 0.3 : 1 }}>
              <span className="whitespace-nowrap rounded-md bg-text-primary/80 px-1.5 py-0.5 text-[11px] font-bold text-white">{plan.floor > 0 ? `${plan.floor}F` : `B${-plan.floor}`}</span>
            </Html>
            {plan.rooms.filter(r => visibleKinds.has(r.kind)).map(room => (
              <RoomMesh
                key={room.id}
                plan={plan}
                room={room}
                zone={roomZone(room, zones)}
                status={roomStatus(room, zoneStatuses)}
                selected={!!room.zone_id && room.zone_id === selectedZoneId}
                dim={dim}
                labelMode={labelMode}
                onSelect={onSelectZone}
              />
            ))}
          </group>
        )
      })}
    </>
  )
}

function RoomMesh({ plan, room, zone, status, selected, dim, labelMode, onSelect }: {
  plan: FloorPlanV2; room: RoomV2; zone?: CareManualZoneV2; status: ItemStatus; selected: boolean; dim: boolean; labelMode: LabelMode; onSelect: (id: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  useCursor(hovered && !!zone && !dim)
  const height = WALL_HEIGHT[room.kind]
  // Shape 는 XY 평면 → 메시를 X축 -90° 돌리면 (x, y) → (x, 0, -y). 그래서 shape y 에 -z 를 넣는다.
  const shape = useMemo(() => {
    const s = new Shape()
    room.polygon.forEach((p, i) => {
      const [x, z] = toWorld(plan, p)
      if (i === 0) s.moveTo(x, -z); else s.lineTo(x, -z)
    })
    s.closePath()
    return s
  }, [plan, room.polygon])
  const [cx, cz] = toWorld(plan, centroid(room.polygon))
  const color = zone ? ZONE_HEX[zone.color] : KIND_COLOR[room.kind] ?? UNLINKED
  const label = room.name || zone?.name || ''
  const small = polygonArea(room.polygon) < SMALL_ROOM_AREA
  const showLabel = !dim && !!label && room.kind !== 'outdoor' && (
    hovered || selected || (labelMode === 'all' && !small) || (labelMode === 'zones' && !!zone && !small)
  )

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, selected ? 0.1 : 0, 0]}
        onClick={e => { e.stopPropagation(); if (zone && !dim) onSelect(zone.id) }}
        onPointerOver={e => { e.stopPropagation(); setHovered(true) }}
        onPointerOut={() => setHovered(false)}
      >
        <extrudeGeometry args={[shape, { depth: height, bevelEnabled: false }]} />
        <meshStandardMaterial
          color={color}
          emissive={selected || (hovered && zone) ? color : '#000000'}
          emissiveIntensity={selected ? 0.35 : hovered && zone ? 0.15 : 0}
          transparent
          opacity={dim ? 0.08 : zone ? 0.95 : 0.7}
          depthWrite={!dim}
          roughness={0.65}
        />
        {!dim && <Edges color={selected ? '#0f172a' : '#ffffff'} threshold={20} />}
      </mesh>
      {!dim && status !== 'none' && (
        <mesh position={[cx, height + 0.25, cz]}>
          <sphereGeometry args={[0.16, 18, 18]} />
          <meshStandardMaterial color={STATUS_HEX[status]} emissive={STATUS_HEX[status]} emissiveIntensity={0.5} />
        </mesh>
      )}
      {showLabel && (
        <Html position={[cx, height + 0.65, cz]} center pointerEvents="none" distanceFactor={LABEL_DISTANCE_FACTOR} zIndexRange={[10, 0]}>
          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold shadow-soft ${selected ? 'bg-text-primary text-white' : zone ? 'bg-surface/95 text-text-primary' : 'bg-surface/80 text-text-tertiary'}`}>
            {label}
          </span>
        </Html>
      )}
    </group>
  )
}
