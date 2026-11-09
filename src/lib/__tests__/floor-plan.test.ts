import { describe, it, expect } from 'vitest'
import { parsePlanDraft, scorePlanDraft, polygonArea, matchZone, normalizeName, planDraftToFloorPlans, PLAN_PASS_THRESHOLD, type PlanDraft } from '@/lib/ai/floor-plan/validate'
import { FLOOR_PLAN_JSON_SCHEMA, buildFloorPlanContent } from '@/lib/ai/floor-plan/prompt'
import { normalizeCareManual, type SpaceAssetV2 } from '@/types/care-manual'

const rect = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]

const GOOD: PlanDraft = {
  floors: [
    { floor: 5, aspect: 1.6, rooms: [
      { name: '사무실', kind: 'room', polygon: rect(0, 0, 0.6, 1) },
      { name: '탕비실', kind: 'room', polygon: rect(0.6, 0, 0.4, 0.4) },
      { name: '복도', kind: 'corridor', polygon: rect(0.6, 0.4, 0.4, 0.3) },
      { name: '계단실', kind: 'core', polygon: rect(0.6, 0.7, 0.4, 0.3) },
    ] },
  ],
  notes: '도면 우측 하단 글씨가 흐려 계단실로 추정',
}
const EDGE: PlanDraft = {
  floors: [
    { floor: 1, aspect: 1, rooms: [{ name: '', kind: 'room', polygon: rect(0, 0, 0.1, 0.1) }] },
    { floor: 2, aspect: 1, rooms: [{ name: 'a', kind: 'room', polygon: [[0, 0], [1, 1]] }, { name: 'b', kind: 'room', polygon: rect(0, 0, 0.01, 0.01) }] },
  ],
  notes: '',
}

describe('parsePlanDraft — 0~1000 정수 좌표를 0~1 로', () => {
  it('좌표를 1000 으로 나누고 범위를 벗어나면 잘라낸다', () => {
    const d = parsePlanDraft({ floors: [{ floor: 3, aspect: 1.5, rooms: [{ name: '회의실', kind: 'room', polygon: [[0, 0], [1200, 0], [1000, 500], [-5, 500]] }] }], notes: 'x' })
    expect(d?.floors[0].rooms[0].polygon).toEqual([[0, 0], [1, 0], [1, 0.5], [0, 0.5]])
    expect(d?.floors[0].aspect).toBe(1.5)
  })
  it('이상한 종류·비율은 기본값으로', () => {
    const d = parsePlanDraft({ floors: [{ floor: 1.9, aspect: 50, rooms: [{ name: 'x', kind: 'garden', polygon: [] }] }], notes: 3 })
    expect(d?.floors[0]).toMatchObject({ floor: 1, aspect: 1.4 })
    expect(d?.floors[0].rooms[0].kind).toBe('room')
    expect(d?.notes).toBe('')
  })
  it('floors 가 없으면 null', () => { expect(parsePlanDraft({})).toBeNull() })
})

describe('polygonArea', () => {
  it('단위 정사각형의 절반 크기 사각형은 0.5', () => { expect(polygonArea(rect(0, 0, 1, 0.5))).toBeCloseTo(0.5) })
})

describe('scorePlanDraft — Rubric', () => {
  it('정상 도면은 합격', () => {
    const r = scorePlanDraft(GOOD)
    expect(r.pass).toBe(true)
    expect(r.total).toBeGreaterThanOrEqual(PLAN_PASS_THRESHOLD)
    expect(r.scores.coverage).toBe(15)
  })
  it('경계(방 1개·깨진 윤곽·이름 없음·넓이 부족)는 불합격 + 문제점', () => {
    const r = scorePlanDraft(EDGE)
    expect(r.pass).toBe(false)
    const text = r.issues.join(' ')
    expect(text).toContain('방이 2개 미만인 층')
    expect(text).toContain('윤곽이 깨졌거나')
    expect(text).toContain('이름 없는 방')
    expect(text).toContain('35%')
  })
  it('층이 없으면 불합격', () => { expect(scorePlanDraft({ floors: [], notes: '' }).pass).toBe(false) })
})

