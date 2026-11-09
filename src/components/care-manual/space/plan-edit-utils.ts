/**
 * 평면 그리기 도구의 순수 계산 (2026-11-08). 좌표는 모두 0~1 비율.
 *   - 격자 맞춤(snap), 끌어서 네모 만들기, 방 통째로 옮기기, 네모 모서리 늘리기, 꼭짓점 하나 옮기기
 */

import type { RoomV2 } from '@/types/care-manual'

export const GRID = 0.02
export const MIN_SIZE = 0.04

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
export const snap = (v: number, grid = GRID) => clamp01(Math.round(v / grid) * grid)

export type Pt = [number, number]

/** 두 점으로 네모 (시계 방향, 격자 맞춤). 너무 작으면 null */
export function rectFromDrag(a: Pt, b: Pt): Pt[] | null {
  const x1 = snap(Math.min(a[0], b[0])), x2 = snap(Math.max(a[0], b[0]))
  const y1 = snap(Math.min(a[1], b[1])), y2 = snap(Math.max(a[1], b[1]))
  if (x2 - x1 < MIN_SIZE || y2 - y1 < MIN_SIZE) return null
  return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
}

/** 축에 나란한 네모인가 (꼭짓점 4개, 변이 수직/수평) */
export function isAxisRect(poly: Pt[]): boolean {
  if (poly.length !== 4) return false
  const eq = (a: number, b: number) => Math.abs(a - b) < 1e-6
  const [p0, p1, p2, p3] = poly
  return (eq(p0[1], p1[1]) && eq(p1[0], p2[0]) && eq(p2[1], p3[1]) && eq(p3[0], p0[0]))
    || (eq(p0[0], p1[0]) && eq(p1[1], p2[1]) && eq(p2[0], p3[0]) && eq(p3[1], p0[1]))
}

export function bbox(poly: Pt[]): { x1: number; y1: number; x2: number; y2: number } {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1])
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) }
}

/** 방 전체를 dx, dy 만큼 옮기기 (0~1 안에 머물도록) */
export function translatePoly(poly: Pt[], dx: number, dy: number): Pt[] {
  const b = bbox(poly)
  const ddx = Math.min(1 - b.x2, Math.max(-b.x1, dx))
  const ddy = Math.min(1 - b.y2, Math.max(-b.y1, dy))
  return poly.map(([x, y]) => [snap(x + ddx), snap(y + ddy)])
}

/**
 * 네모의 꼭짓점 하나를 끌면 → 네모 유지하며 크기 조절 (마주보는 꼭짓점 고정)
 *   네모가 아니면 그 꼭짓점만 옮긴다.
 */
export function dragVertex(poly: Pt[], index: number, to: Pt): Pt[] {
  const target: Pt = [snap(to[0]), snap(to[1])]
  if (!isAxisRect(poly)) return poly.map((p, i) => (i === index ? target : p))
  const opposite = poly[(index + 2) % 4]
  const x1 = Math.min(opposite[0], target[0]), x2 = Math.max(opposite[0], target[0])
  const y1 = Math.min(opposite[1], target[1]), y2 = Math.max(opposite[1], target[1])
  if (x2 - x1 < MIN_SIZE || y2 - y1 < MIN_SIZE) return poly
  return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
}

/** 새 방 기본값 */
export function newRoom(id: string, poly: Pt[], name = ''): RoomV2 {
  return { id, name, kind: 'room', polygon: poly }
}

/** 같은 층에서 비어 있는 방 이름 자동 (방 1, 방 2 …) */
export function nextRoomName(rooms: RoomV2[]): string {
  let n = rooms.length + 1
  const names = new Set(rooms.map(r => r.name))
  while (names.has(`방 ${n}`)) n += 1
  return `방 ${n}`
}
