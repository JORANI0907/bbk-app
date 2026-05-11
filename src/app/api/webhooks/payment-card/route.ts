import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSubscriptionPromoSMS } from '@/lib/solapi'
import { saveNotificationHistory } from '@/lib/notification'

const SOLAPI_API_KEY = process.env.SOLAPI_API_KEY!
const SOLAPI_API_SECRET = process.env.SOLAPI_API_SECRET!
const SOLAPI_SENDER = process.env.SOLAPI_SENDER_NUMBER!

const PF_ID = 'KA01PF2508222339266591W2FSGJMegb'
const TEMPLATE_ID = 'KA01TP251212135726272nAAAlElnQY7'

// 기존 결제 완료 알림 자동화와 동일한 계약상태 조건
const PAYMENT_STATUSES = [
  '작업완료', '작업완료(현금)', '작업완료(카드플렛폼)', '작업완료(엔드)',
  '결제', '결제(현금)', '결제(카드플렛폼)', '결제(정기)',
]

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

/**
 * SMS 자동전달 앱 POST 변수
 * %pni% = 전화번호, %na% = 연락처 이름
 * %mb% = 메시지 본문 (결제선생 알림 텍스트)
 */
interface Payload {
  pni?: string    // 전화번호 (SMS 자동전달 앱 변수)
  na?: string     // 연락처 이름
  mb?: string     // 메시지 본문
  phone?: string  // 직접 전달 시
  name?: string   // 직접 전달 시
  [key: string]: string | undefined
}

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

/** mb(메시지 본문)에서 전화번호 파싱 */
function parsePhoneFromText(text: string): string | null {
  const match = text.match(/01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/)
  return match ? normalizePhone(match[0]) : null
}

function generateSolapiAuth() {
  const date = new Date().toISOString()
  const salt = crypto.randomBytes(32).toString('hex')
  const hmac = crypto.createHmac('sha256', SOLAPI_API_SECRET)
  hmac.update(date + salt)
  return { date, salt, signature: hmac.digest('hex') }
}

