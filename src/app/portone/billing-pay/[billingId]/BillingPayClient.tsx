'use client'

/**
 * 정기 결제 클라이언트 컴포넌트
 *   2026-10-18 Phase H.6: 가상계좌 전용
 *   2026-11-01: 결제수단 3종 — ① 카드 결제 ② 계좌이체(가상계좌) ③ 카드 자동결제 등록
 *   2026-11-01 리디자인: '청구서' 구성 — 공급가액·부가세·합계 분리 표기, 안내사항 보강, 이모지 제거
 *
 * ① 카드: PortOne requestPayment(CARD) → /api/portone/billing-complete 로 서버 검증 → 완료
 * ② 가상계좌: 은행 선택 → requestPayment(VIRTUAL_ACCOUNT) → 계좌번호 표시 → 입금 시 webhook 이 paid 처리
 * ③ 자동결제: requestIssueBillingKey → /api/portone/billing-key-save(billingId 포함)
 *             → 서버가 카드 저장 + 이번 청구서 즉시 결제. 다음부터는 결제일에 자동 결제.
 *
 * 모바일은 결제창이 리디렉션 방식이라 이 페이지로 돌아온다 → URL 쿼리를 보고 마무리 처리.
 */

import { useEffect, useRef, useState } from 'react'
import { requestPayment, requestIssueBillingKey, Entity } from '@portone/browser-sdk/v2'
import { BBK_VBANK_BANKS, DEFAULT_VBANK_CODE, getBankLabel } from '@/lib/portone-banks'
import { isValidPaymentEmail } from '@/lib/payment-email'
import { hasVat, normalizePaymentMethod } from '@/lib/payment-methods'
import { Button, Select } from '@/components/ui'
import { Check, AlertCircle, Copy, CreditCard, Landmark, RefreshCw, ShieldCheck, Receipt, Clock, Phone } from 'lucide-react'
import { Shell, Section, Row, Notes, Figure, SUPPORT, CTA_CLASS, won, fmtDate } from '../../_shared/BillingShell'

const { Bank, CashReceiptType, BillingKeyMethod, WindowType } = Entity

type BrowserBank = typeof Bank[keyof typeof Bank]

// portone-banks.ts 는 server-sdk Bank enum('KOOKMIN') 기준, browser-sdk 는 'KOOKMIN_BANK' 형식.
const SERVER_TO_BROWSER_BANK: Record<string, BrowserBank> = {
  KOOKMIN:            Bank.KOOKMIN_BANK,
  SHINHAN:            Bank.SHINHAN_BANK,
  WOORI:              Bank.WOORI_BANK,
  HANA:               Bank.HANA_BANK,
  IBK:                Bank.INDUSTRIAL_BANK_OF_KOREA,
  NONGHYUP:           Bank.NH_NONGHYUP_BANK,
  KAKAO:              Bank.KAKAO_BANK,
  TOSS:               Bank.TOSS_BANK,
  POST:               Bank.EPOST,
  SUHYUP:             Bank.SUHYUP_BANK,
  KFCC:               Bank.KFCC,
  STANDARD_CHARTERED: Bank.SC_BANK_KOREA,
}

interface BillingData {
  id: string
  billingType: string
  billingPeriod: string
  amount: number
  dueDate: string
  paidDate: string | null
  status: string
  paymentPortoneId: string | null
}

export interface BillingPayCustomer {
  id: string | null
  businessName: string
  ownerName: string
  phone: string
  email: string | null
  customerType: string | null
  billingKeyStatus: string
  /** 매월 지정일 고객의 결제일. 건별 고객은 null */
  paymentDate: number | null
  /** 기본 결제수단 — 부가세 포함 여부 판단용 (현금 비과세는 부가세 없음) */
  paymentMethod: string | null
}

interface Props {
  billing: BillingData
  customer: BillingPayCustomer
}

type Method = 'card' | 'vbank' | 'autopay'

