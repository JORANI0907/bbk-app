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

export async function sendAlimtalk(
  to: string,
  templateId: string,
  variables: Record<string, string>,
  fallbackText: string,
): Promise<void> {
  const from = process.env.SOLAPI_SENDER_NUMBER
  if (!from) throw new Error('발신번호(SOLAPI_SENDER_NUMBER)가 설정되지 않았습니다.')
  const channelId = process.env.SOLAPI_KAKAO_CHANNEL_ID
  if (!channelId) throw new Error('카카오 채널 ID(SOLAPI_KAKAO_CHANNEL_ID)가 설정되지 않았습니다.')

  const service = getService()
  const phone = to.replace(/-/g, '')

  await service.sendOne({
    to: phone,
    from,
    kakaoOptions: {
      pfId: channelId,
      templateId,
      variables,
    },
    text: fallbackText,
  } as Parameters<typeof service.sendOne>[0])
}
