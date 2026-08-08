import { SolapiMessageService } from 'solapi'

let solapiService: SolapiMessageService | null = null

function getService(): SolapiMessageService {
  if (!solapiService) {
    const apiKey = process.env.SOLAPI_API_KEY
    const apiSecret = process.env.SOLAPI_API_SECRET

    if (!apiKey || !apiSecret) {
      throw new Error('Solapi API 키가 설정되지 않았습니다.')
    }

    solapiService = new SolapiMessageService(apiKey, apiSecret)
  }
  return solapiService
}

export async function sendSMS(to: string, text: string): Promise<void> {
  const from = process.env.SOLAPI_SENDER_NUMBER
  if (!from) {
    throw new Error('발신번호(SOLAPI_SENDER_NUMBER)가 설정되지 않았습니다.')
  }

  const service = getService()
  const phone = to.replace(/-/g, '')

  await service.sendOne({
    to: phone,
    from,
    text,
  })
}

/**
 * Phase 25: SMS/LMS 통합 발송 (byte에 따라 자동 승격).
 * subject는 LMS 발송 시에만 사용됨. SMS이면 무시.
 */
export async function sendSmsOrLms(
  to: string,
  text: string,
  opts?: { subject?: string | null },
): Promise<void> {
  const from = process.env.SOLAPI_SENDER_NUMBER
  if (!from) throw new Error('발신번호(SOLAPI_SENDER_NUMBER)가 설정되지 않았습니다.')

  const service = getService()
  const phone = to.replace(/-/g, '')

  // byte 계산해 LMS 판별
  let bytes = 0
  for (const c of text) bytes += c.charCodeAt(0) > 127 ? 2 : 1
  const isLms = bytes > 90

  const payload: Record<string, unknown> = {
    to: phone,
    from,
    text,
  }
  if (isLms && opts?.subject) payload.subject = opts.subject

  await service.sendOne(payload as Parameters<typeof service.sendOne>[0])
}

export async function sendOTP(phone: string, otp: string): Promise<void> {
  const text = `[BBK Korea] 인증번호: ${otp}\n5분 내에 입력해주세요.`
  await sendSMS(phone, text)
}

export async function sendScheduleAlert(phone: string, customerName: string, date: string): Promise<void> {
  const text = `[BBK Korea] ${customerName}님, ${date} 서비스가 배정되었습니다.`
  await sendSMS(phone, text)
}

export async function sendCompletionAlert(phone: string, customerName: string): Promise<void> {
  const text = `[BBK Korea] ${customerName}님, 오늘 청소 서비스가 완료되었습니다. 리포트를 확인해보세요.`
  await sendSMS(phone, text)
}

/**
 * 급여명세서 SMS/LMS 발송.
 * PDF 다운로드 링크가 본문에 포함됨. 이메일 함께 발송 여부에 따라 안내 문구 조정.
 */
export async function sendPayslipSMS(opts: {
  toPhone: string
  personName: string
  monthLabel: string        // "2026년 7월"
  downloadUrl: string       // 시간 제한 signed URL (7일)
  netAmount?: number | null // 실지급액 (있으면 안내에 포함)
  emailSent: boolean
}): Promise<void> {
  const amountLine = opts.netAmount != null && opts.netAmount > 0
    ? `실지급액: ${opts.netAmount.toLocaleString('ko-KR')}원\n\n`
    : ''
  const emailLine = opts.emailSent
    ? '📧 이메일로도 PDF가 첨부 발송되었습니다.'
    : '📧 등록된 이메일이 없어 SMS로만 발송합니다.\n  이메일 등록을 원하시면 담당자에게 요청 바랍니다.'
  const text =
    `[BBK 공간케어 급여명세서]\n\n` +
    `${opts.personName}님, 안녕하세요.\n${opts.monthLabel} 급여명세서가 발행되었습니다.\n\n` +
    `${amountLine}` +
    `▼ PDF 다운로드 (7일간 유효)\n${opts.downloadUrl}\n\n` +
    `${emailLine}\n\n` +
    `문의: 031-759-4877\n범빌드코리아`
  await sendSmsOrLms(opts.toPhone, text, { subject: `[BBK] ${opts.monthLabel} 급여명세서` })
}

export async function sendSubscriptionPromoSMS(phone: string, customerName: string): Promise<void> {
  const subject = '지금 구독하면 200만원 아낍니다.'
  const text =
    `(광고)[BBK 공간케어]\n\n` +
    `${customerName}님, 이번 케어 만족스러우셨나요?\n\n` +
    `지금 구독으로 전환하시면\n1회성 대비 최대 49% 절감됩니다!\n\n` +
    `─────────────────────────\n` +
    `[구독 요금 비교]\n` +
    `◾ 스탠다드   월 99,000원 → 연 972,000원 절감 (45%↓)\n` +
    `◾ 더블클리닝 월 188,000원 → 연 2,064,000원 절감 (48%↓)\n` +
    `◾ 2년 재계약 시 15% 추가 할인\n` +
    `◾ 3년 이상  시 25% 추가 할인\n` +
    `─────────────────────────\n\n` +
    `매월 전문 관리로 처음처럼 깨끗한\n주방을 유지해보세요.\n\n` +
    `공간케어 서비스 자세히보기 👉 https://bbkorea.co.kr/\n\n` +
    `📞 031-759-4877 / 010-5434-4877\n` +
    `💬 카카오톡 채팅: http://pf.kakao.com/_JTNxin/chat\n\n` +
    `무료수신거부 080-500-4233`

  const from = process.env.SOLAPI_SENDER_NUMBER
  if (!from) throw new Error('발신번호(SOLAPI_SENDER_NUMBER)가 설정되지 않았습니다.')

  const service = getService()
  const normalizedPhone = phone.replace(/-/g, '')

  await service.sendOne({
    to: normalizedPhone,
    from,
    subject,
    text,
  } as Parameters<typeof service.sendOne>[0])
}

