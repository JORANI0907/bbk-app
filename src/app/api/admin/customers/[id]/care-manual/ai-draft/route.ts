import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { normalizeCareManual } from '@/types/care-manual'
import { MODEL, PROMPT_VERSION, SYSTEM_PROMPT, DRAFT_JSON_SCHEMA, buildUserContent, splitReadableAssets, estimateCostKrw } from '@/lib/ai/care-manual-draft/prompt'
import { parseDraft, scoreDraft, type Draft, type RubricResult } from '@/lib/ai/care-manual-draft/validate'
import { mergeAssets, parseInlineAssets } from '@/lib/ai/inline-assets'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * 케어매뉴얼 초안 자동 추출 (2026-11-08, 하네스 4-Layer)
 *   POST { asset_ids: string[], hints?: string }
 *   → 자료함의 도면·사진을 Claude 에게 보내 구역·품목 초안(JSON) 생성
 *   → Rubric 채점, 불합격이면 문제점을 알려주며 1회 재시도 (MAX_ATTEMPTS)
 *   → { draft, rubric, meta } — 저장하지 않는다. 관리자가 화면에서 고른 구역만 추가 (Human-in-the-loop)
 *
 *   Layer 1 Input     : prompt.ts (ROLE/TASK/FORMAT/CONSTRAINTS, 자료 블록 → 지시문 순)
 *   Layer 2 Execution : claude-opus-5-5, 구조화 출력(JSON 스키마), 시도 최대 2회, 요청 타임아웃 4분
 *   Layer 3 Eval      : validate.ts Rubric 100점 만점 · 합격 70
 *   Layer 4 Feedback  : 실패(불합격·오류)는 서버 로그에 [ai-draft][L1~L4] 로 남긴다. 운영 후 실패 사례 DB 로 승격 예정
 */
const MAX_ATTEMPTS = 2
const MAX_ASSETS = 8
const HINTS_MAX = 500
const REQUEST_TIMEOUT_MS = 240_000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const fail = (message: string, status: number) => NextResponse.json({ error: message }, { status })

interface Attempt { draft: Draft | null; rubric: RubricResult | null; usage: { input_tokens: number; output_tokens: number }; stop: string }

/** 생각(thinking) 토큰도 max_tokens 에 포함되므로 넉넉히(64K) 주고 스트리밍으로 받는다 — 2026-11-08 도면 분석에서 16K 로 끊긴 실측 반영 */
const MAX_OUTPUT_TOKENS = 64000

