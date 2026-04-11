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
