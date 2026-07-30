/**
 * Phase 1 v2 S2: 주간 공지 AI 초안 생성 (하네스 4-Layer)
 * PLAN v2 §6
 *
 * POST /api/admin/weekly-notices/ai-draft
 *   body: { week_start }
 *   → 이번 주 (week_start ~ +6일) 완료/클레임/재작업 데이터 요약을 프롬프트로 전달
 *   → Anthropic haiku 4.5로 3줄 초안 생성
 *   → { ok, draft: { line1, line2, line3 }, meta: { model, jobs, claims, rework, prompt_tokens?, output_tokens? } }
 *
 * Layer 1 (Input): 사내 기록 요약 프롬프트 조립
 * Layer 2 (Execution): haiku 4.5 messages.create
 * Layer 3 (Eval): 응답 파싱 검증 (각 라인 100자 이하)
 * Layer 4 (Feedback): 저장 시 original_draft 필드에 이 응답 원본을 함께 저장 (UI 측 책임)
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_LEN = 100

interface AiDraft { line1: string; line2: string; line3: string }

function parseDraftFromText(text: string): AiDraft | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    const obj = JSON.parse(jsonMatch[0]) as Partial<AiDraft>
    if (typeof obj.line1 !== 'string' || typeof obj.line2 !== 'string' || typeof obj.line3 !== 'string') return null
    return {
      line1: obj.line1.trim().slice(0, MAX_LEN),
      line2: obj.line2.trim().slice(0, MAX_LEN),
      line3: obj.line3.trim().slice(0, MAX_LEN),
    }
  } catch { return null }
}

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ ok: false, error: '인증 필요' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ ok: false, error: '관리자만' }, { status: 403 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY 미설정' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const weekStart = String(body.week_start ?? '')
  if (!WEEK_RE.test(weekStart)) {
    return NextResponse.json({ ok: false, error: 'week_start 형식 오류' }, { status: 400 })
  }

  // 주 종료일 = week_start + 6
  const start = new Date(`${weekStart}T00:00:00Z`)
  const end = new Date(start.getTime() + 6 * 24 * 3600 * 1000)
  const endIso = end.toISOString().slice(0, 10)

  const supabase = createServiceClient()

  // ─── Layer 1: 사내 기록 수집 ─────────────────────
  const [{ count: jobsCount }, { data: claims }, { data: intent }] = await Promise.all([
    supabase.from('service_applications')
      .select('id', { count: 'exact', head: true })
      .gte('construction_date', weekStart)
      .lte('construction_date', endIso)
      .not('work_completed_at', 'is', null),
    supabase.from('claims')
      .select('id, content, is_rework, occurred_at')
      .gte('occurred_at', `${weekStart}T00:00:00Z`)
      .lte('occurred_at', `${endIso}T23:59:59Z`),
    supabase.from('company_intent').select('purpose, intent_1, intent_2, intent_3').eq('id', 1).maybeSingle(),
  ])

  const claimsCount = claims?.length ?? 0
  const reworkCount = (claims ?? []).filter(c => c.is_rework).length

  const summary = [
    `주 시작: ${weekStart}, 종료: ${endIso}`,
    `이번 주 완료 건수: ${jobsCount ?? 0}건`,
    `클레임: ${claimsCount}건 (재작업 ${reworkCount}건)`,
    intent?.purpose ? `회사 목적: ${intent.purpose}` : '',
    intent?.intent_1 ? `의도 1: ${intent.intent_1}` : '',
    intent?.intent_2 ? `의도 2: ${intent.intent_2}` : '',
    intent?.intent_3 ? `의도 3: ${intent.intent_3}` : '',
  ].filter(Boolean).join('\n')

  // ─── Layer 2: Anthropic 호출 ─────────────────────
  const client = new Anthropic({ apiKey })

  const systemPrompt = `당신은 BBK 청소 서비스 회사의 대표를 돕는 사내 공지 초안 작성자입니다.
매주 대표가 직원에게 보내는 3줄 공지를 작성합니다.

작성 원칙:
- 각 줄 100자 이내 (한국어 기준)
- 1줄: 이번 주 성과·감사 인사 (숫자 근거 포함)
- 2줄: 이번 주 학습·개선점 (클레임/재작업이 있으면 담담하게 언급)
- 3줄: 다음 주 방향·격려 (회사 의도와 연결)
- 존댓말, 담백한 톤. 이모지·과장 표현 금지.

출력은 반드시 아래 JSON 형식만 (설명·주석 금지):
{"line1":"...","line2":"...","line3":"..."}`

  let draft: AiDraft | null = null
  let inputTokens = 0
  let outputTokens = 0
  const model = 'claude-haiku-4-5-20251001'

  try {
    const resp = await client.messages.create({
      model,
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `아래 데이터로 사내 주간 공지 3줄을 작성해주세요.\n\n${summary}` },
      ],
    })
    const first = resp.content[0]
    if (first?.type === 'text') draft = parseDraftFromText(first.text)
    inputTokens = resp.usage?.input_tokens ?? 0
    outputTokens = resp.usage?.output_tokens ?? 0
  } catch (e) {
    return NextResponse.json({ ok: false, error: `AI 호출 실패: ${(e as Error).message}` }, { status: 502 })
  }

  // ─── Layer 3: Eval (파싱 실패 시 거부) ────────────
  if (!draft) {
    return NextResponse.json({ ok: false, error: 'AI 응답 파싱 실패. 다시 시도해주세요.', code: 'PARSE_FAIL' }, { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    draft,
    meta: {
      model,
      week_start: weekStart,
      week_end: endIso,
      jobs_count: jobsCount ?? 0,
      claims_count: claimsCount,
      rework_count: reworkCount,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  })
}
