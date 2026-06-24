import { sendAlimtalk } from '@/lib/solapi'
import { saveNotificationHistory } from '@/lib/notification'

// 솔라피 카카오 알림톡 템플릿 ID — 심사 승인 후 여기에 입력
const TEMPLATE_IDS = {
  depositCard:  '',   // BBK_예약금_카드결제_요청
  depositVbank: '',   // BBK_예약금_가상계좌_안내
  balanceCard:  '',   // BBK_잔금_카드결제_요청
  balanceVbank: '',   // BBK_잔금_가상계좌_안내
} as const

type NotifyOpts = {
  ownerName:    string
  businessName: string
  phone:        string
  applicationId: string
}

export async function notifyDepositCard(
  opts: NotifyOpts & { amount: number; paymentUrl: string },
): Promise<void> {
  const { ownerName, businessName, phone, amount, paymentUrl, applicationId } = opts
  const amountStr = amount.toLocaleString('ko-KR')

  const fallback =
    `[BBK 공간케어] ${ownerName}님, 예약금 ${amountStr}원 결제 링크가 발송되었습니다. ${paymentUrl}`

  await sendAlimtalk(phone, TEMPLATE_IDS.depositCard, {
    '#{고객명}':   ownerName,
    '#{업체명}':   businessName,
    '#{결제금액}': amountStr,
    '#{결제링크}': paymentUrl,
  }, fallback)

  await saveNotificationHistory({
    category:      'alimtalk',
    type:          'portone_deposit_card',
    body:          fallback,
    recipientName: ownerName,
    recipientPhone: phone,
    metadata:      { applicationId, amount, paymentUrl },
  })
}

export async function notifyDepositVbank(
  opts: NotifyOpts & {
    amount:      number
    bankName:    string
    accountNo:   string
    expiredAt:   string
  },
): Promise<void> {
  const { ownerName, businessName, phone, amount, bankName, accountNo, expiredAt, applicationId } = opts
  const amountStr  = amount.toLocaleString('ko-KR')
  const expiredStr = new Date(expiredAt).toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })

  const fallback =
    `[BBK 공간케어] ${ownerName}님, 예약금 ${amountStr}원 가상계좌 안내: ${bankName} ${accountNo} (기한: ${expiredStr})`

  await sendAlimtalk(phone, TEMPLATE_IDS.depositVbank, {
    '#{고객명}':   ownerName,
    '#{업체명}':   businessName,
    '#{결제금액}': amountStr,
    '#{은행명}':   bankName,
    '#{계좌번호}': accountNo,
    '#{입금기한}': expiredStr,
  }, fallback)

  await saveNotificationHistory({
    category:      'alimtalk',
    type:          'portone_deposit_vbank',
    body:          fallback,
    recipientName: ownerName,
    recipientPhone: phone,
    metadata:      { applicationId, amount, bankName, accountNo, expiredAt },
  })
}

export async function notifyBalanceCard(
  opts: NotifyOpts & { amount: number; paymentUrl: string },
): Promise<void> {
  const { ownerName, businessName, phone, amount, paymentUrl, applicationId } = opts
  const amountStr = amount.toLocaleString('ko-KR')

  const fallback =
    `[BBK 공간케어] ${ownerName}님, 서비스가 완료되었습니다. 잔금 ${amountStr}원 결제 링크: ${paymentUrl}`

  await sendAlimtalk(phone, TEMPLATE_IDS.balanceCard, {
    '#{고객명}':   ownerName,
    '#{업체명}':   businessName,
    '#{결제금액}': amountStr,
    '#{결제링크}': paymentUrl,
  }, fallback)

  await saveNotificationHistory({
    category:      'alimtalk',
    type:          'portone_balance_card',
    body:          fallback,
    recipientName: ownerName,
    recipientPhone: phone,
    metadata:      { applicationId, amount, paymentUrl },
  })
}

export async function notifyBalanceVbank(
  opts: NotifyOpts & {
    amount:    number
    bankName:  string
    accountNo: string
    expiredAt: string
  },
): Promise<void> {
  const { ownerName, businessName, phone, amount, bankName, accountNo, expiredAt, applicationId } = opts
  const amountStr  = amount.toLocaleString('ko-KR')
  const expiredStr = new Date(expiredAt).toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })

  const fallback =
    `[BBK 공간케어] ${ownerName}님, 서비스 완료. 잔금 ${amountStr}원 가상계좌: ${bankName} ${accountNo} (기한: ${expiredStr})`

  await sendAlimtalk(phone, TEMPLATE_IDS.balanceVbank, {
    '#{고객명}':   ownerName,
    '#{업체명}':   businessName,
    '#{결제금액}': amountStr,
    '#{은행명}':   bankName,
    '#{계좌번호}': accountNo,
    '#{입금기한}': expiredStr,
  }, fallback)

  await saveNotificationHistory({
    category:      'alimtalk',
    type:          'portone_balance_vbank',
    body:          fallback,
    recipientName: ownerName,
    recipientPhone: phone,
    metadata:      { applicationId, amount, bankName, accountNo, expiredAt },
  })
}
