import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'

// Make.com에서 파싱한 SMS 데이터를 수신
interface PaymentPayload {
  message: string    // %mb% — 은행 SMS 원문
  sender?: string    // %pni% — 발신번호/은행명
  contact?: string   // %ct% — 입금자명 (이름, 이름(업체명), 업체명(이름) 등 다양)
  amount?: number    // Make.com이 직접 파싱한 금액 (있으면 우선 사용)
}

// 한국 은행 SMS에서 금액 추출
function extractAmount(text: string): number | null {
  const matches = Array.from(text.matchAll(/(\d{1,3}(?:,\d{3})*|\d+)\s*원/g))
  for (const match of matches) {
    const n = parseInt(match[1].replace(/,/g, ''), 10)
    if (n >= 1_000 && n <= 30_000_000) return n
  }
  return null
}

// ─── 이름 매칭 유틸 ──────────────────────────────────────────────

/**
 * 입금자명에서 이름 후보를 모두 추출
 * 예) "홍길동(BBK공간케어)" → ["홍길동", "BBK공간케어"]
 *     "BBK공간케어(홍길동)" → ["BBK공간케어", "홍길동"]
 *     "홍길동"              → ["홍길동"]
 */
function extractNameCandidates(contact: string): string[] {
  if (!contact) return []
  const trimmed = contact.trim()
  // 괄호 안팎 분리 (전각·반각 모두 처리)
  const m = trimmed.match(/^([^(（]+)[（(]([^)）]+)[）)]?$/)
  if (m) {
    return [m[1].trim(), m[2].trim()].filter(Boolean)
  }
  return [trimmed]
}

/**
 * 두 문자열의 유사도를 0~100 점수로 반환
 * - 정확히 일치        → 100
 * - 한쪽이 다른쪽 포함  → 80  (예: 잘린 업체명이 실제 업체명에 포함)
 * - 앞부분으로 시작    → 70  (글자수 제한으로 뒤가 잘린 경우)
 * - 글자 교집합 비율   → 비례 (그 외 유사도)
 */
function nameScore(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 100
  if (b.includes(a) || a.includes(b)) return 80
  if (b.startsWith(a) || a.startsWith(b)) return 70
  const charsA = Array.from(new Set(Array.from(a)))
  const charsB = new Set(Array.from(b))
  const intersection = charsA.filter(c => charsB.has(c)).length
  const allChars = new Set(Array.from(a).concat(Array.from(b)))
  const union = allChars.size
  const ratio = intersection / union
  return ratio > 0.5 ? Math.round(ratio * 60) : 0
}

/**
 * 입금자명 vs (owner_name, business_name) 최대 유사도 점수
 * 후보명 × DB 필드 2개 조합 중 최고값 반환
 */
function calcMatchScore(contact: string, ownerName: string, businessName: string): number {
  const candidates = extractNameCandidates(contact)
  return Math.max(
    0,
    ...candidates.flatMap(c => [
      nameScore(c, ownerName ?? ''),
      nameScore(c, businessName ?? ''),
    ])
  )
}

/**
 * 여러 신청서 중 입금자명과 가장 유사한 항목을 선택
 * 반환: best(최고 후보), score(1위 점수), secondScore(2위 점수)
 */
function pickBestByName<T extends { owner_name: string; business_name: string }>(
  apps: T[],
  contact: string,
): { best: T; score: number; secondScore: number } {
  const scored = apps
    .map(a => ({
      app: a,
      score: calcMatchScore(contact, a.owner_name ?? '', a.business_name ?? ''),
    }))
    .sort((a, b) => b.score - a.score)

  return {
    best: scored[0].app,
    score: scored[0].score,
    secondScore: scored[1]?.score ?? 0,
  }
}

// ─── 내부 알림 발송 ───────────────────────────────────────────────

