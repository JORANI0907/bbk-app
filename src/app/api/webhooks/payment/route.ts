import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'

// ─── 매칭 설정 ────────────────────────────────────────────────────
// 아래 상수를 수정해 매칭 민감도를 조정합니다.

/** 예약금 자동 매칭 기준 */
const DEPOSIT_MATCH = {
  /** 매칭 대상 상태 (이 상태 + 예약금 0/null인 건만) */
  STATUSES:           ['신규', '견적발송', '예약확정'] as const,
  /** 자동 매칭 최소 이름 점수 (0~100) */
  MIN_SCORE:          70,
  /** 1위–2위 최소 점수 차이 (이 이상이어야 단독 자동 선택) */
  MIN_GAP:            20,
  /** 이 점수 미만이면 이름 불일치로 보고 수동 처리 요청 */
  MISMATCH_THRESHOLD: 30,
} as const

/** 잔금 자동 매칭 기준 */
const BALANCE_MATCH = {
  /** 매칭 대상 상태 (금액 정확 일치 필수) */
  STATUSES:  ['작업완료', '결제'] as const,
  /** 복수 금액 일치 시 이름 자동 선택 최소 점수 */
  MIN_SCORE: 50,
  /** 이름 자동 선택 최소 점수 차이 */
  MIN_GAP:   20,
} as const

/** 이름 유사도 점수 매트릭스 */
const NAME_SCORE = {
  EXACT:          100,  // 정확 일치
  CONTAINS:        80,  // 한쪽이 다른쪽에 포함
  STARTS:          70,  // 앞부분으로 시작
  CHAR_MIN_RATIO:  0.5, // 글자 교집합/합집합 비율 최솟값
  CHAR_MULTIPLIER: 60,  // 부분 점수 = ratio × CHAR_MULTIPLIER
} as const

/** 이름 매칭 대상 DB 필드 */
const MATCH_FIELDS: ('owner_name' | 'business_name')[] = ['owner_name', 'business_name']

/** 입금 금액 허용 범위 (원) */
const AMOUNT_RANGE = { MIN: 1_000, MAX: 30_000_000 } as const

// ─── 타입 ─────────────────────────────────────────────────────────

interface PaymentPayload {
  message?: string       // 은행 SMS 원문
  '메시지 내용'?: string  // SMS 자동전달 앱 기본 필드명
  bank?: string          // 로깅용
  sender?: string        // 로깅용
}

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

// ─── SMS 파싱 유틸 ─────────────────────────────────────────────────

/** 은행 SMS 원문에서 금액(원) 추출 */
function extractAmount(text: string): number | null {
  // 1차: '원' 포함 금액 (예: 613,536원 / 50000원)
  for (const m of text.matchAll(/(\d{1,3}(?:,\d{3})*|\d+)\s*원/g)) {
    const n = parseInt(m[1].replace(/,/g, ''), 10)
    if (n >= AMOUNT_RANGE.MIN && n <= AMOUNT_RANGE.MAX) return n
  }
  // 2차: 쉼표 포함 숫자 (KB 등 '원' 없이 마지막 줄에 금액만 오는 형식)
  for (const m of text.matchAll(/(?<![0-9*])(\d{1,3}(?:,\d{3})+)(?![0-9원,])/g)) {
    const n = parseInt(m[1].replace(/,/g, ''), 10)
    if (n >= AMOUNT_RANGE.MIN && n <= AMOUNT_RANGE.MAX) return n
  }
  return null
}

/**
 * 은행 SMS 원문에서 입금자명 추출
 * 지원 포맷: [은행] 이름 금액원 / 이름 입금 금액원 / 이름에서 금액원 / 보낸사람: 이름(업체) 등
 */
