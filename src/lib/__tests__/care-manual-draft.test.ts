import { describe, it, expect } from 'vitest'
import { parseDraft, scoreDraft, draftToZones, PASS_THRESHOLD, type Draft } from '@/lib/ai/care-manual-draft/validate'
import { buildUserContent, splitReadableAssets, estimateCostKrw, DRAFT_JSON_SCHEMA } from '@/lib/ai/care-manual-draft/prompt'
import type { SpaceAssetV2 } from '@/types/care-manual'

// ─── 테스트셋: 정상 · 경계 · 실패 ───────────────────────────────
const GOOD: Draft = {
  zones: [
    { name: '5F 사무실', floor: 5, groups: [
      { title: '공조', items: [
        { title: '천장형 에어컨 필터 세척', instructions: '- 필터 분리\n- 중성세제 세척 후 건조\n- 재장착', frequency: 'monthly', caution: '전원 차단 후 작업' },
        { title: '환기구 먼지 제거', instructions: '- 그릴 분리\n- 진공 후 물걸레', frequency: 'biweekly', caution: null },
      ] },
      { title: '바닥·가구', items: [
        { title: '카펫 진공·얼룩 처리', instructions: '- 전체 진공\n- 얼룩 부위 약품 처리', frequency: 'weekly', caution: null },
      ] },
    ] },
    { name: '5F 탕비실', floor: 5, groups: [
      { title: '급수설비', items: [
        { title: '정수기 외부·배수 트레이', instructions: '- 외부 닦기\n- 트레이 비우고 세척', frequency: 'every', caution: null },
      ] },
    ] },
  ],
  notes: '7층 도면은 해상도가 낮아 실 구분이 어려움. 현장 확인 필요.',
}

const EDGE: Draft = {
  zones: [
    { name: '1F 홀', floor: 1, groups: [{ title: '바닥', items: [
      { title: '바닥 청소', instructions: '닦기', frequency: null, caution: null },
      { title: '바닥 청소', instructions: '다시 닦기', frequency: null, caution: null },
    ] }] },
    { name: '1F 창고', floor: 1, groups: [] },
  ],
  notes: '',
}

const BAD: Draft = { zones: [], notes: '도면을 읽을 수 없음' }

describe('parseDraft — 느슨한 입력을 형식에 맞춘다', () => {
  it('정상 JSON 을 그대로 통과시킨다', () => {
    const d = parseDraft(JSON.parse(JSON.stringify(GOOD)))
    expect(d?.zones).toHaveLength(2)
    expect(d?.zones[0].groups[0].items[0].frequency).toBe('monthly')
  })
  it('잘못된 빈도·null 요소·긴 문자열을 정리한다', () => {
    const d = parseDraft({ zones: [null, { name: 'x'.repeat(100), floor: 2.9, groups: [{ title: 'g', items: [{ title: 't', instructions: 'i', frequency: 'daily', caution: '' }] }] }], notes: 5 })
    expect(d?.zones).toHaveLength(1)
    expect(d?.zones[0].name).toHaveLength(40)
    expect(d?.zones[0].floor).toBe(2)
    expect(d?.zones[0].groups[0].items[0].frequency).toBeNull()
    expect(d?.zones[0].groups[0].items[0].caution).toBeNull()
    expect(d?.notes).toBe('')
  })
  it('zones 배열이 없으면 null', () => {
    expect(parseDraft({ notes: 'x' })).toBeNull()
    expect(parseDraft('nope')).toBeNull()
  })
})

