/**
 * 블록 모형 자동 배치 (2026-11-08) — 구역·층 정보만으로 3D 좌표를 계산한다. 순수 함수.
 *   같은 층 구역은 정사각형에 가까운 격자로, 층은 아래부터 위로 쌓는다.
 *   단위는 임의(미터 아님). 도면 기반 glTF 가 생기면 이 배치는 쓰지 않는다.
 */

import type { CareManualZoneV2, ZoneColor } from '@/types/care-manual'

export const BLOCK = { w: 3, d: 2.2, h: 1.5, gap: 0.45 } as const
export const FLOOR_HEIGHT = 2.6
export const SLAB = 0.14

export interface ZoneBlock {
  zoneId: string
  name: string
  color: ZoneColor
  x: number
  z: number
  w: number
  d: number
  h: number
}

export interface FloorPlan {
  floor: number
  /** 이 층 바닥판의 y */
  y: number
  slabWidth: number
  slabDepth: number
  blocks: ZoneBlock[]
}

export interface FloorLayout {
  floors: FloorPlan[]
  width: number
  depth: number
  height: number
  slab: number
}

export function zoneFloor(z: CareManualZoneV2): number {
  return z.space?.floor ?? 1
}

/** 매뉴얼에 등장하는 층 목록 (낮은 층부터) */
export function listFloors(zones: CareManualZoneV2[]): number[] {
  return Array.from(new Set(zones.map(zoneFloor))).sort((a, b) => a - b)
}

export function floorLabel(floor: number): string {
  return floor > 0 ? `${floor}층` : floor === 0 ? '지상' : `지하 ${-floor}층`
}

function layoutOneFloor(floor: number, zones: CareManualZoneV2[], y: number): FloorPlan {
  const n = Math.max(zones.length, 1)
  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  const stepX = BLOCK.w + BLOCK.gap
  const stepZ = BLOCK.d + BLOCK.gap
  const slabWidth = cols * stepX + BLOCK.gap
  const slabDepth = rows * stepZ + BLOCK.gap
  const blocks = zones.map((z, i) => {
    const c = i % cols
    const r = Math.floor(i / cols)
    return {
      zoneId: z.id,
      name: z.name,
      color: z.color,
      x: (c - (cols - 1) / 2) * stepX,
      z: (r - (rows - 1) / 2) * stepZ,
      w: BLOCK.w,
      d: BLOCK.d,
      h: BLOCK.h,
    }
  })
  return { floor, y, slabWidth, slabDepth, blocks }
}

export function layoutFloors(zones: CareManualZoneV2[]): FloorLayout {
  const floors = listFloors(zones)
  const plans = floors.map((f, i) => layoutOneFloor(f, zones.filter(z => zoneFloor(z) === f), i * FLOOR_HEIGHT))
  return {
    floors: plans,
    width: Math.max(...plans.map(p => p.slabWidth), 1),
    depth: Math.max(...plans.map(p => p.slabDepth), 1),
    height: Math.max(plans.length - 1, 0) * FLOOR_HEIGHT + BLOCK.h + 1,
    slab: SLAB,
  }
}
