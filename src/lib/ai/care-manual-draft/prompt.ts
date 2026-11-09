/**
 * 케어매뉴얼 초안 자동 추출 — Layer 1 (Input) (2026-11-08)
 *   도면·건축물대장·참고사진을 Claude 에게 주고 "구역 → 작업 묶음 → 품목" 초안을 JSON 으로 받는다.
 *   결과는 관리자가 검토해 고른 구역만 매뉴얼에 추가한다 (자동 저장 없음 = Human-in-the-loop).
 *
 * 프롬프트 버전: 바꿀 때마다 올리고 docs/plans/care-manual-3d-plan.md 의 변경 기록에 적는다.
 */

import type Anthropic from '@anthropic-ai/sdk'
import type { SpaceAssetV2 } from '@/types/care-manual'

export const PROMPT_VERSION = 'v1.0.0'
/**
 * 모델 — 기본 claude-opus-5-5(도면 읽기 정확도). 비용을 줄이려면 .env.local 에 CARE_MANUAL_AI_MODEL=claude-haiku-5-5 (약 1/40 비용, 정확도는 낮아질 수 있음)
 */
export const MODEL: string = process.env.CARE_MANUAL_AI_MODEL || 'claude-opus-5-5'
/** 단가 (USD / 1M 토큰, 2026-10 기준) — 비용 표시용. 바뀌면 갱신 */
export const PRICE_USD_PER_MTOK = { input: 4, output: 20 } as const
/** 원화 표시용 환율 — 정확한 청구가 아니라 "대략 얼마" 안내용 */
export const KRW_PER_USD = 1400

export const SYSTEM_PROMPT = `[ROLE]
당신은 상업 공간 청소 회사 "범빌드코리아(BBK)"의 공간케어 설계자입니다.
건축 도면·건축물대장·현장 사진을 읽고, 정기 청소(공간케어) 매뉴얼의 초안을 만드는 일을 합니다.
한국 상업 공간(사무실·매장·카페·주방·화장실·공용부)의 설비와 청소 작업을 잘 압니다.

[TASK]
주어진 자료에서 다음을 추출해 구조화하세요.
1. 구역(zone): 청소 관리 단위로 나눈 공간. 도면의 실(室) 이름·용도 기준. 층(floor)을 반드시 적는다.
2. 작업 묶음(group): 구역 안에서 비슷한 설비끼리 묶음 (예: 공조, 바닥·가구, 급수설비, 위생기구).
3. 품목(item): 실제 청소 대상 설비 하나하나. 제목은 "설비 + 작업" 형태 (예: 천장형 에어컨 필터 세척).
   - instructions: 작업 순서를 '- ' 글머리표 2~4줄로.
   - frequency: every(매회) / weekly(주 1회) / biweekly(격주) / monthly(월 1회) 중 하나. 모르면 null.
   - caution: 안전·파손 주의가 있으면 한 줄, 없으면 null.
4. notes: 자료에서 읽을 수 없었던 것, 현장에서 확인해야 할 것을 한국어로 적는다.

[FORMAT]
- 반드시 주어진 JSON 스키마대로만 출력한다. 설명 문장을 밖에 쓰지 않는다.
- 구역 이름은 "층 + 장소" 로 짧게 (예: "5F 사무실", "B1 주차장"). 같은 이름을 두 번 쓰지 않는다.
- 품목 제목 15자 이내, 설명 각 줄 30자 이내. 모두 한국어.
- 구역은 많아도 20개, 구역당 품목은 많아도 15개.

[CONSTRAINTS]
- 자료에 없는 공간을 지어내지 않는다. 불확실하면 notes 에 적고 빼는 쪽을 택한다.
- 개인 이름·연락처·차량번호 같은 개인정보는 어떤 필드에도 적지 않는다.
- 가격·견적·비용 이야기를 하지 않는다.
- "정기케어"라는 표현을 쓰지 않는다 (정기딥케어/정기엔드케어/1회성케어만 사용).`

