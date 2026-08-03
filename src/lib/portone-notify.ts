import { sendSmsOrLms } from '@/lib/solapi'
import { saveNotificationHistory } from '@/lib/notification'

type NotifyOpts = {
  ownerName:    string
  businessName: string
  phone:        string
  applicationId: string
}

export async function notifyDepositCard(
  opts: NotifyOpts & { amount: number; paymentUrl: string },
): Promise<void> {
  const { ownerName, phone, amount, paymentUrl, applicationId } = opts
  const amountStr = amount.toLocaleString('ko-KR')

  const text =
    `[BBK 공간케어] ${ownerName}님, 예약금 ${amountStr}원 결제 링크가 발송되었습니다. ${paymentUrl}`

  await sendSmsOrLms(phone, text)

  await saveNotificationHistory({
    category:      'sms',
    type:          'portone_deposit_card',
    body:          text,
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
  const { ownerName, phone, amount, bankName, accountNo, expiredAt, applicationId } = opts
  const amountStr  = amount.toLocaleString('ko-KR')
  const expiredStr = new Date(expiredAt).toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })

  const text =
    `[BBK 공간케어] ${ownerName}님, 예약금 ${amountStr}원 가상계좌 안내: ${bankName} ${accountNo} (기한: ${expiredStr})`

  await sendSmsOrLms(phone, text)

  await saveNotificationHistory({
    category:      'sms',
    type:          'portone_deposit_vbank',
    body:          text,
    recipientName: ownerName,
    recipientPhone: phone,
    metadata:      { applicationId, amount, bankName, accountNo, expiredAt },
  })
}

export async function notifyBalanceCard(
  opts: NotifyOpts & { amount: number; paymentUrl: string },
): Promise<void> {
  const { ownerName, phone, amount, paymentUrl, applicationId } = opts
  const amountStr = amount.toLocaleString('ko-KR')

  const text =
    `[BBK 공간케어] ${ownerName}님, 서비스가 완료되었습니다. 잔금 ${amountStr}원 결제 링크: ${paymentUrl}`

  await sendSmsOrLms(phone, text)

  await saveNotificationHistory({
    category:      'sms',
    type:          'portone_balance_card',
    body:          text,
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
  const { ownerName, phone, amount, bankName, accountNo, expiredAt, applicationId } = opts
  const amountStr  = amount.toLocaleString('ko-KR')
  const expiredStr = new Date(expiredAt).toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })

  const text =
    `[BBK 공간케어] ${ownerName}님, 서비스 완료. 잔금 ${amountStr}원 가상계좌: ${bankName} ${accountNo} (기한: ${expiredStr})`

  await sendSmsOrLms(phone, text)

  await saveNotificationHistory({
    category:      'sms',
    type:          'portone_balance_vbank',
    body:          text,
    recipientName: ownerName,
    recipientPhone: phone,
    metadata:      { applicationId, amount, bankName, accountNo, expiredAt },
  })
}
