/**
 * 도면 분석 — Layer 1 (Input) (2026-11-08)
 *   도면(이미지·PDF)을 Claude 에게 주고 층별 "방 윤곽(다각형)" 을 0~1000 정수 좌표로 받는다.
 *   앱은 이 좌표로 평면도(SVG)와 3D(벽 올리기)를 그린다. Blender 없이 도면 기반 모형이 나온다.
 *   정확도 목표: 방의 위치·크기·인접 관계가 맞으면 된다 (cm 단위 정밀도는 필요 없음, 안내판 역할).
 */

import type Anthropic from '@anthropic-ai/sdk'
import type { SpaceAssetV2 } from '@/types/care-manual'

export const FLOOR_PLAN_PROMPT_VERSION = 'v1.0.0'
/**
 * 모델 — 기본 claude-opus-5-5(도면 읽기 정확도). 비용을 줄이려면 .env.local 에 CARE_MANUAL_AI_MODEL=claude-haiku-5-5 (약 1/40 비용, 정확도는 낮아질 수 있음)
 */
export const FLOOR_PLAN_MODEL: string = process.env.CARE_MANUAL_AI_MODEL || 'claude-opus-5-5'

export const FLOOR_PLAN_SYSTEM_PROMPT = `[ROLE]
당신은 건축 도면을 읽어 공간 구조를 좌표로 옮기는 분석가입니다.
한국 상업 건물의 평면도(사무실·매장·주방·화장실·복도·계단실·엘리베이터)에 익숙합니다.

[TASK]
주어진 도면 이미지마다 다음을 추출하세요. 도면 대신 "배치 설명" 글이 주어지면 그 글을 근거로 배치를 추정해 같은 형식으로 만듭니다
(설명에 없는 방은 만들지 말고, 크기·위치를 추정한 부분은 notes 에 적습니다).
1. floor: 이 도면이 몇 층인지. 도면 제목·범례·관리자 힌트로 판단. 지하는 음수(-1). 모르면 힌트의 층, 그것도 없으면 1.
2. aspect: 도면에서 건물 외곽이 차지하는 영역의 가로/세로 비율 (예: 가로가 세로의 1.6배면 1.6).
3. rooms: 벽으로 구분된 각 공간을 다각형으로. 좌표는 **건물 외곽을 꽉 채운 사각형**을 기준으로 x·y 모두 0~1000 정수.
   - x 는 왼쪽 0 → 오른쪽 1000, y 는 위 0 → 아래 1000.
   - 꼭짓점은 시계 방향, 3~12개. 직사각형 방은 4개.
   - name: 도면에 적힌 실 이름 그대로 (예: "사무실", "탕비실", "남자화장실"). 없으면 용도 추정 ("회의실(추정)").
   - kind: room(일반 실) / corridor(복도·홀) / core(계단·엘리베이터·기계실·PS) / outdoor(발코니·외부).
4. notes: 읽기 어려웠던 부분, 겹치는 실, 추정한 내용.

[FORMAT]
- 반드시 JSON 스키마대로만 출력. 설명 문장 금지.
- 방은 층당 최대 40개. 너무 작은 공간(PS·덕트)은 core 로 묶거나 생략.
- 인접한 방끼리 좌표가 서로 겹치지 않게, 틈도 크지 않게.

[CONSTRAINTS]
- 도면에 없는 공간을 지어내지 않는다.
- 개인 이름·연락처·주소 같은 개인정보는 어떤 필드에도 적지 않는다.
- 건축물대장은 층수·면적 참고용으로만 쓰고, 방 좌표는 도면에서만 뽑는다.`

export const FLOOR_PLAN_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['floors', 'notes'],
  properties: {
    floors: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['floor', 'aspect', 'rooms'],
        properties: {
          floor: { type: 'integer' },
          aspect: { type: 'number' },
          rooms: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'kind', 'polygon'],
              properties: {
                name: { type: 'string' },
                kind: { type: 'string', enum: ['room', 'corridor', 'core', 'outdoor'] },
                polygon: {
                  type: 'array',
                  items: { type: 'array', items: { type: 'integer' } },
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

export interface FloorPlanRequestContext {
  /** 도면 (분석 대상). 비어 있으면 description 으로 */
  plans: SpaceAssetV2[]
  /** 관리자가 글로 적은 배치 설명 (도면이 없을 때) */
  description?: string
  /** 건축물대장 등 참고 자료 (좌표 추출 대상 아님) */
  references: SpaceAssetV2[]
  hints?: string
  previousIssues?: string[]
}

export function buildFloorPlanContent(ctx: FloorPlanRequestContext): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = []
  const push = (a: SpaceAssetV2, label: string) => {
    blocks.push({ type: 'text', text: label })
    if (a.mime === 'application/pdf') blocks.push({ type: 'document', source: { type: 'url', url: a.url }, title: a.title || KIND_LABEL[a.kind] })
    else blocks.push({ type: 'image', source: { type: 'url', url: a.url } })
  }
  ctx.plans.forEach((a, i) => push(a, `[도면 ${i + 1}] ${a.title || '이름 없음'}`))
  if (ctx.plans.length === 0 && ctx.description?.trim()) {
    blocks.push({ type: 'text', text: `[배치 설명 — 도면 대신 이 글을 근거로 한다]\n${ctx.description.trim()}` })
  }
  ctx.references.forEach((a, i) => push(a, `[참고 ${i + 1}] ${KIND_LABEL[a.kind]}${a.title ? ` · ${a.title}` : ''} (좌표 추출 대상 아님)`))

  const lines = [
    ctx.hints?.trim() ? `관리자 힌트: ${ctx.hints.trim()}` : '관리자 힌트: 없음',
    ...(ctx.previousIssues?.length ? ['', '이전 결과의 문제점 — 이번에는 고쳐서 출력:', ...ctx.previousIssues.map(s => `- ${s}`)] : []),
    '',
    ctx.plans.length > 0
      ? `도면 ${ctx.plans.length}장을 각각 한 층으로 보고, 층별 방 윤곽을 JSON 스키마대로 출력하세요. 도면 한 장에 여러 층이 있으면 층마다 나눠 주세요.`
      : '위 배치 설명을 근거로 층별 방 윤곽을 JSON 스키마대로 출력하세요. 방향(왼쪽·오른쪽·안쪽·입구)을 좌표에 반영하고, 언급된 방은 빠짐없이 넣으세요.',
  ]
  blocks.push({ type: 'text', text: lines.join('\n') })
  return blocks
}