const STORE_ID = process.env.NEXT_PUBLIC_PORTONE_STORE_ID ?? ''
const CARD_CHANNEL_KEY = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_CARD ?? ''
// 2026-11-03: KG이니시스는 일반결제 채널 하나로 카드·가상계좌를 모두 처리한다 (src/lib/portone.ts getChannelKey 참고).
//   별도 VBANK 변수를 먼저 읽던 탓에 프로덕션에서 "channelKey is not correct" 가 났음 → 1회성 결제와 같은 카드 채널 키 사용.
const VBANK_CHANNEL_KEY = CARD_CHANNEL_KEY
const BILLING_CHANNEL_KEY = process.env.NEXT_PUBLIC_PORTONE_BILLING_CHANNEL_KEY
  ?? process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_BILLING ?? ''

function periodLabel(period: string): string {
  if (/^\d{4}$/.test(period)) return `${period}년 연간`
  const [y, m, d] = period.split('-')
  return d ? `${y}년 ${parseInt(m, 10)}월 ${parseInt(d, 10)}일 시공분` : `${y}년 ${parseInt(m, 10)}월분`
}

function serviceLabel(t: string | null): string {
  if (t === '정기딥케어') return '정기 딥케어'
  if (t === '정기엔드케어') return '정기 엔드케어'
  return '정기 서비스'
}

/** 합계에서 공급가액·부가세 역산 (부가세 포함 결제수단일 때만) */
function splitVat(total: number, paymentMethod: string | null) {
  if (!hasVat(paymentMethod)) return { supply: total, vat: 0, taxable: false }
  const supply = Math.round(total / 1.1)
  return { supply, vat: total - supply, taxable: true }
}

const METHODS: Array<{ key: Method; title: string; desc: string; Icon: typeof CreditCard }> = [
  { key: 'card',    title: '카드 결제',          desc: '신용·체크·법인카드로 이번 청구분을 결제합니다',          Icon: CreditCard },
  { key: 'vbank',   title: '가상계좌 입금',       desc: '은행을 고르면 이 청구 전용 입금 계좌가 발급됩니다',       Icon: Landmark },
  { key: 'autopay', title: '정기결제 (카드 자동결제)', desc: '카드를 등록하면 이번 청구분이 바로 결제되고, 다음부터는 결제일에 자동으로 결제됩니다', Icon: RefreshCw },
]