describe('scoreDraft — Rubric', () => {
  it('정상 케이스는 합격', () => {
    const r = scoreDraft(GOOD)
    expect(r.total).toBeGreaterThanOrEqual(PASS_THRESHOLD)
    expect(r.pass).toBe(true)
    expect(r.scores.safety).toBe(10)
  })
  it('경계 케이스(중복 제목·빈 구역·짧은 설명·빈도 없음)는 불합격이고 문제점을 알려준다', () => {
    const r = scoreDraft(EDGE)
    expect(r.pass).toBe(false)
    expect(r.issues.join(' ')).toContain('중복 품목')
    expect(r.issues.join(' ')).toContain('품목이 없는 구역')
    expect(r.scores.coverage).toBe(10)
  })
  it('구역이 없으면 0점대 불합격', () => {
    const r = scoreDraft(BAD)
    expect(r.pass).toBe(false)
    expect(r.scores.zones).toBe(0)
  })
  it('개인정보·금지어가 있으면 safety 0', () => {
    const d: Draft = { ...GOOD, notes: '담당자 010-1234-5678 에게 정기케어 문의' }
    const r = scoreDraft(d)
    expect(r.scores.safety).toBe(0)
  })
})

describe('draftToZones — 매뉴얼 구역으로 변환', () => {
  it('새 id 를 붙이고 층·빈도·주의를 옮기며 빈 묶음은 뺀다', () => {
    const zones = draftToZones(GOOD, 1)
    expect(zones).toHaveLength(2)
    expect(zones[0].space).toEqual({ floor: 5 })
    expect(zones[0].color).toBe('mint') // 기존 구역 1개 다음 색
    expect(zones[0].groups[0].items[0]).toMatchObject({ title: '천장형 에어컨 필터 세척', frequency: 'monthly', caution: '전원 차단 후 작업', images: [] })
    expect(zones[0].groups[0].items[1]).not.toHaveProperty('caution')
    const edgeZones = draftToZones(EDGE, 0)
    expect(edgeZones[1].groups).toHaveLength(0)
  })
})

describe('prompt — 입력 조립', () => {
  const asset = (over: Partial<SpaceAssetV2>): SpaceAssetV2 => ({ id: 'a', kind: 'floorplan', title: '5층 평면도', url: 'https://x/a.pdf', mime: 'application/pdf', size: 1, uploaded_at: '', ...over })

  it('PDF 는 document, 사진은 image 블록이 되고 지시문은 맨 뒤', () => {
    const blocks = buildUserContent({
      assets: [asset({}), asset({ id: 'b', kind: 'photo', url: 'https://x/b.jpg', mime: 'image/jpeg', title: '' })],
      hints: '5층 사무실',
      existingZoneNames: ['1F 로비'],
      today: '2026-11-08',
    })
    expect(blocks.map(b => b.type)).toEqual(['text', 'document', 'text', 'image', 'text'])
    const last = blocks[blocks.length - 1]
    expect(last.type === 'text' && last.text).toContain('1F 로비')
    expect(last.type === 'text' && last.text).toContain('5층 사무실')
  })
  it('재시도 때 이전 문제점을 덧붙인다', () => {
    const blocks = buildUserContent({ assets: [asset({})], existingZoneNames: [], today: '2026-11-08', previousIssues: ['구역이 하나도 없음'] })
    const last = blocks[blocks.length - 1]
    expect(last.type === 'text' && last.text).toContain('구역이 하나도 없음')
  })
  it('HEIC 처럼 못 읽는 자료는 건너뛴다', () => {
    const { readable, skipped } = splitReadableAssets([asset({}), asset({ id: 'h', mime: 'image/heic' })])
    expect(readable).toHaveLength(1)
    expect(skipped[0].id).toBe('h')
  })
  it('스키마는 모든 속성을 required 로 두고 추가 속성을 막는다 (구조화 출력 요구사항)', () => {
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
    walk(DRAFT_JSON_SCHEMA)
  })
  it('비용 추정: 입력 10만·출력 5천 토큰 ≈ 700원대', () => {
    const krw = estimateCostKrw({ input_tokens: 100_000, output_tokens: 5_000 })
    expect(krw).toBeGreaterThan(600)
    expect(krw).toBeLessThan(800)
  })
})
