import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { normalizeCareManual } from '@/types/care-manual'
import { splitReadableAssets, estimateCostKrw } from '@/lib/ai/care-manual-draft/prompt'
import { FLOOR_PLAN_MODEL, FLOOR_PLAN_PROMPT_VERSION, FLOOR_PLAN_SYSTEM_PROMPT, FLOOR_PLAN_JSON_SCHEMA, buildFloorPlanContent } from '@/lib/ai/floor-plan/prompt'
import { parsePlanDraft, scorePlanDraft, type PlanDraft, type PlanRubric } from '@/lib/ai/floor-plan/validate'
import { mergeAssets, parseInlineAssets } from '@/lib/ai/inline-assets'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * 도면 분석 → 층별 방 윤곽 (2026-11-08, 하네스 4-Layer)
 *   POST { plan_asset_ids: string[], reference_asset_ids?: string[], hints?: string, description?: string }
 *   도면 없이 description(배치 설명 글)만으로도 만들 수 있다 (10자 이상).
 *   assets: 아직 [저장] 안 한 자료를 화면이 함께 보낸다 (우리 저장소·이 고객 폴더 URL 만 인정).
 *   → 도면을 Claude 가 읽어 방 다각형(0~1000) JSON → Rubric 채점 → 불합격이면 1회 재시도
 *   → { draft, rubric, meta } — 저장하지 않는다. 관리자가 미리보기에서 구역 연결을 확인하고 적용 (Human-in-the-loop)
 */
const MAX_ATTEMPTS = 2
const MAX_PLANS = 6
const MAX_REFS = 3
const HINTS_MAX = 500
const DESC_MIN = 10
const DESC_MAX = 3000
const REQUEST_TIMEOUT_MS = 240_000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const fail = (message: string, status: number) => NextResponse.json({ error: message }, { status })
const ids = (v: unknown, max: number): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : [])

interface Attempt { draft: PlanDraft | null; rubric: PlanRubric | null; usage: { input_tokens: number; output_tokens: number }; stop: string }

/**
 * 생각(thinking) 토큰도 max_tokens 안에서 쓰인다 — 도면 읽기는 생각이 길어 16K 로는 JSON 을 쓰기 전에 끊겼다(2026-11-08 실측).
 * 그래서 64K 로 넉넉히 주고(긴 출력은 스트리밍이 필수), 생각 깊이는 medium 으로 둔다.
 */
const MAX_OUTPUT_TOKENS = 64000