async function sendAlimtalk(to: string, variables: Record<string, string>): Promise<void> {
  const { date, salt, signature } = generateSolapiAuth()
  const res = await fetch('https://api.solapi.com/messages/v4/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`,
    },
    body: JSON.stringify({
      message: {
        to,
        from: SOLAPI_SENDER,
        type: 'ATA',
        kakaoOptions: { pfId: PF_ID, templateId: TEMPLATE_ID, variables },
      },
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`알림톡 발송 실패: ${JSON.stringify(err)}`)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(request: NextRequest) {
  let payload: Payload = {}

  try {
    const contentType = request.headers.get('content-type') ?? ''
    const raw = await request.text()

    if (contentType.includes('application/json')) {
      payload = JSON.parse(raw)
    } else {
      // form-urlencoded (SMS 자동전달 앱 기본) 또는 JSON fallback
      try {
        new URLSearchParams(raw).forEach((value, key) => { payload[key] = value })
        if (!payload.pni && !payload.phone) {
          const jsonParsed = JSON.parse(raw)
          if (jsonParsed?.pni || jsonParsed?.phone) payload = jsonParsed
        }
      } catch {
        payload = JSON.parse(raw)
      }
    }
  } catch {
    return NextResponse.json(
      { ok: false, reason: 'invalid_request' },
      { status: 400, headers: CORS_HEADERS },
    )
  }

  const { pni, mb, phone: directPhone } = payload

  // 전화번호 추출: pni 우선 → phone 직접 → mb 텍스트 파싱
  const rawPhone = pni ?? directPhone ?? ''
  let phone = rawPhone ? normalizePhone(rawPhone) : null
  if (!phone || !isValidPhone(phone)) {
    phone = mb ? parsePhoneFromText(mb) : null
  }

  if (!phone || !isValidPhone(phone)) {
    await saveNotificationHistory({
      category: 'payment',
      type: '카드결제알림',
      body: `[카드결제알림] 전화번호 추출 실패 — payload: ${JSON.stringify(payload).slice(0, 200)}`,
      recipientType: 'admin',
      status: 'failed',
      errorMessage: '전화번호 추출 실패',
    })
    return NextResponse.json(
      { ok: false, reason: 'no_phone' },
      { status: 400, headers: CORS_HEADERS },
    )
  }

  const phoneFormatted = formatPhone(phone)
  const supabase = createServiceClient()

  // 전화번호로 고객 조회 (저장 포맷 차이 대응: 숫자만 / 대시 포함)
  const { data: apps } = await supabase
    .from('service_applications')
    .select('id, owner_name, business_name, phone, business_number, account_number, status, service_type, notification_log')
    .or(`phone.eq.${phone},phone.eq.${phoneFormatted}`)
    .in('status', PAYMENT_STATUSES)
    .order('created_at', { ascending: false })

  if (!apps || apps.length === 0) {
    await saveNotificationHistory({
      category: 'payment',
      type: '카드결제알림',
      body: `[카드결제알림] 매칭 실패 — 수동 확인 필요. 전화번호: ${phoneFormatted}`,
      recipientType: 'admin',
      recipientPhone: phoneFormatted,
      status: 'failed',
      errorMessage: '매칭 실패 — 수동 확인 필요',
    })
    return NextResponse.json(
      { ok: false, reason: 'no_match' },
      { headers: CORS_HEADERS },
    )
  }

  const app = apps[0] // 가장 최근 신청서

  try {
    await sendAlimtalk(phone, {
      '#{고객명}': app.owner_name ?? '',
      '#{사업자등록번호}': app.business_number ?? '',
      '#{페이백계좌번호}': app.account_number ?? '',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await saveNotificationHistory({
      category: 'payment',
      type: '카드결제알림',
      body: `[카드결제알림] 알림톡 발송 오류 — 고객: ${app.business_name}`,
      recipientType: 'admin',
      recipientPhone: phoneFormatted,
      recipientName: String(app.owner_name ?? ''),
      metadata: { business_name: app.business_name, application_id: app.id },
      status: 'failed',
      errorMessage: msg,
    })
    return NextResponse.json(
      { ok: false, reason: 'alimtalk_error' },
      { status: 500, headers: CORS_HEADERS },
    )
  }

  // 발송 이력 저장 (실패해도 응답에는 영향 없음)
  await supabase
    .from('notification_logs')
    .insert({
      application_id: app.id,
      template_name: '결제완료알림',
      send_type: 'auto',
      sent_at: new Date().toISOString(),
    })
    .then(({ error }) => {
      if (error) console.error('[payment-card] 발송 이력 저장 실패', error)
    })

  await saveNotificationHistory({
    category: 'payment',
    type: '카드결제알림',
    body: `카드결제 알림톡 발송 완료 — ${app.business_name} (${app.owner_name}) / ${phoneFormatted}`,
    title: '카드결제알림',
    method: 'auto',
    recipientType: 'customer',
    recipientName: String(app.owner_name ?? ''),
    recipientPhone: phoneFormatted,
    metadata: { business_name: app.business_name, application_id: app.id },
    status: 'sent',
  })

  // 1회성케어인 경우 구독권유알림 자동 발송 (실패해도 메인 응답에 영향 없음)
  if (app.service_type === '1회성케어') {
    try {
      const existingLog: Array<{ type: string }> = Array.isArray(app.notification_log) ? app.notification_log : []
      const alreadySentPromo = existingLog.some(l => l.type === '구독권유알림')
      if (!alreadySentPromo) {
        const customerName = String(app.owner_name ?? '')
        await sendSubscriptionPromoSMS(phone, customerName)
        const promoNow = new Date().toISOString()
        const promoEntry = { type: '구독권유알림', sent_at: promoNow, phone, method: 'auto' }
        await supabase
          .from('service_applications')
          .update({ notification_log: [promoEntry, ...existingLog] })
          .eq('id', app.id)
        await saveNotificationHistory({
          category: 'sms',
          type: '구독권유알림',
          body: `구독권유 SMS 자동 발송 — ${app.business_name} (${app.owner_name})`,
          title: '구독권유알림',
          method: 'auto',
          recipientType: 'customer',
          recipientName: String(app.owner_name ?? ''),
          recipientPhone: phoneFormatted,
          metadata: { business_name: app.business_name, application_id: app.id, trigger: '카드결제알림' },
          status: 'sent',
        })
      }
    } catch {
      // 구독권유알림 실패는 메인 응답에 영향 없음
    }
  }

  return NextResponse.json(
    { ok: true, matched: app.business_name },
    { headers: CORS_HEADERS },
  )
}
