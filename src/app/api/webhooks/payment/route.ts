import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'
import { sendPushToUsers } from '@/lib/push'

// ─── 상태 설정 ────────────────────────────────────────────────────

const DEPOSIT_STATUSES = ['신규', '예약확정'] as const
const BALANCE_STATUSES = ['작업완료', '결제'] as const
const ALL_STATUSES     = [...DEPOSIT_STATUSES, ...BALANCE_STATUSES]

const AMOUNT_RANGE = { MIN: 1_000, MAX: 30_000_000 } as const

// ─── 이름 매칭 ────────────────────────────────────────────────────

/**
 * 입금자명 → DB 고객명/업체명 매칭
 *
 * 지원 형식 (은행 입금자명 8-9자 잘림 허용):
 *   1. 고객명         "조동환"
 *   2. 업체명         "르비프"
 *   3. 고객명(업체명) "조동환(르비프)" or 잘린 "조동환(르비프"
 *   4. 업체명(고객명) "르비프(조동환)" or 잘린 "르비프(조동환"
 */
function isNameMatch(depositor: string, ownerName: string, businessName: string): boolean {
  const d   = depositor.trim()
  const own = (ownerName   ?? '').trim()
  const biz = (businessName ?? '').trim()
  if (!d) return false

  // 직접 일치
  if (own && d === own) return true
  if (biz && d === biz) return true

  // 괄호 포함 형식: "A(B..." or "A(B)"
  const pm = d.match(/^([^(（]+)[（(]([^)）]*)/)
  if (pm) {
    const before = pm[1].trim()
    const after  = pm[2].trim()  // 잘린 경우 불완전할 수 있음
    // 고객명(업체명...) — after가 업체명의 앞부분
    if (own && before === own && biz && biz.startsWith(after)) return true
    // 업체명(고객명...) — after가 고객명의 앞부분
    if (biz && before === biz && own && own.startsWith(after)) return true
  }

  // 완전 조합명의 앞부분 일치 (잘린 형식 추가 안전망)
  if (own && biz) {
    if (`${own}(${biz})`.startsWith(d)) return true
    if (`${biz}(${own})`.startsWith(d)) return true
  }

  return false
}

// ─── SMS 파싱 유틸 ────────────────────────────────────────────────

/** 은행 SMS에서 금액(원) 추출 — '입금' 다음 줄 순수 숫자 형식 */
function extractAmount(text: string): number | null {
  const m = text.match(/입금[\r\n]+\s*(\d+)/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return n >= AMOUNT_RANGE.MIN && n <= AMOUNT_RANGE.MAX ? n : null
}

/** 은행 SMS에서 입금자명 추출 */
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
    // 이름(업체명) 형식
    new RegExp(`(${nm})[（(][^)）]+[）)]`),
    // 이름 입금 (원 없는 형식 — KB 등)
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

// ─── 헬퍼 ────────────────────────────────────────────────────────

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

async function pushToAdmins(
  supabase: ReturnType<typeof createServiceClient>,
  payload: { title: string; body: string; url?: string },
) {
  try {
    const { data: admins } = await supabase
      .from('users').select('id').in('role', ['admin', 'staff'])
    const ids = (admins ?? []).map((a: { id: string }) => a.id)
    if (ids.length) await sendPushToUsers(ids, payload)
  } catch { /* Push 실패는 메인 응답에 영향 없음 */ }
}

// ─── 타입 ─────────────────────────────────────────────────────────

interface PaymentPayload {
  message?: string
  '메시지 내용'?: string
  key?: string
  bank?: string
  sender?: string
}

type AppRow = {
  id: string
  business_name: string
  owner_name: string
  phone: string
  deposit: number | null
  balance: number | null
  status: string
  notification_log: unknown
}

// ─── 메인 핸들러 ─────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') ?? ''
    const rawBody = await request.text()

    let message = '', bank = '', sender = ''

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(rawBody)
      message = params.get('message') ?? params.get('mb') ?? params.get('key') ?? ''
      bank    = params.get('bank') ?? ''
      sender  = params.get('sender') ?? params.get('pni') ?? ''
    } else {
      const body = JSON.parse(rawBody) as PaymentPayload
      message = body.message ?? body['메시지 내용'] ?? body.key ?? ''
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

    // ── 파싱 실패 처리 ────────────────────────────────────────────
    if (!amount) {
      await sendSlack(
        `⚠️ *입금 웹훅 — 금액 파싱 실패*\n• 입금자: ${depositor ?? '-'}\n• 은행: ${bank || sender || '-'}\n• SMS: ${message.slice(0, 100)}`
      ).catch(() => {})
      return NextResponse.json({ error: '금액 파싱 실패' }, { status: 422 })
    }

    if (!depositor) {
      await sendSlack(
        `⚠️ *입금 웹훅 — 입금자명 파싱 실패*\n• 금액: ${amount.toLocaleString('ko-KR')}원\n• SMS: ${message.slice(0, 100)}`
      ).catch(() => {})
      return NextResponse.json({ error: '입금자명 파싱 실패', amount }, { status: 422 })
    }

    // ── 이름 매칭 ─────────────────────────────────────────────────
    const { data: apps } = await supabase
      .from('service_applications')
      .select('id, business_name, owner_name, phone, deposit, balance, status, notification_log')
      .in('status', ALL_STATUSES)
      .is('deleted_at', null)

    const matched = (apps as AppRow[] ?? []).filter(a =>
      isNameMatch(depositor, a.owner_name, a.business_name)
    )

    const depositCandidates = matched.filter(a =>
      (DEPOSIT_STATUSES as readonly string[]).includes(a.status)
    )
    const balanceCandidates = matched.filter(a =>
      (BALANCE_STATUSES as readonly string[]).includes(a.status)
    )

    // ── 예약금 처리 ───────────────────────────────────────────────
    if (depositCandidates.length > 0) {
      if (depositCandidates.length > 1) {
        const list = depositCandidates.map(a => `• ${a.business_name} (${a.owner_name})`).join('\n')
        await sendSlack(
          `⚠️ *예약금 — 복수 매칭 (수동 처리 필요)*\n• 입금자: ${depositor}\n• 금액: ${amount.toLocaleString('ko-KR')}원\n${list}`
        ).catch(() => {})
        await pushToAdmins(supabase, {
          title: '예약금 수동 처리 필요',
          body: `입금자 ${depositor} — 복수 매칭`,
          url: '/admin/applications',
        })
        return NextResponse.json({ matched: 'deposit', action: 'manual', reason: 'multi_match' })
      }

      const app = depositCandidates[0]

      await supabase
        .from('service_applications')
        .update({ deposit: amount })
        .eq('id', app.id)

      const { ok, newStatus } = await fireNotify(origin, app.id, '예약금 입금완료 알림')

      await sendSlack(
        `💰 *예약금 입금 확인*\n• 업체: ${app.business_name} (${app.owner_name})\n• 입금자: ${depositor}\n• 금액: ${amount.toLocaleString('ko-KR')}원\n• 알림: ${ok ? '✅' : '❌'} | 상태: ${newStatus ?? '-'}`
      ).catch(() => {})
      await pushToAdmins(supabase, {
        title: '💰 예약금 입금 확인',
        body: `${app.business_name} — ${amount.toLocaleString('ko-KR')}원`,
        url: '/admin/applications',
      })

      return NextResponse.json({ matched: 'deposit', application_id: app.id, amount, notify_ok: ok })
    }

    // ── 잔금 처리 ─────────────────────────────────────────────────
    if (balanceCandidates.length > 0) {
      if (balanceCandidates.length > 1) {
        const list = balanceCandidates
          .map(a => `• ${a.business_name} (${a.owner_name}) — 잔금 ${(a.balance ?? 0).toLocaleString('ko-KR')}원`)
          .join('\n')
        await sendSlack(
          `⚠️ *잔금 — 복수 매칭 (수동 처리 필요)*\n• 입금자: ${depositor}\n• 금액: ${amount.toLocaleString('ko-KR')}원\n${list}`
        ).catch(() => {})
        await pushToAdmins(supabase, {
          title: '잔금 수동 처리 필요',
          body: `입금자 ${depositor} — 복수 매칭`,
          url: '/admin/applications',
        })
        return NextResponse.json({ matched: 'balance', action: 'manual', reason: 'multi_match' })
      }

      const app = balanceCandidates[0]
      const dbBalance = app.balance ?? 0

      // 금액 불일치
      if (dbBalance !== amount) {
        await sendSlack(
          `⚠️ *잔금 불일치*\n• 업체: ${app.business_name} (${app.owner_name})\n• 입금액: ${amount.toLocaleString('ko-KR')}원\n• DB 잔금: ${dbBalance.toLocaleString('ko-KR')}원\n• 차액: ${Math.abs(dbBalance - amount).toLocaleString('ko-KR')}원`
        ).catch(() => {})
        await pushToAdmins(supabase, {
          title: '⚠️ 잔금 금액 불일치',
          body: `${app.business_name} — 입금 ${amount.toLocaleString('ko-KR')}원 / DB ${dbBalance.toLocaleString('ko-KR')}원`,
          url: '/admin/applications',
        })
        return NextResponse.json({
          matched: 'balance', action: 'manual', reason: 'amount_mismatch',
          paid: amount, expected: dbBalance,
        })
      }

      const { ok, newStatus } = await fireNotify(origin, app.id, '결제완료알림(잔금)')

      await sendSlack(
        `💰 *잔금 입금 확인*\n• 업체: ${app.business_name} (${app.owner_name})\n• 입금자: ${depositor}\n• 금액: ${amount.toLocaleString('ko-KR')}원\n• 알림: ${ok ? '✅' : '❌'} | 상태: ${newStatus ?? '-'}`
      ).catch(() => {})
      await pushToAdmins(supabase, {
        title: '💰 잔금 입금 확인',
        body: `${app.business_name} — ${amount.toLocaleString('ko-KR')}원`,
        url: '/admin/applications',
      })

      return NextResponse.json({ matched: 'balance', application_id: app.id, amount, notify_ok: ok })
    }

    // ── 매칭 없음 ─────────────────────────────────────────────────
    await sendSlack(
      `⚠️ *입금 매칭 실패*\n• 입금자: ${depositor}\n• 금액: ${amount.toLocaleString('ko-KR')}원\n• 은행: ${bank || sender || '-'}`
    ).catch(() => {})
    await pushToAdmins(supabase, {
      title: '⚠️ 입금 매칭 실패',
      body: `입금자 ${depositor} — ${amount.toLocaleString('ko-KR')}원 (수동 처리 필요)`,
      url: '/admin/applications',
    })

    return NextResponse.json({ matched: 'none', depositor, amount })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