function extractDepositor(text: string): string | null {
  if (!text) return null
  const msg = text.replace(/[\r\n]+/g, ' ').trim()
  const nm  = '[가-힣A-Za-z][가-힣A-Za-z0-9()（）]{1,18}'
  const amt = '\\d{1,3}(?:,\\d{3})*원'

  const patterns = [
    // 보낸사람 : 이름(업체명) — SMS 자동전달 앱 형식
    new RegExp(`보낸사람\\s*:\\s*[^(（]*[（(](${nm})[）)]`),
    // [은행명] 이름님? 금액원
    new RegExp(`\\[[^\\]]+\\]\\s*(?:\\d+[/.]\\d+[\\s\\d:]*)?\\s*(${nm})님?\\s+${amt}`),
    // 이름 입금 금액원
    new RegExp(`(${nm})\\s+입금\\s+${amt}`),
    // 이름 금액원 입금
    new RegExp(`(${nm})\\s+${amt}\\s*입금`),
    // 이름에서 금액원
    new RegExp(`(${nm})에서\\s+${amt}`),
    // 이름님 이체 금액원
    new RegExp(`(${nm})님\\s+이체\\s+${amt}`),
    // 이름(업체명) 형식에서 이름 부분
    new RegExp(`(${nm})[（(][^)）]+[）)]`),
    // 이름 입금 (원 없는 형식 — KB 등 별도 줄 금액)
    new RegExp(`(${nm})\\s+입금(?:\\s|$)`),
  ]

  for (const p of patterns) {
    const m = msg.match(p)
    if (m?.[1]) {
      const name = m[1].replace(/님$/, '').trim()
      if (name.length >= 2) return name
    }
  }
  return null
}

/**
 * 입금자명(contact)에서 이름 후보 전체 추출
 * 예) "홍길동(가게명)" → ["홍길동", "가게명"]
 *     "가게명(홍길동)" → ["가게명", "홍길동"]
 *     "홍길동"         → ["홍길동"]
 */
function nameCandidates(contact: string): string[] {
  const t = contact.trim()
  const m = t.match(/^([^(（]+)[（(]([^)）]+)[）)]?$/)
  return m ? [m[1].trim(), m[2].trim()].filter(Boolean) : [t]
}

/** 두 문자열의 유사도를 0~100 점수로 반환 */
function scoreNames(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b)                          return NAME_SCORE.EXACT
  if (b.includes(a) || a.includes(b))  return NAME_SCORE.CONTAINS
  if (b.startsWith(a) || a.startsWith(b)) return NAME_SCORE.STARTS
  const setA = new Set(Array.from(a))
  const setB = new Set(Array.from(b))
  const inter = Array.from(setA).filter(c => setB.has(c)).length
  const union  = new Set([...Array.from(setA), ...Array.from(setB)]).size
  const ratio  = inter / union
  return ratio >= NAME_SCORE.CHAR_MIN_RATIO ? Math.round(ratio * NAME_SCORE.CHAR_MULTIPLIER) : 0
}

/** 입금자명 vs DB 필드(MATCH_FIELDS) 최대 유사도 */
function calcScore(contact: string, app: Pick<AppRow, 'owner_name' | 'business_name'>): number {
  return Math.max(0, ...nameCandidates(contact).flatMap(c =>
    MATCH_FIELDS.map(f => scoreNames(c, (app[f] as string) ?? ''))
  ))
}

/** 여러 신청서 중 이름 점수 최고 항목 선택 */
function pickBest<T extends Pick<AppRow, 'owner_name' | 'business_name'>>(
  list: T[], contact: string,
): { best: T; score: number; secondScore: number; ranked: Array<{ app: T; score: number }> } {
  const ranked = list
    .map(app => ({ app, score: calcScore(contact, app) }))
    .sort((a, b) => b.score - a.score)
  return {
    best:        ranked[0].app,
    score:       ranked[0].score,
    secondScore: ranked[1]?.score ?? 0,
    ranked,
  }
}

// ─── 내부 알림 발송 ───────────────────────────────────────────────

