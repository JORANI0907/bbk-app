/**
 * 도면 좌표(0~1) → 화면/3D 좌표 변환 (2026-11-08). 순수 함수.
 *   3D 에서 층 하나의 가로폭을 PLAN_WIDTH 로 고정하고 세로는 도면 비율로 정한다.
 */

import type { FloorPlanV2, RoomV2, CareManualZoneV2 } from '@/types/care-manual'
import type { ItemStatus } from '@/lib/care-manual-status'

export const PLAN_WIDTH = 12
export const WALL_HEIGHT: Record<RoomV2['kind'], number> = { room: 1.4, corridor: 0.9, core: 1.6, outdoor: 0.12 }

export function planSize(plan: FloorPlanV2): { width: number; depth: number } {
  const aspect = Math.min(4, Math.max(0.25, plan.aspect))
  return { width: PLAN_WIDTH, depth: PLAN_WIDTH / aspect }
}

/** 0~1 → 3D 바닥 좌표 (중심이 원점). y 아래 방향이 +z */
export function toWorld(plan: FloorPlanV2, p: [number, number]): [number, number] {
  const { width, depth } = planSize(plan)
  return [(p[0] - 0.5) * width, (p[1] - 0.5) * depth]
}

export function centroid(poly: [number, number][]): [number, number] {
  const n = poly.length || 1
  return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n]
}

/** 다각형의 가로·세로 크기 (0~1 단위) */
export function polyExtent(poly: [number, number][]): { w: number; h: number } {
  if (poly.length === 0) return { w: 0, h: 0 }
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1])
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

/** 한글·숫자 섞인 라벨의 대략적 가로 길이 (글자 수 × 0.62em 기준, 한글은 1em) */
function labelWidthEm(text: string): number {
  let em = 0
  for (const ch of text) em += /[가-힣]/.test(ch) ? 1 : 0.62
  return em
}

export interface FittedLabel { text: string; fontSize: number }

/**
 * 방 안에 들어가는 글자 크기 계산 (2026-11-09).
 *   - 방 높이의 45%, 방 너비에 맞춘 값, maxFont 중 가장 작은 값
 *   - 그래도 minFont 보다 작으면 "호실 2-01" → "2-01" 처럼 접두어를 떼고 다시 시도
 *   - 그래도 안 들어가면 null → 이름을 그리지 않는다 (선택·마우스 올림 때만 보여 주면 된다)
 */
export function fitLabel(
  name: string,
  poly: [number, number][],
  vbW: number,
  vbH: number,
  opts: { minFont?: number; maxFont?: number } = {},
): FittedLabel | null {
  const { minFont = 11, maxFont = 32 } = opts
  const text = name.trim()
  if (!text) return null
  const { w, h } = polyExtent(poly)
  const boxW = w * vbW * 0.9, boxH = h * vbH
  const candidates = [text, text.replace(/^(호실|객실|방)\s*/, '')].filter((t, i, a) => t && a.indexOf(t) === i)
  for (const t of candidates) {
    const size = Math.min(maxFont, boxH * 0.45, boxW / labelWidthEm(t))
    if (size >= minFont) return { text: t, fontSize: Math.round(size) }
  }
  return null
}

export function roomZone(room: RoomV2, zones: CareManualZoneV2[]): CareManualZoneV2 | undefined {
  return room.zone_id ? zones.find(z => z.id === room.zone_id) : undefined
}

export function roomStatus(room: RoomV2, zoneStatuses: Record<string, ItemStatus>): ItemStatus {
  return room.zone_id ? zoneStatuses[room.zone_id] ?? 'none' : 'none'
}

/** 층 목록 (도면 있는 층 + 구역만 있는 층) 낮은 층부터 */
export function plansByFloor(plans: FloorPlanV2[]): FloorPlanV2[] {
  return [...plans].sort((a, b) => a.floor - b.floor)
}

/** 3D 전체 크기 (카메라 거리 계산용) */
export function planBuildingSize(plans: FloorPlanV2[], floorHeight: number): { width: number; depth: number; height: number } {
  const sizes = plans.map(planSize)
  return {
    width: Math.max(...sizes.map(s => s.width), 1),
    depth: Math.max(...sizes.map(s => s.depth), 1),
    height: Math.max(plans.length - 1, 0) * floorHeight + 2,
  }
}
