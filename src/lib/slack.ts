// Slack 알림 공통 유틸
// 환경변수: SLACK_WEBHOOK_URL

export interface SlackNotifyOptions {
  notifyType: string
  customerName: string
  phone: string
  businessName: string
  constructionDate: string | null
  method: 'auto' | 'manual'
}

function toKST(date: Date): string {
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export async function notifySlack(opts: SlackNotifyOptions): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) return

  const text = [
    '알림 발송 완료',
    `- 유형: ${opts.notifyType}`,
    `- 수신: ${opts.customerName} (${opts.phone})`,
    `- 일정: ${opts.businessName} ${opts.constructionDate ?? '-'}`,
    `- 발송시각: ${toKST(new Date())}`,
    `- 발송방법: ${opts.method === 'auto' ? '자동' : '수동'}`,
  ].join('\n')

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
}