async function runOnce(client: Anthropic, content: Anthropic.ContentBlockParam[]): Promise<Attempt> {
  const stream = client.messages.stream({
    model: FLOOR_PLAN_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [{ type: 'text', text: FLOOR_PLAN_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: FLOOR_PLAN_JSON_SCHEMA } },
    messages: [{ role: 'user', content }],
  }, { timeout: REQUEST_TIMEOUT_MS })
  const res = await stream.finalMessage()
  const usage = { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens }
  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? ''
  if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
    console.warn(`[ai-layout][L4] 중단 stop=${res.stop_reason} output_tokens=${usage.output_tokens} text=${text.slice(0, 200)}`)
    return { draft: null, rubric: null, usage, stop: res.stop_reason }
  }
  let parsed: unknown = null
  try { parsed = JSON.parse(text) } catch { console.warn('[ai-layout][L4] JSON 파싱 실패, 앞부분:', text.slice(0, 200)); parsed = null }
  const draft = parsePlanDraft(parsed)
  return { draft, rubric: draft ? scorePlanDraft(draft) : null, usage, stop: res.stop_reason ?? 'unknown' }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getServerSession()
    if (!session || session.role !== 'admin') return fail('권한 없음', 403)
    if (!process.env.ANTHROPIC_API_KEY) return fail('AI 기능이 설정되지 않았습니다 (API 키 없음)', 500)
    const { id } = await params
    if (!UUID_RE.test(id)) return fail('잘못된 고객 id', 400)

    const body = await req.json().catch(() => ({})) as { plan_asset_ids?: unknown; reference_asset_ids?: unknown; hints?: unknown; description?: unknown; assets?: unknown }
    const planIds = ids(body.plan_asset_ids, MAX_PLANS)
    const refIds = ids(body.reference_asset_ids, MAX_REFS)
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, DESC_MAX) : ''
    if (planIds.length === 0 && description.length < DESC_MIN) return fail('도면을 고르거나 배치 설명을 10자 이상 적어주세요', 400)
    const hints = typeof body.hints === 'string' ? body.hints.slice(0, HINTS_MAX) : ''

    const supabase = createServiceClient()
    const { data: customer, error } = await supabase.from('customers').select('care_manual').eq('id', id).maybeSingle()
    if (error) { console.error('[ai-layout][L4] 고객 조회 실패:', error.message); return fail('고객 정보를 불러오지 못했습니다', 500) }
    if (!customer) return fail('고객을 찾을 수 없습니다', 404)
    const manual = normalizeCareManual(customer.care_manual)
    const assets = mergeAssets(manual.assets ?? [], parseInlineAssets(body.assets, id))
    const plans = splitReadableAssets(assets.filter(a => planIds.includes(a.id)))
    const references = splitReadableAssets(assets.filter(a => refIds.includes(a.id) && !planIds.includes(a.id))).readable
    if (planIds.length > 0 && plans.readable.length === 0) {
      const found = assets.filter(a => planIds.includes(a.id))
      return fail(found.length === 0
        ? '선택한 도면을 찾지 못했습니다. 도면 칩을 다시 선택하거나 [저장] 후 시도해주세요.'
        : `이 형식은 읽을 수 없습니다 (${found.map(a => a.mime).join(', ')}). PDF·JPG·PNG·WEBP 만 가능하며 HEIC 는 JPG 로 바꿔 올려주세요.`, 400)
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const totalUsage = { input_tokens: 0, output_tokens: 0 }
    let last: Attempt | null = null
    let previousIssues: string[] | undefined
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      last = await runOnce(client, buildFloorPlanContent({ plans: plans.readable, references, hints, previousIssues, ...(plans.readable.length === 0 ? { description } : {}) }))
      totalUsage.input_tokens += last.usage.input_tokens
      totalUsage.output_tokens += last.usage.output_tokens
      if (last.draft && last.rubric?.pass) break
      // 거절은 다시 물어도 같으니 바로 끝낸다
      if (last.stop === 'refusal') break
      previousIssues = last.rubric?.issues.length ? last.rubric.issues : [last.draft ? '층·방이 비어 있음' : `출력이 JSON 이 아니거나 중단됨 (${last.stop})`]
      console.warn(`[ai-layout][L1] 시도 ${attempt} 불합격 (${last.rubric?.total ?? 0}점):`, previousIssues.join(' / '))
    }
    if (!last) return fail('분석 결과를 만들지 못했습니다', 500)

    const meta = {
      model: FLOOR_PLAN_MODEL,
      prompt_version: FLOOR_PLAN_PROMPT_VERSION,
      attempts: previousIssues && last.rubric?.pass ? MAX_ATTEMPTS : 1,
      usage: totalUsage,
      cost_krw: estimateCostKrw(totalUsage),
      skipped_assets: plans.skipped.map(a => a.title || a.kind),
      /** 도면 자료 id 순서 (미리보기 배경 매칭용) */
      plan_asset_ids: plans.readable.map(a => a.id),
    }
    if (!last.draft || !last.rubric) {
      console.error('[ai-layout][L4] 출력 파싱 실패:', last.stop)
      return NextResponse.json({ error: last.stop === 'refusal' ? 'AI 가 이 도면의 분석을 거절했습니다' : '분석 결과를 JSON 으로 받지 못했습니다. 다시 시도해주세요.', meta }, { status: 502 })
    }
    return NextResponse.json({ draft: last.draft, rubric: last.rubric, meta })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return fail('AI 호출이 잠시 많습니다. 1분 뒤 다시 시도해주세요.', 429)
    if (e instanceof Anthropic.AuthenticationError) { console.error('[ai-layout][L5] API 키 오류'); return fail('AI 인증에 실패했습니다', 500) }
    if (e instanceof Anthropic.BadRequestError) {
      console.error('[ai-layout][L4] 요청 오류:', e.message)
      // 잔액 부족은 파일 문제가 아니다 — 그대로 알려준다 (2026-11-08 "도면이 깨졌다"로 잘못 안내된 사례)
      if (/credit balance/i.test(e.message)) return fail('AI 사용 잔액이 부족합니다. Anthropic 콘솔(Plans & Billing)에서 크레딧을 충전한 뒤 다시 시도해주세요.', 402)
      return fail('도면을 AI 가 읽지 못했습니다. 파일이 깨졌거나 너무 클 수 있습니다.', 400)
    }
    if (e instanceof Anthropic.APIConnectionError) return fail('AI 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.', 503)
    if (e instanceof Anthropic.APIError) { console.error('[ai-layout][L4] API 오류:', e.status, e.message); return fail('AI 호출 중 오류가 났습니다', 502) }
    console.error('[ai-layout][L4] 알 수 없는 오류:', e instanceof Error ? e.message : e)
    return fail('분석 결과를 만들지 못했습니다', 500)
  }
}