async function fireNotify(
  origin: string, appId: string, type: string,
): Promise<{ ok: boolean; newStatus?: string }> {
  try {
    const res = await fetch(`${origin}/api/admin/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_id: appId, type, method: 'auto' }),
    })
    const data = await res.json()
    return { ok: res.ok, newStatus: data.new_status }
  } catch {
    return { ok: false }
  }
}

// ─── 메인 핸들러 ─────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') ?? ''
    let message = '', bank = '', sender = ''

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text   = await request.text()
      const params = new URLSearchParams(text)
      message = params.get('message') ?? params.get('mb') ?? ''
      bank    = params.get('bank') ?? ''
      sender  = params.get('sender') ?? params.get('pni') ?? ''
    } else {
      const body = await request.json() as PaymentPayload
      message = body.message ?? body['메시지 내용'] ?? ''
      bank    = body.bank ?? ''
      sender  = body.sender ?? ''
    }

    if (!message) {
      return NextResponse.json({ error: 'message 필드 필수' }, { status: 400 })
    }

    const amount    = extractAmount(message)
    const depositor = extractDepositor(message)
    const origin    = new URL(request.url).origin
    const supabase  = createServiceClient()

    if (!amount) {
      await sendSlack(
        `⚠️ *입금 웹훅 — 금액 파싱 실패*\n• 은행: ${bank ?? sender ?? '-'}\n• 입금자: ${depositor ?? '-'}\n• SMS: ${message.slice(0, 100)}`
      ).catch(() => {})
      return NextResponse.json({ error: '금액 파싱 실패', message }, { status: 422 })
    }

    // ── 예약금 매칭 ───────────────────────────────────────────────
    // 대상: DEPOSIT_MATCH.STATUSES 상태 + 예약금 0/null 신청서
    const { data: depositApps } = await supabase
      .from('service_applications')
      .select('id, business_name, owner_name, phone, deposit, balance, status')
      .in('status', [...DEPOSIT_MATCH.STATUSES])
      .or('deposit.is.null,deposit.eq.0')
      .is('deleted_at', null)

    if (depositApps && depositApps.length > 0) {
      if (!depositor) {
        await sendSlack(
          `⚠️ *예약금 입금 — 수동 처리 필요 (입금자명 파싱 실패)*\n• 금액: ${amount.toLocaleString('ko-KR')}원\n• 은행: ${bank ?? '-'}\n• SMS: ${message.slice(0, 80)}`
        ).catch(() => {})
        return NextResponse.json({ matched: 'deposit', action: 'manual', reason: 'no_depositor' })
      }

      const { best, score, secondScore, ranked } = pickBest(depositApps as AppRow[], depositor)

      if (score >= DEPOSIT_MATCH.MIN_SCORE && score - secondScore >= DEPOSIT_MATCH.MIN_GAP) {
        // 금액 불일치 최소 검증 (이름 우연 일치 방지)
        if (score < DEPOSIT_MATCH.MISMATCH_THRESHOLD) {
          const detail = ranked.filter(r => r.score > 0)
            .map(r => `• ${r.app.business_name} (${r.app.owner_name}) — ${r.score}점`).join('\n')
          await sendSlack(
            `⚠️ *예약금 입금 — 수동 처리 필요 (이름 불일치)*\n• 금액: ${amount.toLocaleString('ko-KR')}원\n• 입금자: ${depositor}\n• 유사도: ${score}점\n${detail}`
          ).catch(() => {})
          return NextResponse.json({ matched: 'deposit', action: 'manual', reason: 'name_mismatch' })
        }

        // 자동 매칭: 예약금 업데이트 + 알림 발송
        await supabase
          .from('service_applications')
          .update({ deposit: amount })
          .eq('id', best.id)

        const { ok, newStatus } = await fireNotify(origin, best.id, '예약금 입금완료 알림')

        await sendSlack(
          `💰 *예약금 입금 확인*\n• 업체: ${best.business_name} / ${best.owner_name}\n• 입금자: ${depositor}\n• 금액: ${amount.toLocaleString('ko-KR')}원 (이름유사도 ${score}점)\n• 알림: ${ok ? '✅' : '❌'} | 상태: ${newStatus ?? '예약금 입금'}`
        ).catch(() => {})

        return NextResponse.json({ matched: 'deposit', application_id: best.id, amount, notify_ok: ok })
      }

      // 이름 불명확 → 수동 처리
      const detail = ranked.filter(r => r.score > 0)
        .map(r => `• ${r.app.business_name} (${r.app.owner_name}) — ${r.score}점`).join('\n') || '• 유사한 이름 없음'

      await sendSlack(
        `⚠️ *예약금 입금 — 수동 처리 필요*\n• 금액: ${amount.toLocaleString('ko-KR')}원\n• 입금자: ${depositor}\n• 1위 ${score}점 / 2위 ${secondScore}점 (기준: ${DEPOSIT_MATCH.MIN_SCORE}점+${DEPOSIT_MATCH.MIN_GAP}점차)\n${detail}`
      ).catch(() => {})

      return NextResponse.json({ matched: 'deposit', action: 'manual', score })
    }

    // ── 잔금 매칭 ─────────────────────────────────────────────────
    // 대상: BALANCE_MATCH.STATUSES 상태, 금액 정확 일치 필수
    const { data: balanceApps } = await supabase
      .from('service_applications')
      .select('id, business_name, owner_name, phone, deposit, supply_amount, vat, balance, status')
      .in('status', [...BALANCE_MATCH.STATUSES])
      .is('deleted_at', null)

    if (balanceApps && balanceApps.length > 0) {
      const exactMatches = (balanceApps as AppRow[]).filter(a => {
        const stored = a.balance ?? 0
        const calc   = (a.supply_amount ?? 0) + (a.vat ?? 0) - (a.deposit ?? 0)
        return stored === amount || calc === amount
      })

      if (exactMatches.length === 0) {
        const nearest = (balanceApps as AppRow[]).reduce((p, c) =>
          Math.abs((c.balance ?? 0) - amount) < Math.abs((p.balance ?? 0) - amount) ? c : p
        )
        await sendSlack(
          `⚠️ *잔금 금액 불일치 — 수동 확인*\n• 입금액: ${amount.toLocaleString('ko-KR')}원\n• 입금자: ${depositor ?? '-'}\n• 가장 유사: ${nearest.business_name} (${nearest.owner_name}) — 잔금 ${(nearest.balance ?? 0).toLocaleString('ko-KR')}원`
        ).catch(() => {})
        return NextResponse.json({ matched: 'none', amount, action: 'manual' })
      }

      // 단일 금액 일치
      if (exactMatches.length === 1) {
        const only = exactMatches[0]
        const nameOk = !depositor || calcScore(depositor, only) >= DEPOSIT_MATCH.MISMATCH_THRESHOLD
        if (!nameOk) {
          await sendSlack(
            `⚠️ *잔금 입금 — 수동 처리 필요 (이름 불일치)*\n• 금액: ${amount.toLocaleString('ko-KR')}원\n• 입금자: ${depositor}\n• 후보: ${only.business_name} (${only.owner_name})`
          ).catch(() => {})
          return NextResponse.json({ matched: 'balance', action: 'manual', reason: 'name_mismatch' })
        }

        const { ok, newStatus } = await fireNotify(origin, only.id, '결제완료알림(잔금)')
        await sendSlack(
          `💰 *잔금 입금 확인*\n• 업체: ${only.business_name} / ${only.owner_name}\n• 입금자: ${depositor ?? '-'}\n• 금액: ${amount.toLocaleString('ko-KR')}원\n• 알림: ${ok ? '✅' : '❌'} | 상태: ${newStatus ?? '결제완료(잔금)'}`
        ).catch(() => {})
        return NextResponse.json({ matched: 'balance', application_id: only.id, amount, notify_ok: ok })
      }

      // 복수 금액 일치 → 이름으로 선택
      if (!depositor) {
        const list = exactMatches.map(a => `• ${a.business_name} (${a.owner_name})`).join('\n')
        await sendSlack(
          `⚠️ *잔금 입금 — 수동 처리 필요 (복수 일치 + 입금자명 없음)*\n• 금액: ${amount.toLocaleString('ko-KR')}원\n${list}`
        ).catch(() => {})
        return NextResponse.json({ matched: 'balance', action: 'manual', reason: 'multi_match' })
      }

      const { best, score, secondScore, ranked } = pickBest(exactMatches, depositor)
      if (score >= BALANCE_MATCH.MIN_SCORE && score - secondScore >= BALANCE_MATCH.MIN_GAP) {
        const { ok, newStatus } = await fireNotify(origin, best.id, '결제완료알림(잔금)')
        await sendSlack(
          `💰 *잔금 입금 확인*\n• 업체: ${best.business_name} / ${best.owner_name}\n• 입금자: ${depositor} (이름유사도 ${score}점)\n• 금액: ${amount.toLocaleString('ko-KR')}원\n• 알림: ${ok ? '✅' : '❌'} | 상태: ${newStatus ?? '결제완료(잔금)'}`
        ).catch(() => {})
        return NextResponse.json({ matched: 'balance', application_id: best.id, amount, notify_ok: ok })
      }

      const detail = ranked.map(r => `• ${r.app.business_name} (${r.app.owner_name}) — ${r.score}점`).join('\n')
      await sendSlack(
        `⚠️ *잔금 입금 — 수동 처리 필요 (이름 불명확)*\n• 금액: ${amount.toLocaleString('ko-KR')}원\n• 입금자: ${depositor}\n• 1위 ${score}점 / 2위 ${secondScore}점\n${detail}`
      ).catch(() => {})
      return NextResponse.json({ matched: 'balance', action: 'manual', score })
    }

    // ── 매칭 없음 ─────────────────────────────────────────────────
    await sendSlack(
      `⚠️ *입금 매칭 실패 — 수동 확인*\n• 금액: ${amount.toLocaleString('ko-KR')}원\n• 입금자: ${depositor ?? '-'}\n• 은행: ${bank ?? sender ?? '-'}`
    ).catch(() => {})

    return NextResponse.json({ matched: 'none', amount })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
