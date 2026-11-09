/**
 * 케어매뉴얼 초안 — Layer 3 (Evaluation) (2026-11-08)
 *   모델 출력(JSON) → 형식 검증 → 숫자 Rubric 채점 → 합격이면 매뉴얼 구역으로 변환.
 *   Rubric 은 docs/plans/care-manual-3d-plan.md 에도 같은 내용이 적혀 있다. 바꾸면 둘 다 바꾼다.
 */

import type { CareManualZoneV2, Frequency } from '@/types/care-manual'
import { FREQUENCY_OPTIONS, ZONE_COLORS, newManualId } from '@/types/care-manual'

export interface DraftItem {
  title: string
  instructions: string
  frequency: Frequency | null
  caution: string | null
}
export interface DraftGroup { title: string; items: DraftItem[] }
export interface DraftZone { name: string; floor: number; groups: DraftGroup[] }
export interface Draft { zones: DraftZone[]; notes: string }

export const LIMITS = {
  maxZones: 20,
  maxItemsPerZone: 15,
  titleMax: 40,
  instructionsMax: 600,
  cautionMax: 200,
  notesMax: 1500,
} as const

const FREQ: readonly string[] = FREQUENCY_OPTIONS.map(o => o.value)
const PII_RE = /01[016789]-?\d{3,4}-?\d{4}|\d{2,3}[가-힣]\d{4}/ // 휴대전화 · 차량번호

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const clip = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** 느슨하게 받아 형식만 맞춘다 (채점은 scoreDraft 가). 전혀 아니면 null */
export function parseDraft(raw: unknown): Draft | null {
  if (!isObj(raw) || !Array.isArray(raw.zones)) return null
  const zones: DraftZone[] = raw.zones.filter(isObj).slice(0, LIMITS.maxZones).map(z => ({
    name: clip(z.name, LIMITS.titleMax),
    floor: typeof z.floor === 'number' && Number.isFinite(z.floor) ? Math.trunc(z.floor) : 1,
    groups: (Array.isArray(z.groups) ? z.groups : []).filter(isObj).map(g => ({
      title: clip(g.title, LIMITS.titleMax),
      items: (Array.isArray(g.items) ? g.items : []).filter(isObj).map(i => ({
        title: clip(i.title, LIMITS.titleMax),
        instructions: clip(i.instructions, LIMITS.instructionsMax),
        frequency: typeof i.frequency === 'string' && FREQ.includes(i.frequency) ? (i.frequency as Frequency) : null,
        caution: clip(i.caution, LIMITS.cautionMax) || null,
      })),
    })),
  }))
  return { zones, notes: clip(raw.notes, LIMITS.notesMax) }
}

export interface RubricResult {
  scores: Record<string, number>
  total: number
  pass: boolean
  issues: string[]
}

export const PASS_THRESHOLD = 70

/**
 * Rubric (총 100점, 합격 70점)
 *   zones      20  구역 1~20개면 만점, 0개 또는 초과면 0
 *   coverage   20  모든 구역에 품목이 1개 이상 (비율 배점)
 *   titles     20  품목 제목이 비어 있지 않고 구역 안에서 중복 없음 (비율)
 *   detail     20  설명이 10자 이상인 품목 비율
 *   frequency  10  빈도가 정해진 품목 비율
 *   safety     10  개인정보·금지어("정기케어")·가격 언급 없음 (하나라도 있으면 0)
 */
export function scoreDraft(d: Draft): RubricResult {
  const issues: string[] = []
  const items = d.zones.flatMap(z => z.groups.flatMap(g => g.items.map(i => ({ zone: z.name, ...i }))))
  const n = items.length

  const zones = d.zones.length >= 1 && d.zones.length <= LIMITS.maxZones ? 20 : 0
  if (zones === 0) issues.push(d.zones.length === 0 ? '구역이 하나도 없음' : `구역이 ${d.zones.length}개로 너무 많음 (최대 ${LIMITS.maxZones})`)

  const zonesWithItems = d.zones.filter(z => z.groups.some(g => g.items.length > 0)).length
  const coverage = d.zones.length ? Math.round((zonesWithItems / d.zones.length) * 20) : 0
  if (zonesWithItems < d.zones.length) issues.push(`품목이 없는 구역 ${d.zones.length - zonesWithItems}개: ${d.zones.filter(z => !z.groups.some(g => g.items.length)).map(z => z.name || '(이름 없음)').join(', ')}`)

  let goodTitles = 0
  for (const z of d.zones) {
    const seen = new Set<string>()
    for (const g of z.groups) for (const i of g.items) {
      const key = i.title.replace(/\s+/g, '')
      if (key && !seen.has(key)) { goodTitles += 1; seen.add(key) }
      else issues.push(`"${z.name}" 구역에 ${key ? `중복 품목 "${i.title}"` : '제목 없는 품목'}`)
    }
  }
  const titles = n ? Math.round((goodTitles / n) * 20) : 0

  const detailed = items.filter(i => i.instructions.length >= 10).length
  const detail = n ? Math.round((detailed / n) * 20) : 0
  if (n && detailed / n < 0.8) issues.push(`설명이 10자 미만인 품목 ${n - detailed}개`)

  const withFreq = items.filter(i => i.frequency).length
  const frequency = n ? Math.round((withFreq / n) * 10) : 0
  if (n && withFreq / n < 0.6) issues.push(`빈도(frequency)가 비어 있는 품목 ${n - withFreq}개 — 모를 때만 null`)

  const text = JSON.stringify(d)
  const unsafe = PII_RE.test(text) || text.includes('정기케어') || /\d+\s*(원|만원)/.test(text)
  const safety = unsafe ? 0 : 10
  if (unsafe) issues.push('개인정보·"정기케어"·금액 표현이 들어 있음')

  const scores = { zones, coverage, titles, detail, frequency, safety }
  const total = Object.values(scores).reduce((a, b) => a + b, 0)
  return { scores, total, pass: total >= PASS_THRESHOLD && zones > 0, issues: Array.from(new Set(issues)).slice(0, 12) }
}

/** 합격한 초안 → 매뉴얼 구역 (새 id · 색은 기존 구역 수에 이어서) */
export function draftToZones(d: Draft, existingZoneCount: number): CareManualZoneV2[] {
  return d.zones.map((z, zi) => ({
    id: newManualId(),
    name: z.name,
    color: ZONE_COLORS[(existingZoneCount + zi) % ZONE_COLORS.length],
    space: { floor: z.floor },
    groups: z.groups
      .filter(g => g.items.length > 0)
      .map(g => ({
        id: newManualId(),
        title: g.title,
        items: g.items.slice(0, LIMITS.maxItemsPerZone).map(i => ({
          id: newManualId(),
          title: i.title,
          instructions: i.instructions,
          ...(i.caution ? { caution: i.caution } : {}),
          ...(i.frequency ? { frequency: i.frequency } : {}),
          images: [],
        })),
      })),
  }))
}
