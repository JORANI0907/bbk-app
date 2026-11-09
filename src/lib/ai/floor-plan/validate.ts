/**
 * 도면 분석 — Layer 3 (Evaluation) (2026-11-08)
 *   모델 출력 → 좌표 정리(0~1000 → 0~1) → Rubric 채점 → 합격이면 FloorPlanV2 로 변환.
 *   방 ↔ 구역 자동 연결(이름 비슷하면)도 여기서.
 */

import type { CareManualZoneV2, FloorPlanV2, RoomKind, RoomV2 } from '@/types/care-manual'
import { ROOM_KINDS, newManualId } from '@/types/care-manual'

export interface PlanRoomDraft { name: string; kind: RoomKind; polygon: [number, number][] }
export interface PlanFloorDraft { floor: number; aspect: number; rooms: PlanRoomDraft[] }
export interface PlanDraft { floors: PlanFloorDraft[]; notes: string }

export const PLAN_LIMITS = { maxFloors: 30, maxRooms: 40, maxPoints: 12, nameMax: 40, notesMax: 1500 } as const
export const PLAN_PASS_THRESHOLD = 70

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const KINDS: readonly string[] = ROOM_KINDS

function toUnit(p: unknown): [number, number] | null {
  if (!Array.isArray(p) || !isNum(p[0]) || !isNum(p[1])) return null
  const c = (v: number) => Math.min(1, Math.max(0, v / 1000))
  return [c(p[0]), c(p[1])]
}

export function parsePlanDraft(raw: unknown): PlanDraft | null {
  if (!isObj(raw) || !Array.isArray(raw.floors)) return null
  const floors: PlanFloorDraft[] = raw.floors.filter(isObj).slice(0, PLAN_LIMITS.maxFloors).map(f => ({
    floor: isNum(f.floor) ? Math.trunc(f.floor) : 1,
    aspect: isNum(f.aspect) && f.aspect > 0.1 && f.aspect < 10 ? f.aspect : 1.4,
    rooms: (Array.isArray(f.rooms) ? f.rooms : []).filter(isObj).slice(0, PLAN_LIMITS.maxRooms).map(r => ({
      name: typeof r.name === 'string' ? r.name.trim().slice(0, PLAN_LIMITS.nameMax) : '',
      kind: typeof r.kind === 'string' && KINDS.includes(r.kind) ? (r.kind as RoomKind) : 'room',
      polygon: (Array.isArray(r.polygon) ? r.polygon : []).map(toUnit).filter((p): p is [number, number] => p !== null).slice(0, PLAN_LIMITS.maxPoints),
    })),
  }))
  return { floors, notes: typeof raw.notes === 'string' ? raw.notes.slice(0, PLAN_LIMITS.notesMax) : '' }
}

/** 다각형 넓이 (0~1 좌표 기준, 양수) */
export function polygonArea(poly: [number, number][]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s) / 2
}

export interface PlanRubric { scores: Record<string, number>; total: number; pass: boolean; issues: string[] }

/**
 * Rubric (100점, 합격 70)
 *   floors    15  층 1개 이상 (0이면 즉시 불합격)
 *   rooms     20  방이 2개 이상인 층 비율
 *   geometry  25  꼭짓점 3개 이상 · 넓이 0.002 이상(너무 작지 않음)인 방 비율
 *   coverage  15  층별 방 넓이 합이 0.35~1.3 (외곽을 대충이라도 채움)
 *   names     15  이름 있는 방 비율
 *   safety    10  개인정보 없음
 */
