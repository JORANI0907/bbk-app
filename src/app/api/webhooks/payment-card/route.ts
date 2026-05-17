import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendAlimtalk, sendSubscriptionPromoSMS } from '@/lib/solapi'
import { saveNotificationHistory } from '@/lib/notification'

// ─── 설정 ─────────────────────────────────────────────────────────

/** 카드 결제 완료 알림톡 템플릿 (결제완료알림과 동일) */
const TEMPLATE_ID = 'KA01TP260324125232674HVfev9PAzUe'

/** 카드 결제 처리 대상 상태 */
const TARGET_STATUSES = [
  '작업완료', '결제',
  '작업완료(카드플렛폼)', '결제(카드플렛폼)',
]

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// ─── 전화번호 유틸 ─────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  return raw.replace(/[^0-9]/g, '')
}

function isValidPhone(phone: string): boolean {
  return /^01[016789]\d{7,8}$/.test(phone)
}

function formatPhone(phone: string): string {
  if (phone.length === 11) return `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`
  if (phone.length === 10) return `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`
  return phone
}

/** mb(메시지 본문)에서 전화번호 추출 */
function extractPhoneFromText(text: string): string | null {
  const m = text.match(/01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/)
  return m ? normalizePhone(m[0]) : null
}

// ─── 핸들러 ──────────────────────────────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(request: NextRequest) {
  // ── 요청 파싱 ─────────────────────────────────────────────────
  let payload: Record<string, string | undefined> = {}
  try {
    const contentType = request.headers.get('content-type') ?? ''
    const raw = await request.text()
    if (contentType.includes('application/json')) {
      payload = JSON.parse(raw)
    } else {
      new URLSearchParams(raw).forEach((v, k) => { payload[k] = v })
      // JSON fallback
      if (!payload.pni && !payload.phone) {
        try { const j = JSON.parse(raw); if (j?.pni || j?.phone) payload = j } catch { /* noop */ }
      }
    }
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_request' }, { status: 400, headers: CORS })
  }

  // ── 전화번호 추출: pni → phone → mb 텍스트 순 ──────────────────
  const rawPhone = payload.pni ?? payload.phone ?? ''
  let phone = rawPhone ? normalizePhone(rawPhone) : null
  if (!phone || !isValidPhone(phone)) {
    phone = payload.mb ? extractPhoneFromText(payload.mb) : null
  }

  if (!phone || !isValidPhone(phone)) {
    await saveNotificationHistory({
      category: 'payment', type: '카드결제알림',
      body: `전화번호 추출 실패 — payload: ${JSON.stringify(payload).slice(0, 200)}`,
      recipientType: 'admin', status: 'failed', errorMessage: '전화번호 추출 실패',
    })
    return NextResponse.json({ ok: false, reason: 'no_phone' }, { status: 400, headers: CORS })
  }

  const phoneFormatted = formatPhone(phone)
  const supabase = createServiceClient()

  // ── 전화번호로 신청서 조회 ────────────────────────────────────
  const { data: apps } = await supabase
    .from('service_applications')
    .select('id, owner_name, business_name, phone, business_number, account_number, status, service_type, notification_log')
    .or(`phone.eq.${phone},phone.eq.${phoneFormatted}`)
    .in('status', TARGET_STATUSES)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (!apps || apps.length === 0) {
    await saveNotificationHistory({
      category: 'payment', type: '카드결제알림',
      body: `매칭 실패 — 전화번호: ${phoneFormatted}`,
      recipientType: 'admin', recipientPhone: phoneFormatted,
      status: 'failed', errorMessage: '전화번호 기반 매칭 실패',
    })
    return NextResponse.json({ ok: false, reason: 'no_match' }, { headers: CORS })
  }

  const app = apps[0] // 가장 최근 신청서

  // ── 알림톡 발송 ───────────────────────────────────────────────
  const fallback = `[BBK 공간케어] ${app.owner_name ?? ''}님, 카드 결제가 완료되었습니다. 감사합니다.`
  try {
    await sendAlimtalk(phone, TEMPLATE_ID, {
      '고객명':       String(app.owner_name ?? ''),
      '사업자등록번호': String(app.business_number ?? '-'),
      '페이백계좌번호': String(app.account_number ?? '-'),
    }, fallback)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await saveNotificationHistory({
      category: 'payment', type: '카드결제알림',
      body: `알림톡 발송 실패 — ${app.business_name}`,
      recipientType: 'customer', recipientPhone: phoneFormatted,
      recipientName: String(app.owner_name ?? ''),
      metadata: { application_id: app.id, business_name: app.business_name },
      status: 'failed', errorMessage: msg,
    })
    return NextResponse.json({ ok: false, reason: 'alimtalk_error' }, { status: 500, headers: CORS })
  }

  // ── notification_log 기록 ─────────────────────────────────────
  const nowIso = new Date().toISOString()
  const existingLog: Array<{ type: string; sent_at: string; phone: string; method: string; template_id?: string }> =
    Array.isArray(app.notification_log) ? app.notification_log : []
  const newEntry = { type: '카드결제완료알림', sent_at: nowIso, phone, method: 'auto' as const, template_id: TEMPLATE_ID }
  await supabase
    .from('service_applications')
    .update({ notification_log: [newEntry, ...existingLog] })
    .eq('id', app.id)

  await saveNotificationHistory({
    category: 'payment', type: '카드결제알림',
    body: `카드결제 알림톡 발송 완료 — ${app.business_name} (${phoneFormatted})`,
    title: '카드결제알림', method: 'auto',
    recipientType: 'customer',
    recipientName: String(app.owner_name ?? ''),
    recipientPhone: phoneFormatted,
    metadata: { application_id: app.id, business_name: app.business_name },
    status: 'sent',
  })

  // ── 1회성케어 구독권유 SMS 자동 발송 (미발송 건만) ──────────────
  if (app.service_type === '1회성케어') {
    try {
      const alreadySent = existingLog.some(l => l.type === '구독권유알림')
      if (!alreadySent) {
        await sendSubscriptionPromoSMS(phone, String(app.owner_name ?? ''))
        const promoEntry = { type: '구독권유알림', sent_at: nowIso, phone, method: 'auto' as const }
        await supabase
          .from('service_applications')
          .update({ notification_log: [promoEntry, newEntry, ...existingLog] })
          .eq('id', app.id)
        await saveNotificationHistory({
          category: 'sms', type: '구독권유알림',
          body: `구독권유 SMS — ${app.business_name} (카드결제 후 자동)`,
          title: '구독권유알림', method: 'auto',
          recipientType: 'customer',
          recipientName: String(app.owner_name ?? ''),
          recipientPhone: phoneFormatted,
          metadata: { application_id: app.id, trigger: '카드결제알림' },
          status: 'sent',
        })
      }
    } catch { /* 구독권유 실패는 메인 응답에 영향 없음 */ }
  }

  return NextResponse.json({ ok: true, matched: app.business_name }, { headers: CORS })
}