async function fireNotify(
  origin: string,
  applicationId: string,
  type: string,
): Promise<{ ok: boolean; newStatus?: string }> {
  try {
    const res = await fetch(`${origin}/api/admin/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_id: applicationId, type, method: 'auto' }),
    })
    const data = await res.json()
    return { ok: res.ok, newStatus: data.new_status }
  } catch {
    return { ok: false }
  }
}

// ─── 매칭 결과 처리 (예약금 / 잔금 공통) ─────────────────────────

type AppRow = {
  id: string
  business_name: string
  owner_name: string
  phone: string
  deposit: number | null
  balance: number | null
  supply_amount?: number | null
  vat?: number | null
  status: string
}

/**
 * exactMatches에서 단일 후보를 결정
 * - 1건이면 그대로 반환
 * - 여러 건 + contact 있으면 이름 점수로 자동 선택 시도
 * - 자동 선택 불가면 null 반환 (Slack 수동처리 알림은 호출자가 담당)
 */
function resolveCandidate(
  exactMatches: AppRow[],
  contact: string | undefined,
): { app: AppRow; nameInfo: string } | { app: null; reason: string; detail: string } {
  if (exactMatches.length === 1) {
    return { app: exactMatches[0], nameInfo: '' }
  }

  if (!contact) {
    const list = exactMatches.map(a => `• ${a.business_name} (${a.owner_name})`).join('\n')
    return { app: null, reason: '복수 매칭 / 입금자명 없음', detail: list }
  }

  const { best, score, secondScore } = pickBestByName(exactMatches, contact)

  // 1위 점수 ≥ 50점 AND 2위와 차이 ≥ 20점이면 자동 선택
  if (score >= 50 && score - secondScore >= 20) {
    return { app: best, nameInfo: ` (이름매칭 ${score}점)` }
  }

  // 점수 기반 후보 목록
  const scored = exactMatches
    .map(a => ({
      app: a,
      score: calcMatchScore(contact, a.owner_name ?? '', a.business_name ?? ''),
    }))
    .sort((a, b) => b.score - a.score)
  const detail = scored
    .map(s => `• ${s.app.business_name} (${s.app.owner_name}) — 유사도 ${s.score}점`)
    .join('\n')

  return { app: null, reason: `복수 매칭 / 이름 불명확 (1위 ${score}점, 2위 ${secondScore}점)`, detail }
}

// ─── 메인 핸들러 ─────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as PaymentPayload
    const { message, sender, contact, amount: rawAmount } = body

    if (!message && rawAmount == null) {
      return NextResponse.json({ error: 'message 또는 amount 필요' }, { status: 400 })
    }

    const amount = rawAmount ?? extractAmount(message ?? '')
    if (!amount) {
      await sendSlack(
        `⚠️ *입금 웹훅 수신 — 금액 파싱 실패*\n• 발신: ${sender ?? '-'}\n• 입금자명: ${contact ?? '-'}\n• 메시지: ${(message ?? '').slice(0, 100)}`
      ).catch(() => {})
      return NextResponse.json({ error: '금액을 파싱할 수 없습니다.', message }, { status: 422 })
    }

    const supabase = createServiceClient()
    const origin = new URL(request.url).origin

    // ─── 예약금 매칭: status='신규', deposit=amount ──────────────
    const { data: depositApps } = await supabase
      .from('service_applications')
      .select('id, business_name, owner_name, phone, deposit, balance, status')
      .eq('status', '신규')
      .eq('deposit', amount)

    if (depositApps && depositApps.length > 0) {
      const result = resolveCandidate(depositApps as AppRow[], contact)

      if (!result.app) {
        await sendSlack(
          `⚠️ *예약금 입금 — 수동 처리 필요*\n• 금액: ${amount.toLocaleString('ko-KR')}원\n• 입금자명: ${contact ?? '없음'}\n• 사유: ${result.reason}\n${result.detail}`
        ).catch(() => {})
        return NextResponse.json({ matched: 'deposit', count: depositApps.length, action: 'manual_required' })
      }

      const { ok, newStatus } = await fireNotify(origin, result.app.id, '예약금 입금완료 알림')

      await sendSlack(
        `💰 *예약금 입금 확인*\n• 업체명: ${result.app.business_name}\n• 고객명: ${result.app.owner_name}\n• 입금자명: ${contact ?? '-'}\n• 금액: ${amount.toLocaleString('ko-KR')}원\n• 알림발송: ${ok ? '✅' : '❌'}${result.nameInfo}\n• 상태변경: ${newStatus ?? '예약금 입금'}`
      ).catch(() => {})

      return NextResponse.json({ matched: 'deposit', application_id: result.app.id, amount, notify_ok: ok })
    }

    // ─── 잔금 매칭: status='작업완료' or '결제', balance=amount ──
    const { data: balanceApps } = await supabase
      .from('service_applications')
      .select('id, business_name, owner_name, phone, deposit, supply_amount, vat, balance, status')
      .in('status', ['작업완료', '결제'])

    if (balanceApps && balanceApps.length > 0) {
      const exactMatches = (balanceApps as AppRow[]).filter(a => {
        const storedBalance = a.balance
        const calcBalance = (a.supply_amount ?? 0) + (a.vat ?? 0) - (a.deposit ?? 0)
        return storedBalance === amount || calcBalance === amount
      })

      if (exactMatches.length >= 1) {
        const result = resolveCandidate(exactMatches, contact)

        if (!result.app) {
          await sendSlack(
            `⚠️ *잔금 입금 — 수동 처리 필요*\n• 금액: ${amount.toLocaleString('ko-KR')}원\n• 입금자명: ${contact ?? '없음'}\n• 사유: ${result.reason}\n${result.detail}`
          ).catch(() => {})
          return NextResponse.json({ matched: 'balance', count: exactMatches.length, action: 'manual_required' })
        }

        const { ok, newStatus } = await fireNotify(origin, result.app.id, '결제완료알림(잔금)')

        await sendSlack(
          `💰 *잔금 입금 확인*\n• 업체명: ${result.app.business_name}\n• 고객명: ${result.app.owner_name}\n• 입금자명: ${contact ?? '-'}\n• 금액: ${amount.toLocaleString('ko-KR')}원\n• 알림발송: ${ok ? '✅' : '❌'}${result.nameInfo}\n• 상태변경: ${newStatus ?? '결제완료(잔금)'}`
        ).catch(() => {})

        return NextResponse.json({ matched: 'balance', application_id: result.app.id, amount, notify_ok: ok })
      }

      // 금액 불일치 — 가장 가까운 잔금 찾아 알림
      const nearest = (balanceApps as AppRow[]).reduce((prev, cur) => {
        const prevDiff = Math.abs((prev.balance ?? 0) - amount)
        const curDiff = Math.abs((cur.balance ?? 0) - amount)
        return curDiff < prevDiff ? cur : prev
      })

      await sendSlack(
        `⚠️ *잔금 금액 불일치 — 수동 확인 필요*\n• 입금액: ${amount.toLocaleString('ko-KR')}원\n• 입금자명: ${contact ?? '-'}\n• 가장 유사한 건: ${nearest.business_name} (${nearest.owner_name}) — 잔금 ${(nearest.balance ?? 0).toLocaleString('ko-KR')}원\n• 발신: ${sender ?? '-'}`
      ).catch(() => {})

      return NextResponse.json({ matched: 'none', amount, nearest: nearest.business_name, action: 'manual_required' })
    }

    // ─── 매칭 없음 ──────────────────────────────────────────────
    await sendSlack(
      `⚠️ *입금 매칭 실패 — 수동 확인 필요*\n• 금액: ${amount.toLocaleString('ko-KR')}원\n• 입금자명: ${contact ?? '-'}\n• 발신: ${sender ?? '-'}\n• 메시지: ${(message ?? '').slice(0, 80)}`
    ).catch(() => {})

    return NextResponse.json({ matched: 'none', amount })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