export function scorePlanDraft(d: PlanDraft): PlanRubric {
  const issues: string[] = []
  const floors = d.floors.length > 0 ? 15 : 0
  if (floors === 0) issues.push('층이 하나도 없음')

  const withRooms = d.floors.filter(f => f.rooms.length >= 2).length
  const rooms = d.floors.length ? Math.round((withRooms / d.floors.length) * 20) : 0
  if (withRooms < d.floors.length) issues.push(`방이 2개 미만인 층: ${d.floors.filter(f => f.rooms.length < 2).map(f => `${f.floor}층`).join(', ')}`)

  const all = d.floors.flatMap(f => f.rooms)
  const good = all.filter(r => r.polygon.length >= 3 && polygonArea(r.polygon) >= 0.002).length
  const geometry = all.length ? Math.round((good / all.length) * 25) : 0
  if (good < all.length) issues.push(`윤곽이 깨졌거나 너무 작은 방 ${all.length - good}개 (꼭짓점 3개 이상, 넓이 확보)`)

  const covered = d.floors.filter(f => { const a = f.rooms.reduce((s, r) => s + polygonArea(r.polygon), 0); return a >= 0.35 && a <= 1.3 }).length
  const coverage = d.floors.length ? Math.round((covered / d.floors.length) * 15) : 0
  if (covered < d.floors.length) issues.push('방 넓이 합이 건물 외곽의 35%~130% 를 벗어난 층이 있음 — 방을 빠뜨렸거나 좌표가 0~1000 범위를 안 지킴')

  const named = all.filter(r => r.name).length
  const names = all.length ? Math.round((named / all.length) * 15) : 0
  if (named < all.length) issues.push(`이름 없는 방 ${all.length - named}개 — 용도라도 "(추정)" 으로 적을 것`)

  const unsafe = /01[016789]-?\d{3,4}-?\d{4}/.test(JSON.stringify(d))
  const safety = unsafe ? 0 : 10
  if (unsafe) issues.push('연락처 같은 개인정보가 들어 있음')

  const scores = { floors, rooms, geometry, coverage, names, safety }
  const total = Object.values(scores).reduce((a, b) => a + b, 0)
  return { scores, total, pass: total >= PLAN_PASS_THRESHOLD && floors > 0, issues: Array.from(new Set(issues)).slice(0, 10) }
}

/** 이름 비교용: 공백·층 표기·괄호 제거 */
export function normalizeName(s: string): string {
  return s.replace(/\(.*?\)/g, '').replace(/\b[bB]?\d+\s*[fF층]\b/g, '').replace(/지하\s*\d+층?/g, '').replace(/[\s·.\-_]/g, '').toLowerCase()
}

/** 방 이름과 가장 비슷한 구역 (같은 층 우선). 없으면 undefined */
export function matchZone(room: PlanRoomDraft, floor: number, zones: CareManualZoneV2[]): CareManualZoneV2 | undefined {
  const r = normalizeName(room.name)
  if (!r) return undefined
  const candidates = zones.filter(z => { const n = normalizeName(z.name); return !!n && (n === r || n.includes(r) || r.includes(n)) })
  return candidates.find(z => (z.space?.floor ?? 1) === floor) ?? candidates[0]
}

/** 합격한 초안 → FloorPlanV2[] (방 ↔ 구역 자동 연결 포함) */
export function planDraftToFloorPlans(d: PlanDraft, zones: CareManualZoneV2[], sourceAssetId?: string, imageUrlByFloor?: Record<number, string>): FloorPlanV2[] {
  return d.floors.map(f => {
    const id = newManualId()
    const rooms: RoomV2[] = f.rooms
      .filter(r => r.polygon.length >= 3)
      .map(r => {
        const zone = r.kind === 'room' || r.kind === 'corridor' ? matchZone(r, f.floor, zones) : undefined
        return { id: newManualId(), name: r.name, kind: r.kind, polygon: r.polygon, ...(zone ? { zone_id: zone.id } : {}) }
      })
    const img = imageUrlByFloor?.[f.floor]
    return { id, floor: f.floor, aspect: f.aspect, ...(sourceAssetId ? { source_asset_id: sourceAssetId } : {}), ...(img ? { image_url: img } : {}), rooms }
  })
}
