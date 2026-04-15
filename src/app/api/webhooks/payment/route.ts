import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'

// Make.com에서 파싱한 SMS 데이터를 수신
interface PaymentPayload {
  message: string    // %mb% — 은행 SMS 원문
  sender?: string    // %pni% — 발신번호/은행명
  contact?: string   // %ct% — 연락처 이름
  amount?: number    // Make.com이 직접 파싱한 금액 (있으면 우선 사용)
}

// 한국 은행 SMS에서 금액 추출
// 예: "300,000원 입금" | "입금 1,500,000원" | "3000000원"
function extractAmount(text: string): number | null {
  const matches = [...text.matchAll(/(\d{1,3}(?:,\d{3})*|\d+)\s*원/g)]
  for (const match of matches) {
    const n = parseInt(match[1].replace(/,/g, ''), 10)
    // 1천원 이상 3천만원 이하 — 잔액이나 잡숫자 제외
    if (n >= 1_000 && n <= 30_000_000) return n
  }
  return null
}

// 내부 알림 발송 (notify API 재사용)
async function fireNotify(origin: string, applicationId: string, type: string): Promise<{ ok: boolean; newStatus?: string }> {
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as PaymentPayload
    const { message, sender, amount: rawAmount } = body

    if (!message && rawAmount == null) {
      return NextResponse.json({ error: 'message 또는 amount 필요' }, { status: 400 })
    }

    // 금액 확정 (Make.com이 파싱한 값 우선, 없으면 BBK가 직접 파싱)
    const amount = rawAmount ?? extractAmount(message ?? '')
    if (!amount) {
      await sendSlack(
        `⚠️ *입금 웹훅 수신 — 금액 파싱 실패*\n• 발신: ${sender ?? '-'}\n• 메시지: ${(message ?? '').slice(0, 100)}`
      ).catch(() => {})
      return NextResponse.json({ error: '금액을 파싱할 수 없습니다.', message }, { status: 422 })
    }

    const supabase = createServiceClient()
    const origin = new URL(request.url).origin

    // ─── 예약금 매칭: 상태='신규', deposit=amount ──────────────
    const { data: depositApps } = await supabase
      .from('service_applications')
      .select('id, business_name, owner_name, phone, deposit, balance, status')
      .eq('status', '신규')
      .eq('deposit', amount)

    if (depositApps && depositApps.length > 0) {
      if (depositApps.length > 1) {
        // 복수 매칭 → 관리자에게 Slack 알림
        const list = depositApps.map(a => `• ${a.business_name} (${a.owner_name})`).join('\n')
        await sendSlack(
          `⚠️ *예약금 입금 — 복수 매칭 (수동 처리 필요)*\n• 금액: ${amount.toLocaleString('ko-KR')}원\n${list}`
        ).catch(() => {})
        return NextResponse.json({ matched: 'deposit', count: depositApps.length, action: 'manual_required' })
      }

      const app = depositApps[0]

      // 알림 발송 + 상태 변경 (notify API 사용)
      const { ok, newStatus } = await fireNotify(origin, app.id, '예약금 입금완료 알림')

      await sendSlack(
        `💰 *예약금 입금 확인*\n• 업체명: ${app.business_name}\n• 고객명: ${app.owner_name}\n• 금액: ${amount.toLocaleString('ko-KR')}원\n• 알림발송: ${ok ? '✅' : '❌'}\n• 상태변경: ${newStatus ?? '예약금 입금'}`
      ).catch(() => {})

      return NextResponse.json({ matched: 'deposit', application_id: app.id, amount, notify_ok: ok })
    }

    // ─── 잔금 매칭: 상태='작업완료' or '결제', balance=amount ──
    const { data: balanceApps } = await supabase
      .from('service_applications')
      .select('id, business_name, owner_name, phone, deposit, supply_amount, vat, balance, status')
      .in('status', ['작업완료', '결제'])

    if (balanceApps && balanceApps.length > 0) {
      // balance 컬럼 일치 또는 계산 일치 (supply+vat-deposit)
      const exactMatches = balanceApps.filter(a => {
        const storedBalance = a.balance
        const calcBalance = (a.supply_amount ?? 0) + (a.vat ?? 0) - (a.deposit ?? 0)
        return storedBalance === amount || calcBalance === amount
      })

      if (exactMatches.length === 1) {
        const app = exactMatches[0]
        const { ok, newStatus } = await fireNotify(origin, app.id, '결제완료알림(잔금)')

        await sendSlack(
          `💰 *잔금 입금 확인*\n• 업체명: ${app.business_name}\n• 고객명: ${app.owner_name}\n• 금액: ${amount.toLocaleString('ko-KR')}원\n• 알림발송: ${ok ? '✅' : '❌'}\n• 상태변경: ${newStatus ?? '결제완료(잔금)'}`
        ).catch(() => {})

        return NextResponse.json({ matched: 'balance', application_id: app.id, amount, notify_ok: ok })
      }

      if (exactMatches.length > 1) {
        const list = exactMatches.map(a => `• ${a.business_name} (${a.owner_name})`).join('\n')
        await sendSlack(
          `⚠️ *잔금 입금 — 복수 매칭 (수동 처리 필요)*\n• 금액: ${amount.toLocaleString('ko-KR')}원\n${list}`
        ).catch(() => {})
        return NextResponse.json({ matched: 'balance', count: exactMatches.length, action: 'manual_required' })
      }

      // 금액 불일치인 경우 — 가장 가까운 잔금 찾아 알림
      const nearest = balanceApps.reduce((prev, cur) => {
        const prevDiff = Math.abs((prev.balance ?? 0) - amount)
        const curDiff = Math.abs((cur.balance ?? 0) - amount)
        return curDiff < prevDiff ? cur : prev
      })
      await sendSlack(
        `⚠️ *잔금 금액 불일치 — 수동 확인 필요*\n• 입금액: ${amount.toLocaleString('ko-KR')}원\n• 가장 유사한 건: ${nearest.business_name} (${nearest.owner_name}) — 잔금 ${(nearest.balance ?? 0).toLocaleString('ko-KR')}원\n• 발신: ${sender ?? '-'}`
      ).catch(() => {})

      return NextResponse.json({ matched: 'none', amount, nearest: nearest.business_name, action: 'manual_required' })
    }

    // ─── 매칭 없음 ──────────────────────────────────────────────
    await sendSlack(
      `⚠️ *입금 매칭 실패 — 수동 확인 필요*\n• 금액: ${amount.toLocaleString('ko-KR')}원\n• 발신: ${sender ?? '-'}\n• 메시지: ${(message ?? '').slice(0, 80)}`
    ).catch(() => {})

    return NextResponse.json({ matched: 'none', amount })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