async function runOnce(client: Anthropic, content: Anthropic.ContentBlockParam[]): Promise<Attempt> {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: DRAFT_JSON_SCHEMA } },
    messages: [{ role: 'user', content }],
  }, { timeout: REQUEST_TIMEOUT_MS })
  const res = await stream.finalMessage()

  const usage = { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens }
  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? ''
  if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
    console.warn(`[ai-draft][L4] 중단 stop=${res.stop_reason} output_tokens=${usage.output_tokens} text=${text.slice(0, 200)}`)
    return { draft: null, rubric: null, usage, stop: res.stop_reason }
  }
  let parsed: unknown = null
  try { parsed = JSON.parse(text) } catch { console.warn('[ai-draft][L4] JSON 파싱 실패, 앞부분:', text.slice(0, 200)); parsed = null }
  const draft = parseDraft(parsed)
  return { draft, rubric: draft ? scoreDraft(draft) : null, usage, stop: res.stop_reason ?? 'unknown' }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getServerSession()
    if (!session || session.role !== 'admin') return fail('권한 없음', 403)
    if (!process.env.ANTHROPIC_API_KEY) return fail('AI 기능이 설정되지 않았습니다 (API 키 없음)', 500)
    const { id } = await params
    if (!UUID_RE.test(id)) return fail('잘못된 고객 id', 400)

    const body = await req.json().catch(() => ({})) as { asset_ids?: unknown; hints?: unknown; assets?: unknown }
    const assetIds = Array.isArray(body.asset_ids) ? body.asset_ids.filter((v): v is string => typeof v === 'string').slice(0, MAX_ASSETS) : []
    if (assetIds.length === 0) return fail('분석할 자료를 하나 이상 골라주세요', 400)
    const hints = typeof body.hints === 'string' ? body.hints.slice(0, HINTS_MAX) : ''

    const supabase = createServiceClient()
    const { data: customer, error } = await supabase.from('customers').select('care_manual').eq('id', id).maybeSingle()
    if (error) { console.error('[ai-draft][L4] 고객 조회 실패:', error.message); return fail('고객 정보를 불러오지 못했습니다', 500) }
    if (!customer) return fail('고객을 찾을 수 없습니다', 404)
    const manual = normalizeCareManual(customer.care_manual)
    const chosen = mergeAssets(manual.assets ?? [], parseInlineAssets(body.assets, id)).filter(a => assetIds.includes(a.id))
    const { readable, skipped } = splitReadableAssets(chosen)
    if (readable.length === 0) return fail(chosen.length === 0 ? '선택한 자료를 찾지 못했습니다. 자료 칩을 다시 선택하거나 [저장] 후 시도해주세요.' : '읽을 수 있는 자료(PDF·JPG·PNG·WEBP)가 없습니다. HEIC 는 JPG 로 바꿔 올려주세요.', 400)

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const existingZoneNames = manual.zones.map(z => z.name).filter(Boolean)

    const totalUsage = { input_tokens: 0, output_tokens: 0 }
    let last: Attempt | null = null
    let previousIssues: string[] | undefined
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const content = buildUserContent({ assets: readable, hints, existingZoneNames, previousIssues, today })
      last = await runOnce(client, content)
      totalUsage.input_tokens += last.usage.input_tokens
      totalUsage.output_tokens += last.usage.output_tokens
      if (last.draft && last.rubric?.pass) break
      if (last.stop === 'refusal') break
      previousIssues = last.rubric?.issues.length ? last.rubric.issues : [last.draft ? '형식은 맞지만 내용이 비어 있음' : `출력이 JSON 이 아니거나 중단됨 (${last.stop})`]
      console.warn(`[ai-draft][L1] 시도 ${attempt} 불합격 (${last.rubric?.total ?? 0}점):`, previousIssues.join(' / '))
    }
    if (!last) return fail('초안을 만들지 못했습니다', 500)

    const meta = {
      model: MODEL,
      prompt_version: PROMPT_VERSION,
      attempts: previousIssues && last.rubric?.pass ? MAX_ATTEMPTS : 1,
      usage: totalUsage,
      cost_krw: estimateCostKrw(totalUsage),
      skipped_assets: skipped.map(a => a.title || a.kind),
    }
    if (!last.draft || !last.rubric) {
      console.error('[ai-draft][L4] 출력 파싱 실패:', last.stop)
      return NextResponse.json({ error: last.stop === 'refusal' ? 'AI 가 이 자료의 분석을 거절했습니다' : '초안을 JSON 으로 받지 못했습니다. 다시 시도해주세요.', meta }, { status: 502 })
    }
    return NextResponse.json({ draft: last.draft, rubric: last.rubric, meta })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return fail('AI 호출이 잠시 많습니다. 1분 뒤 다시 시도해주세요.', 429)
    if (e instanceof Anthropic.AuthenticationError) { console.error('[ai-draft][L5] API 키 오류'); return fail('AI 인증에 실패했습니다', 500) }
    if (e instanceof Anthropic.BadRequestError) {
      console.error('[ai-draft][L4] 요청 오류:', e.message)
      // 잔액 부족은 파일 문제가 아니다 — 그대로 알려준다 (2026-11-08 "도면이 깨졌다"로 잘못 안내된 사례)
      if (/credit balance/i.test(e.message)) return fail('AI 사용 잔액이 부족합니다. Anthropic 콘솔(Plans & Billing)에서 크레딧을 충전한 뒤 다시 시도해주세요.', 402)
      return fail('자료를 AI 가 읽지 못했습니다. 파일이 깨졌거나 너무 클 수 있습니다.', 400)
    }
    if (e instanceof Anthropic.APIConnectionError) return fail('AI 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.', 503)
    if (e instanceof Anthropic.APIError) { console.error('[ai-draft][L4] API 오류:', e.status, e.message); return fail('AI 호출 중 오류가 났습니다', 502) }
    console.error('[ai-draft][L4] 알 수 없는 오류:', e instanceof Error ? e.message : e)
    return fail('초안을 만들지 못했습니다', 500)
  }
}