describe('방 ↔ 구역 자동 연결', () => {
  const manual = normalizeCareManual({
    version: 2,
    zones: [
      { id: 'z-off5', name: '5F 사무실', color: 'sky', groups: [], space: { floor: 5 } },
      { id: 'z-off6', name: '6F 사무실', color: 'mint', groups: [], space: { floor: 6 } },
      { id: 'z-pantry', name: '탕비실(5층)', color: 'rose', groups: [] },
    ],
  })
  it('normalizeName 은 층 표기·괄호·공백을 뗀다', () => {
    expect(normalizeName('5F 사무실')).toBe('사무실')
    expect(normalizeName('탕비실(5층)')).toBe('탕비실')
    expect(normalizeName('남자 화장실')).toBe('남자화장실')
  })
  it('같은 층 구역을 우선 고른다', () => {
    expect(matchZone({ name: '사무실', kind: 'room', polygon: rect(0, 0, 1, 1) }, 6, manual.zones)?.id).toBe('z-off6')
    expect(matchZone({ name: '사무실', kind: 'room', polygon: rect(0, 0, 1, 1) }, 5, manual.zones)?.id).toBe('z-off5')
    expect(matchZone({ name: '탕비실', kind: 'room', polygon: rect(0, 0, 1, 1) }, 5, manual.zones)?.id).toBe('z-pantry')
    expect(matchZone({ name: '기계실', kind: 'core', polygon: rect(0, 0, 1, 1) }, 5, manual.zones)).toBeUndefined()
  })
  it('planDraftToFloorPlans 는 방마다 구역을 연결하고 core 는 연결하지 않는다', () => {
    const plans = planDraftToFloorPlans(GOOD, manual.zones, 'asset-1', { 5: 'https://x/plan5.jpg' })
    expect(plans).toHaveLength(1)
    const byName = Object.fromEntries(plans[0].rooms.map(r => [r.name, r.zone_id]))
    expect(byName['사무실']).toBe('z-off5')
    expect(byName['탕비실']).toBe('z-pantry')
    expect(byName['계단실']).toBeUndefined()
    expect(plans[0]).toMatchObject({ floor: 5, aspect: 1.6, source_asset_id: 'asset-1', image_url: 'https://x/plan5.jpg' })
  })
})

describe('normalizeCareManual — floor_plans 보존', () => {
  it('좌표를 0~1 로 자르고 꼭짓점 3개 미만 방은 버린다', () => {
    const m = normalizeCareManual({
      version: 2, zones: [],
      floor_plans: [{ id: 'fp', floor: 2, aspect: 1.2, rooms: [
        { id: 'r1', name: '홀', kind: 'corridor', polygon: [[0, 0], [1.5, 0], [1, 1]], zone_id: 'z' },
        { id: 'r2', name: 'bad', kind: 'room', polygon: [[0, 0], [1, 1]] },
        null,
      ] }, { floor: 'x' }],
    } as unknown)
    expect(m.floor_plans).toHaveLength(1)
    expect(m.floor_plans?.[0].rooms).toHaveLength(1)
    expect(m.floor_plans?.[0].rooms[0].polygon[1]).toEqual([1, 0])
  })
})

describe('prompt', () => {
  const asset = (over: Partial<SpaceAssetV2>): SpaceAssetV2 => ({ id: 'p', kind: 'floorplan', title: '5층', url: 'https://x/p.pdf', mime: 'application/pdf', size: 1, uploaded_at: '', ...over })
  it('도면이 먼저, 참고 자료 다음, 지시문 마지막', () => {
    const blocks = buildFloorPlanContent({ plans: [asset({})], references: [asset({ id: 'r', kind: 'register', url: 'https://x/r.jpg', mime: 'image/jpeg' })], hints: '5층' })
    expect(blocks.map(b => b.type)).toEqual(['text', 'document', 'text', 'image', 'text'])
    const first = blocks[0]
    expect(first.type === 'text' && first.text).toContain('[도면 1]')
  })
  it('도면이 없고 설명만 있으면 설명 블록 + 설명용 지시문', () => {
    const blocks = buildFloorPlanContent({ plans: [], references: [], description: '1층 왼쪽 주방, 오른쪽 홀' })
    expect(blocks.map(b => b.type)).toEqual(['text', 'text'])
    const first = blocks[0]
    expect(first.type === 'text' && first.text).toContain('배치 설명')
    expect(first.type === 'text' && first.text).toContain('왼쪽 주방')
    const last = blocks[1]
    expect(last.type === 'text' && last.text).toContain('배치 설명을 근거로')
  })
  it('도면이 있으면 설명은 무시한다', () => {
    const blocks = buildFloorPlanContent({ plans: [asset({})], references: [], description: '무시될 글' })
    expect(JSON.stringify(blocks)).not.toContain('무시될 글')
  })
  it('스키마는 모든 속성 required + additionalProperties false', () => {
    const walk = (s: unknown): void => {
      if (!s || typeof s !== 'object') return
      const o = s as Record<string, unknown>
      if (o.type === 'object') {
        expect(o.additionalProperties).toBe(false)
        expect(Object.keys(o.properties as object).sort()).toEqual([...(o.required as string[])].sort())
        Object.values(o.properties as object).forEach(walk)
      }
      if (o.type === 'array') walk(o.items)
    }
    walk(FLOOR_PLAN_JSON_SCHEMA)
  })
})