/** 구조화 출력 스키마 — 모든 속성 required, additionalProperties false (API 요구사항) */
export const DRAFT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['zones', 'notes'],
  properties: {
    zones: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'floor', 'groups'],
        properties: {
          name: { type: 'string' },
          floor: { type: 'integer' },
          groups: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'items'],
              properties: {
                title: { type: 'string' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['title', 'instructions', 'frequency', 'caution'],
                    properties: {
                      title: { type: 'string' },
                      instructions: { type: 'string' },
                      frequency: { type: ['string', 'null'], enum: ['every', 'weekly', 'biweekly', 'monthly', null] },
                      caution: { type: ['string', 'null'] },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    notes: { type: 'string' },
  },
}

const KIND_LABEL: Record<SpaceAssetV2['kind'], string> = { floorplan: '도면', register: '건축물대장', photo: '참고사진', other: '기타 자료' }

/** API 가 읽을 수 있는 자료만 (PDF·JPG·PNG·WEBP). HEIC 등은 건너뛰고 이름을 돌려준다 */
export function splitReadableAssets(assets: SpaceAssetV2[]): { readable: SpaceAssetV2[]; skipped: SpaceAssetV2[] } {
  const ok = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  return {
    readable: assets.filter(a => ok.has(a.mime)),
    skipped: assets.filter(a => !ok.has(a.mime)),
  }
}

export interface DraftRequestContext {
  assets: SpaceAssetV2[]
  /** 관리자 힌트 (예: "5층 사무실, 탕비실 있음. 7층은 임원실") */
  hints?: string
  /** 이미 있는 구역 이름 — 중복 생성을 막기 위해 알려준다 */
  existingZoneNames: string[]
  /** 재시도 때 이전 초안의 문제점 */
  previousIssues?: string[]
  today: string
}

/**
 * 사용자 메시지 조립 — 자료 블록(PDF·이미지)을 앞에, 지시문을 맨 뒤에 (Lost in the Middle 방지)
 */
export function buildUserContent(ctx: DraftRequestContext): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = []
  ctx.assets.forEach((a, i) => {
    const label = `[자료 ${i + 1}] ${KIND_LABEL[a.kind]}${a.title ? ` · ${a.title}` : ''}`
    blocks.push({ type: 'text', text: label })
    if (a.mime === 'application/pdf') {
      blocks.push({ type: 'document', source: { type: 'url', url: a.url }, title: a.title || KIND_LABEL[a.kind] })
    } else {
      blocks.push({ type: 'image', source: { type: 'url', url: a.url } })
    }
  })

  const lines = [
    `오늘 날짜: ${ctx.today}`,
    ctx.hints?.trim() ? `관리자 힌트: ${ctx.hints.trim()}` : '관리자 힌트: 없음',
    ctx.existingZoneNames.length > 0
      ? `이미 등록된 구역 (같은 이름으로 다시 만들지 말 것): ${ctx.existingZoneNames.join(', ')}`
      : '이미 등록된 구역: 없음',
    ...(ctx.previousIssues?.length ? ['', '이전 초안의 문제점 — 이번에는 고쳐서 출력:', ...ctx.previousIssues.map(s => `- ${s}`)] : []),
    '',
    '위 자료를 읽고 구역 → 작업 묶음 → 품목 초안을 JSON 스키마대로 출력하세요.',
  ]
  blocks.push({ type: 'text', text: lines.join('\n') })
  return blocks
}

/** 토큰 사용량 → 대략 비용 (원) */
export function estimateCostKrw(usage: { input_tokens: number; output_tokens: number }): number {
  const usd = (usage.input_tokens / 1_000_000) * PRICE_USD_PER_MTOK.input + (usage.output_tokens / 1_000_000) * PRICE_USD_PER_MTOK.output
  return Math.round(usd * KRW_PER_USD)
}