export function BillingPayClient({ billing, customer }: Props) {
  const [method, setMethod] = useState<Method>('card')
  const [vbankCode, setVbankCode] = useState<string>(DEFAULT_VBANK_CODE)
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('처리 중...')
  const [paid, setPaid] = useState(billing.status === 'paid' || !!billing.paidDate)
  const [autopayRegistered, setAutopayRegistered] = useState<string | null>(null)
  const [issuedAccount, setIssuedAccount] = useState<{ bank: string; accountNumber: string; expiry?: string } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const redirectHandled = useRef(false)

  const totalLabel = `${periodLabel(billing.billingPeriod)} ${serviceLabel(customer.customerType)} 결제`
  const { supply, vat, taxable } = splitVat(billing.amount, customer.paymentMethod)
  const isCashMethod = normalizePaymentMethod(customer.paymentMethod) === 'cash_untaxed'

  // ─── 서버 검증 / 저장 ───────────────────────────────
  const verifyCardPayment = async (paymentId: string) => {
    const res = await fetch('/api/portone/billing-complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billingId: billing.id, paymentId }),
    })
    const data = await res.json().catch(() => ({})) as { success?: boolean; error?: string; status?: string }
    if (!res.ok || !data.success) {
      throw new Error(data.error ?? (data.status === 'READY' ? '카드 승인이 완료되지 않았습니다.' : '결제 검증에 실패했습니다.'))
    }
    setPaid(true)
  }

  // 모바일 가상계좌 복귀: 서버에서 발급된 계좌 정보를 받아 표시
  const fetchIssuedAccount = async (paymentId: string) => {
    const res = await fetch('/api/portone/billing-complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billingId: billing.id, paymentId }),
    })
    const data = await res.json().catch(() => ({})) as {
      success?: boolean; status?: string; error?: string
      virtualAccount?: { bankCode?: string | null; accountNumber?: string | null; expiry?: string | null }
    }
    if (data.success) { setPaid(true); return }
    if (data.virtualAccount?.accountNumber) {
      setIssuedAccount({
        bank: getBankLabel(data.virtualAccount.bankCode ?? ''),
        accountNumber: data.virtualAccount.accountNumber,
        expiry: data.virtualAccount.expiry ?? undefined,
      })
      return
    }
    throw new Error(data.error ?? '가상계좌 정보를 확인하지 못했습니다. 잠시 후 문자로 안내됩니다.')
  }

  const saveBillingKeyAndCharge = async (billingKey: string, issueId: string) => {
    if (!customer.id) throw new Error('고객 정보가 없어 자동결제를 등록할 수 없습니다.')
    const res = await fetch('/api/portone/billing-key-save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: customer.id, billingKey, issueId, billingId: billing.id }),
    })
    const data = await res.json().catch(() => ({})) as { ok?: boolean; cardName?: string; charged?: boolean; chargeError?: string | null; error?: string }
    if (!res.ok || !data.ok) throw new Error(data.error ?? '카드 등록에 실패했습니다.')
    setAutopayRegistered(data.cardName ?? '등록된 카드')
    if (data.charged) {
      setPaid(true)
    } else {
      setErrorMsg(`카드는 등록됐지만 이번 결제는 실패했습니다: ${data.chargeError ?? '사유 미상'}. 아래에서 다른 방법으로 결제해 주세요.`)
    }
  }

  // ─── 모바일 리디렉션 복귀 처리 ──────────────────────
  useEffect(() => {
    if (redirectHandled.current || paid) return
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const txType = params.get('transactionType')
    const returnedPaymentId = params.get('paymentId')
    const returnedBillingKey = params.get('billingKey')
    if (!txType && !code) return
    redirectHandled.current = true

    if (code) {
      setErrorMsg(params.get('message') ?? '결제창에서 오류가 발생했습니다.')
      return
    }
    ;(async () => {
      setBusy(true)
      try {
        if (txType === 'PAYMENT' && returnedPaymentId && params.get('flow') === 'vbank') {
          setBusyLabel('가상계좌 확인 중...')
          await fetchIssuedAccount(returnedPaymentId)
        } else if (txType === 'PAYMENT' && returnedPaymentId) {
          setBusyLabel('결제 확인 중...')
          await verifyCardPayment(returnedPaymentId)
        } else if (txType === 'ISSUE_BILLING_KEY' && returnedBillingKey) {
          setBusyLabel('카드 등록 확인 중...')
          const issueId = params.get('issueId') ?? `bbk_billkey_${(customer.id ?? '').replace(/-/g, '').slice(0, 8)}_redirect`
          await saveBillingKeyAndCharge(returnedBillingKey, issueId)
        }
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : '처리에 실패했습니다.')
      } finally {
        setBusy(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── ① 카드 결제 ──────────────────────────────────
  const payWithCard = async () => {
    if (!billing.paymentPortoneId) throw new Error('결제 ID가 생성되지 않았습니다. 고객센터로 연락해 주세요.')
    if (!STORE_ID || !CARD_CHANNEL_KEY) throw new Error('카드 결제 설정이 없습니다. 고객센터로 연락해 주세요.')
    const redirectUrl = `${window.location.origin}/portone/billing-pay/${billing.id}?pid=${billing.paymentPortoneId}`
    const result = await requestPayment({
      storeId: STORE_ID,
      channelKey: CARD_CHANNEL_KEY,
      paymentId: billing.paymentPortoneId,
      orderName: `${customer.businessName} ${totalLabel}`,
      totalAmount: billing.amount,
      currency: 'CURRENCY_KRW',
      payMethod: 'CARD',
      redirectUrl,
      customer: {
        fullName: customer.ownerName || customer.businessName,
        phoneNumber: customer.phone.replace(/-/g, '') || undefined,
        email: isValidPaymentEmail(customer.email) ? customer.email!.trim() : undefined,
      },
    })
    if (!result) return  // 모바일 리디렉션 중
    if (result.code != null) {
      const isCancel = String(result.code).toUpperCase().includes('CANCEL') || String(result.message ?? '').includes('취소')
      if (isCancel) return
      throw new Error(friendlyPgError(result.message ?? '결제창에서 오류가 발생했습니다.'))
    }
    setBusyLabel('결제 확인 중...')
    await verifyCardPayment(billing.paymentPortoneId)
  }

  // ─── ② 가상계좌 ───────────────────────────────────
  const issueVirtualAccount = async () => {
    if (!billing.paymentPortoneId) throw new Error('결제 ID가 생성되지 않았습니다. 고객센터로 연락해 주세요.')
    if (!STORE_ID || !VBANK_CHANNEL_KEY) throw new Error('가상계좌 설정이 없습니다. 고객센터로 연락해 주세요.')
    const redirectUrl = `${window.location.origin}/portone/billing-pay/${billing.id}?pid=${billing.paymentPortoneId}&flow=vbank`
    const response = await requestPayment({
      storeId: STORE_ID,
      channelKey: VBANK_CHANNEL_KEY,
      paymentId: billing.paymentPortoneId,
      orderName: `${customer.businessName} ${totalLabel}`,
      totalAmount: billing.amount,
      currency: 'CURRENCY_KRW',
      payMethod: 'VIRTUAL_ACCOUNT',
      redirectUrl,
      virtualAccount: {
        accountExpiry: { validHours: 24 * 7 },
        bankCode: SERVER_TO_BROWSER_BANK[vbankCode] ?? Bank.KOOKMIN_BANK,
        cashReceiptType: CashReceiptType.CORPORATE,
      },
      customer: {
        fullName: customer.ownerName || customer.businessName,
        phoneNumber: customer.phone.replace(/-/g, '') || undefined,
        email: isValidPaymentEmail(customer.email) ? customer.email!.trim() : undefined,
      },
    })
    if (!response) return  // 모바일 리디렉션 중
    if (response.code != null) throw new Error(friendlyPgError(response.message ?? '가상계좌 발급 실패'))

    const r = response as unknown as {
      virtualAccount?: { accountNumber?: string; bankCode?: string; accountExpiry?: string | { validUntil?: string } }
    }
    if (r.virtualAccount?.accountNumber) {
      const expLabel = typeof r.virtualAccount.accountExpiry === 'string'
        ? r.virtualAccount.accountExpiry
        : r.virtualAccount.accountExpiry?.validUntil
      setIssuedAccount({
        bank: getBankLabel(r.virtualAccount.bankCode ?? vbankCode),
        accountNumber: r.virtualAccount.accountNumber,
        expiry: expLabel,
      })
    } else {
      setIssuedAccount({ bank: getBankLabel(vbankCode), accountNumber: '발급 중 (잠시 후 문자로 안내됩니다)' })
    }
  }

  // ─── ③ 카드 자동결제 등록 ─────────────────────────
  const registerAutopay = async () => {
    if (!customer.id) throw new Error('고객 정보가 없어 자동결제를 등록할 수 없습니다.')
    if (!STORE_ID || !BILLING_CHANNEL_KEY) throw new Error('자동결제 설정이 없습니다. 고객센터로 연락해 주세요.')
    const issueId = `bbk_billkey_${customer.id.replace(/-/g, '').slice(0, 8)}_${Date.now()}`
    const redirectUrl = `${window.location.origin}/portone/billing-pay/${billing.id}?pid=${billing.paymentPortoneId ?? ''}&issueId=${issueId}`
    const response = await requestIssueBillingKey({
      storeId: STORE_ID,
      channelKey: BILLING_CHANNEL_KEY,
      billingKeyMethod: BillingKeyMethod.CARD,
      issueId,
      // KG 결제창 제목: 대괄호·따옴표 등 특수문자는 PG 가 거절할 수 있어 제거
      issueName: `${customer.businessName.replace(/[\[\]<>&'"]/g, '').trim()} 정기 자동결제 등록`,
      redirectUrl,
      windowType: { mobile: WindowType.REDIRECTION },
      offerPeriod: { interval: '1m' },
      // 2026-11-01: displayAmount+currency 는 KG '신규 PC 결제창' 을 켜는 조합인데, 이 결제창에서
      //   /pay/card/billing 500 이 발생. 기본(공동인증서) 결제창으로 시도하기 위해 두 값을 보내지 않는다.
      customer: {
        customerId: customer.id,
        fullName: customer.ownerName || customer.businessName,
        phoneNumber: customer.phone.replace(/-/g, '') || undefined,
        email: isValidPaymentEmail(customer.email) ? customer.email!.trim() : undefined,
      },
    })
    if (!response) return  // 모바일 리디렉션 중
    if (response.code != null) throw new Error(response.message ?? response.pgMessage ?? '카드 등록 실패')
    setBusyLabel('카드 저장 및 결제 중...')
    await saveBillingKeyAndCharge(response.billingKey, issueId)
  }

  const handleSubmit = async () => {
    setBusy(true)
    setErrorMsg(null)
    setBusyLabel(method === 'card' ? '카드 결제창 여는 중...' : method === 'vbank' ? '가상계좌 발급 중...' : '카드 등록창 여는 중...')
    try {
      if (method === 'card') await payWithCard()
      else if (method === 'vbank') await issueVirtualAccount()
      else await registerAutopay()
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '처리에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = async () => {
    if (!issuedAccount?.accountNumber) return
    try {
      await navigator.clipboard.writeText(issuedAccount.accountNumber)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* 무시 */ }
  }

  const nextChargeText = customer.paymentDate
    ? `다음 결제부터는 매월 ${customer.paymentDate}일에 등록한 카드로 자동 결제됩니다.`
    : '다음 결제부터는 서비스 완료 후 등록한 카드로 자동 결제됩니다.'

  // ═══════════════════════════════════════════════════
  // 화면 1 · 결제 완료 (영수증)
  // ═══════════════════════════════════════════════════
  if (paid) {
    return (
      <Shell kicker="BBK 공간케어 · 정기 서비스 결제" businessName={customer.businessName} subtitle={totalLabel} tone="done">
        <Section delay={0}>
          <div className="flex flex-col items-center text-center gap-3 pt-2">
            <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-state-success-bg text-state-success">
              <Check size={26} strokeWidth={2.5} />
            </span>
            <h1 className="text-xl font-semibold text-text-primary leading-snug">결제가 완료되었습니다</h1>
            <p><Figure amount={billing.amount} size="xl" /></p>
          </div>
        </Section>
        <Section delay={1}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <Row k="업체" v={customer.businessName} />
            <Row k="내역" v={totalLabel} />
            <Row k="결제일" v={fmtDate(billing.paidDate ?? new Date().toISOString())} />
            {taxable && <Row k="공급가액 / 부가세" v={`${won(supply)} / ${won(vat)}`} />}
          </dl>
          {autopayRegistered && (
            <div className="mt-4 rounded-lg border border-sky-100 bg-sky-50 p-4 text-sm text-sky-900 leading-normal break-keep">
              <p className="font-semibold">카드 자동결제 등록 완료 · {autopayRegistered}</p>
              <p className="mt-1 text-sky-800">{nextChargeText} 해지는 고객센터로 연락 주세요.</p>
            </div>
          )}
        </Section>
        <Section delay={2}>
          <Notes items={[
            { Icon: ShieldCheck, text: '결제 내역은 저희 시스템에 바로 반영되며, 확인 문자가 발송됩니다.' },
            taxable
              ? { Icon: Receipt, text: '가상계좌·계좌이체 결제분은 세금계산서 발행 대상이며, 카드 결제분은 카드 매출전표로 갈음됩니다.' }
              : { Icon: Receipt, text: '현금 결제 건은 부가세가 포함되지 않은 금액입니다.' },
          ]} />
        </Section>
      </Shell>
    )
  }

  // ═══════════════════════════════════════════════════
  // 화면 2 · 가상계좌 발급 완료
  // ═══════════════════════════════════════════════════
  if (issuedAccount) {
    return (
      <Shell kicker="BBK 공간케어 · 정기 서비스 결제" businessName={customer.businessName} subtitle={totalLabel}>
        <Section delay={0}>
          <h1 className="text-lg font-semibold text-text-primary leading-snug">입금 전용 계좌가 발급되었습니다</h1>
          <p className="mt-1 text-sm text-text-secondary leading-normal break-keep">
            아래 계좌로 <strong className="text-text-primary">{won(billing.amount)}</strong>을 입금해 주세요. 입금이 확인되면 바로 결제 완료로 처리됩니다.
          </p>
        </Section>
        <Section delay={1}>
          <div className="rounded-xl border border-border bg-surface-sunken p-4 space-y-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-text-tertiary">은행</span>
              <span className="font-medium text-text-primary">{issuedAccount.bank}</span>
            </div>
            <div>
              <p className="text-sm text-text-tertiary mb-1">계좌번호</p>
              <div className="flex items-center gap-2">
                <p className="flex-1 text-2xl font-semibold tabular-nums text-text-primary tracking-tight break-all">
                  {issuedAccount.accountNumber}
                </p>
                <Button variant="secondary" size="sm" onClick={handleCopy} className="shrink-0">
                  {copied ? <><Check size={14} /> 복사됨</> : <><Copy size={14} /> 복사</>}
                </Button>
              </div>
            </div>
            <div className="border-t border-border-subtle" />
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-text-tertiary">예금주</span>
              <span className="font-medium text-text-primary">{SUPPORT.company}</span>
            </div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-text-tertiary">입금 금액</span>
              <Figure amount={billing.amount} size="md" />
            </div>
            {issuedAccount.expiry && (
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-text-tertiary">입금 기한</span>
                <span className="font-medium text-text-primary">{fmtDate(issuedAccount.expiry)}</span>
              </div>
            )}
          </div>
        </Section>
        <Section delay={2}>
          <Notes items={[
            { Icon: Clock, text: '가상계좌는 발급일로부터 7일간 유효합니다. 기한이 지나면 이 페이지에서 다시 발급받을 수 있습니다.' },
            { Icon: ShieldCheck, text: '입금 금액이 청구 금액과 정확히 일치해야 자동으로 처리됩니다. 입금 후 몇 분 안에 확인 문자가 발송됩니다.' },
            { Icon: Receipt, text: '가상계좌 입금분은 세금계산서 발행 대상입니다. 발행 시 문자로 안내드립니다.' },
          ]} />
        </Section>
      </Shell>
    )
  }

  // ═══════════════════════════════════════════════════
  // 화면 3 · 결제 요청 (청구서)
  // ═══════════════════════════════════════════════════
  const alreadyHasKey = customer.billingKeyStatus === 'active'
  const ctaLabel = method === 'card' ? `${won(billing.amount)} 카드로 결제`
    : method === 'vbank' ? '입금 계좌 발급받기'
    : `카드 등록하고 ${won(billing.amount)} 결제`

  return (
    <Shell kicker="BBK 공간케어 · 정기 서비스 결제" businessName={customer.businessName} subtitle={totalLabel}>
      {/* 청구 내역 */}
      <Section delay={0} title="청구 내역">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <Row k="서비스" v={serviceLabel(customer.customerType)} />
          <Row k="청구 기간" v={periodLabel(billing.billingPeriod)} />
        </dl>
        <div className="mt-4 rounded-xl border border-border-subtle bg-surface-sunken px-4 py-3 space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-text-secondary">공급가액</span>
            <span className="font-medium tabular-nums text-text-primary">{won(supply)}</span>
          </div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-text-secondary">{taxable ? '부가세 (10%)' : isCashMethod ? '부가세 (현금 비과세)' : '부가세'}</span>
            <span className="font-medium tabular-nums text-text-primary">{taxable ? won(vat) : '해당 없음'}</span>
          </div>
          <div className="border-t border-border-subtle" />
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-text-primary">합계 금액</span>
            <Figure amount={billing.amount} size="lg" />
          </div>
        </div>
      </Section>

      {/* 결제 방법 */}
      <Section delay={1} title="결제 방법">
        <div className="space-y-2" role="radiogroup" aria-label="결제 방법">
          {METHODS.map(({ key, title, desc, Icon }) => {
            const selected = method === key
            const disabled = key === 'autopay' && (alreadyHasKey || !customer.id)
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={busy || disabled}
                onClick={() => setMethod(key)}
                className={`w-full text-left rounded-xl border p-4 flex items-center gap-4 transition-all duration-150 ease-out-toss disabled:opacity-50 disabled:cursor-not-allowed ${
                  selected
                    ? 'border-sky-400 bg-sky-50 ring-2 ring-sky-100'
                    : 'border-border bg-surface hover:border-border-strong hover:shadow-soft active:scale-[0.99]'
                }`}
              >
                <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${selected ? 'bg-sky-400 text-white' : 'bg-sky-50 text-sky-500'}`}>
                  <Icon size={18} strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text-primary">{title}</span>
                  <span className="block text-xs text-text-secondary leading-normal break-keep mt-0.5">
                    {key === 'autopay' && alreadyHasKey ? '이미 자동결제 카드가 등록되어 있습니다' : desc}
                  </span>
                </span>
                <span className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${selected ? 'border-sky-400' : 'border-border-strong'}`}>
                  {selected && <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />}
                </span>
              </button>
            )
          })}
        </div>

        {method === 'vbank' && (
          <div className="mt-4">
            <Select
              label="입금받을 은행"
              value={vbankCode}
              onChange={e => setVbankCode(e.target.value)}
              disabled={busy}
              fullWidth
              hint="선택한 은행의 이 청구 전용 계좌가 발급됩니다. 7일간 유효합니다."
            >
              {BBK_VBANK_BANKS.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
            </Select>
          </div>
        )}

        {method === 'autopay' && (
          <ul className="mt-4 rounded-lg border border-sky-100 bg-sky-50 p-4 text-sm text-sky-900 leading-normal break-keep space-y-1.5 list-disc pl-5">
            <li>카드를 등록하면 <strong>이번 청구분 {won(billing.amount)}이 바로 결제</strong>됩니다.</li>
            <li>{nextChargeText}</li>
            <li>결제가 이루어질 때마다 확인 문자를 보내드립니다.</li>
            <li>해지를 원하시면 고객센터({SUPPORT.phone})로 연락 주세요.</li>
          </ul>
        )}

        {errorMsg && (
          <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-state-danger-bg p-4 flex items-start gap-2">
            <AlertCircle size={16} className="text-state-danger shrink-0 mt-0.5" />
            <p className="text-sm text-state-danger leading-normal break-keep">{errorMsg}</p>
          </div>
        )}

        <Button
          size="lg"
          onClick={handleSubmit}
          isLoading={busy}
          disabled={busy}
          className={`mt-5 w-full h-12 ${CTA_CLASS}`}
        >
          {busy ? busyLabel : ctaLabel}
        </Button>
        <p className="mt-2 text-xs text-text-tertiary text-center leading-normal">
          결제 완료 즉시 자동 반영되며 확인 문자가 발송됩니다.
        </p>
      </Section>

      {/* 안내 사항 */}
      <Section delay={2} title="안내 사항">
        <Notes items={[
          { Icon: Receipt, text: taxable
              ? '가상계좌·계좌이체 결제분은 세금계산서가 발행되며, 카드 결제분은 카드 매출전표로 갈음됩니다.'
              : '현금 결제 건은 부가세가 포함되지 않은 금액입니다.' },
          { Icon: Clock, text: '이 페이지는 결제가 완료될 때까지 계속 사용하실 수 있습니다.' },
          { Icon: ShieldCheck, text: '결제는 포트원(KG이니시스)을 통해 안전하게 처리되며, 카드 정보는 저희 서버에 저장되지 않습니다.' },
          { Icon: Phone, text: `문의: ${SUPPORT.phone} · ${SUPPORT.hours}` },
        ]} />
      </Section>
    </Shell>
  )
}

/** 같은 결제 ID 로 이미 가상계좌가 발급된 뒤 다른 수단을 시도하면 PG 가 거절한다 — 안내 문구로 바꿔준다 */
function friendlyPgError(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('already') || msg.includes('이미') || m.includes('duplicate')) {
    return `이미 가상계좌가 발급된 청구입니다. 발급된 계좌로 입금하시거나, 다른 방법을 원하시면 고객센터(${SUPPORT.phone})로 연락 주세요.`
  }
  return msg
}
