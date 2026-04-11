import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const SOLAPI_API_KEY = process.env.SOLAPI_API_KEY!
const SOLAPI_API_SECRET = process.env.SOLAPI_API_SECRET!
const SOLAPI_SENDER = process.env.SOLAPI_SENDER_NUMBER!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const BUSINESS_CARD_MESSAGE = `안녕하세요! 범빌드코리아 공간케어입니다 😊
부재중 전화 확인했습니다.

📥 아래 내용을 보내주시면 담당자가 신속히 확인 후 연락드리겠습니다.
• 케어범위 :
• 사진 :

📋 BBK 공간케어
• "구독케어, 1회성케어의 표준"
• 연락처: 031-759-4877
• 홈페이지: https://bbkorea.co.kr`

/**
 * SMS 자동전달 앱 POST 변수
 * %pni% = 전화번호, %na% = 연락처 이름(미등록이면 빈값)
 * %nst% = 알림상태, %fn% = 전체이름, %ct% = 연락처타입
 * %rt% = 수신시간, %mb% = 메시지본문
 * %Y%M%d%a%h%H%m%w% = 날짜/시간
 */
interface SmsAutoForwardPayload {
  pni?: string   // 전화번호
  na?: string    // 연락처 이름 — 빈값이면 미등록
  nst?: string   // 알림 상태
  fn?: string    // 전체 이름
  ct?: string    // 연락처 타입
  rt?: string    // 수신 시간
  mb?: string    // 메시지 본문
  Y?: string     // 연
  M?: string     // 월
  d?: string     // 일
  a?: string     // AM/PM
  h?: string     // 시 (12h)
  H?: string     // 시 (24h)
  m?: string     // 분
  w?: string     // 요일
  [key: string]: string | undefined
}

/** 010-1234-5678 또는 01012345678 형식에서 숫자만 추출 */
function extractKoreanMobile(raw: string): string | null {
  const cleaned = raw.replace(/[^0-9]/g, '')
  return /^01[016789]\d{7,8}$/.test(cleaned) ? cleaned : null
}

/** mb(메시지본문) 텍스트에서 전화번호 파싱 (폴백용) */
function parsePhoneFromText(text: string): string | null {
  const match = text.match(/01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/)
  return match ? extractKoreanMobile(match[0]) : null
}

/** 연락처 미등록자 여부: na 필드가 비어있으면 미등록 */
function isUnknownCaller(na: string | undefined): boolean {
  return !na || na.trim() === ''
}

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL

async function notifySlack(phone: string) {
  if (!SLACK_WEBHOOK_URL) return
  await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `📱 *부재중 자동 명함 발송 완료*\n• 수신번호: ${phone}\n• 시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
    }),
  }).catch((err) => console.error('[missed-call] Slack 알림 실패', err))
}

function generateSolapiAuth() {
  const date = new Date().toISOString()
  const salt = crypto.randomBytes(32).toString('hex')
  const hmac = crypto.createHmac('sha256', SOLAPI_API_SECRET)
  hmac.update(date + salt)
  return { date, salt, signature: hmac.digest('hex') }
}

async function sendSms(to: string): Promise<{ ok: boolean; error?: string }> {
  const { date, salt, signature } = generateSolapiAuth()

  const res = await fetch('https://api.solapi.com/messages/v4/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`,
    },
    body: JSON.stringify({
      message: { to, from: SOLAPI_SENDER, text: BUSINESS_CARD_MESSAGE },
    }),
  })

  if (res.ok) return { ok: true }

  const err = await res.json().catch(() => ({}))
  return { ok: false, error: JSON.stringify(err) }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(request: NextRequest) {
  let payload: SmsAutoForwardPayload = {}

  // SMS 자동전달은 form-urlencoded 또는 JSON 둘 다 가능
  try {
    const contentType = request.headers.get('content-type') ?? ''
    const raw = await request.text()

    if (contentType.includes('application/json')) {
      payload = JSON.parse(raw)
    } else {
      // form-urlencoded (기본) 또는 JSON fallback
      try {
        new URLSearchParams(raw).forEach((value, key) => {
          payload[key] = value
        })
        // URLSearchParams로 파싱됐지만 pni가 없으면 JSON 재시도
        if (!payload.pni) {
          const jsonParsed = JSON.parse(raw)
          if (jsonParsed?.pni) payload = jsonParsed
        }
      } catch {
        payload = JSON.parse(raw)
      }
    }
  } catch {
    console.error('[missed-call] 요청 파싱 실패')
    return NextResponse.json(
      { success: false, error: '요청 파싱 실패' },
      { status: 400, headers: CORS_HEADERS },
    )
  }

  const { pni, na, mb } = payload

  // 연락처 등록된 발신자면 무시
  if (!isUnknownCaller(na)) {
    console.log('[missed-call] 연락처 등록자 — 발송 생략', { pni, na })
    return NextResponse.json(
      { success: true, skipped: true, reason: '연락처 등록자' },
      { headers: CORS_HEADERS },
    )
  }

  // 전화번호 추출: pni 우선, 없으면 mb 텍스트에서 파싱
  const phone = (pni ? extractKoreanMobile(pni) : null) ?? (mb ? parsePhoneFromText(mb) : null)

  if (!phone) {
    console.error('[missed-call] 전화번호 추출 실패', { pni, mb })
    return NextResponse.json(
      { success: false, error: '전화번호를 찾을 수 없습니다.' },
      { status: 400, headers: CORS_HEADERS },
    )
  }

  const result = await sendSms(phone)

  if (!result.ok) {
    console.error('[missed-call] 솔라피 발송 실패', { to: phone, error: result.error })
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 500, headers: CORS_HEADERS },
    )
  }

  console.log('[missed-call] 명함 발송 완료', { to: phone })
  notifySlack(phone)

  return NextResponse.json(
    { success: true, to: phone },
    { headers: CORS_HEADERS },
  )
}
