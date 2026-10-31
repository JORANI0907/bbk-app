'use client'

/**
 * 정기 결제 클라이언트 컴포넌트
 *   2026-10-18 Phase H.6: 가상계좌 전용
 *   2026-11-01: 결제수단 3종 — ① 카드 결제 ② 계좌이체(가상계좌) ③ 카드 자동결제 등록
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
import { Check, Clock, AlertCircle, Loader2, Copy, CreditCard, Landmark, RefreshCw } from 'lucide-react'

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
}

interface Props {
  billing: BillingData
  customer: BillingPayCustomer
}

type Method = 'card' | 'vbank' | 'autopay'

const STORE_ID = process.env.NEXT_PUBLIC_PORTONE_STORE_ID ?? ''
const CARD_CHANNEL_KEY = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_CARD ?? ''
const VBANK_CHANNEL_KEY = process.env.NEXT_PUBLIC_PORTONE_VBANK_CHANNEL_KEY
  ?? process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_VBANK
  ?? process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY ?? ''
const BILLING_CHANNEL_KEY = process.env.NEXT_PUBLIC_PORTONE_BILLING_CHANNEL_KEY
  ?? process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_BILLING ?? ''

function monthLabel(period: string): string {
  if (/^\d{4}$/.test(period)) return `${period}년`
  const [y, m, d] = period.split('-')
  return d ? `${y}년 ${parseInt(m, 10)}월 ${parseInt(d, 10)}일` : `${y}년 ${parseInt(m, 10)}월`
}

function typeLabel(t: string): string {
  if (t === 'annual') return '연간'
  if (t === 'onetime') return '시공 건'
  return '월간'
}

const METHODS: Array<{ key: Method; title: string; desc: string; Icon: typeof CreditCard }> = [
  { key: 'card',    title: '카드 결제',        desc: '신용·체크·법인카드로 이번 건 결제',            Icon: CreditCard },
  { key: 'vbank',   title: '계좌이체(가상계좌)', desc: '은행을 고르면 입금 전용 계좌가 발급됩니다',   Icon: Landmark },
  { key: 'autopay', title: '카드 자동결제 등록', desc: '카드를 한 번 등록하면 다음부터 자동 결제',    Icon: RefreshCw },
]

export function BillingPayClient({ billing, customer }: Props) {
  const [method, setMethod] = useState<Method>('card')
  // 2026-11-01: KG이니시스 빌링 결제창이 500 을 내는 문제가 해결될 때까지 '카드 자동결제 등록'은
  //   주소에 ?autopay=1 을 붙인 내부 테스트에서만 보인다. 해결 확인 후 이 가드를 제거.
  const [showAutopay, setShowAutopay] = useState(false)
  useEffect(() => {
    setShowAutopay(new URLSearchParams(window.location.search).get('autopay') === '1')
  }, [])
  const visibleMethods = METHODS.filter(m => m.key !== 'autopay' || showAutopay)
  const [vbankCode, setVbankCode] = useState<string>(DEFAULT_VBANK_CODE)
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('처리 중...')
  const [paid, setPaid] = useState(billing.status === 'paid' || !!billing.paidDate)
  const [autopayRegistered, setAutopayRegistered] = useState<string | null>(null)
  const [issuedAccount, setIssuedAccount] = useState<{ bank: string; accountNumber: string; expiry?: string } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const redirectHandled = useRef(false)

  const totalLabel = `${monthLabel(billing.billingPeriod)} ${typeLabel(billing.billingType)} 결제`
  const amountLabel = `${billing.amount.toLocaleString('ko-KR')}원`

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
    throw new Error(data.error ?? '가상계좌 정보를 확인하지 못했습니다. 잠시 후 SMS로 안내됩니다.')
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
    if (!billing.paymentPortoneId) throw new Error('결제 ID가 생성되지 않았습니다. 관리자에게 연락해주세요.')
    if (!STORE_ID || !CARD_CHANNEL_KEY) throw new Error('카드 결제 설정이 없습니다. 관리자에게 연락해주세요.')
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
    if (!billing.paymentPortoneId) throw new Error('결제 ID가 생성되지 않았습니다. 관리자에게 연락해주세요.')
    if (!STORE_ID || !VBANK_CHANNEL_KEY) throw new Error('가상계좌 설정이 없습니다. 관리자에게 연락해주세요.')
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
      setIssuedAccount({ bank: getBankLabel(vbankCode), accountNumber: '발급 중... (잠시 후 SMS로 안내됩니다)' })
    }
  }

  // ─── ③ 카드 자동결제 등록 ─────────────────────────
  const registerAutopay = async () => {
    if (!customer.id) throw new Error('고객 정보가 없어 자동결제를 등록할 수 없습니다.')
    if (!STORE_ID || !BILLING_CHANNEL_KEY) throw new Error('자동결제 설정이 없습니다. 관리자에게 연락해주세요.')
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

  // ─── 결제 완료 화면 ─────────────────────────────────
  if (paid) {
    return (
      <Shell>
        <div className="text-center space-y-4 py-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 text-emerald-700">
            <Check size={32} />
          </div>
          <h1 className="text-xl font-bold text-text-primary">결제가 완료되었습니다</h1>
          <p className="text-sm text-text-secondary">{customer.businessName} · {totalLabel}</p>
          <p className="text-2xl font-bold text-text-primary">{amountLabel}</p>
          {billing.paidDate && <p className="text-xs text-text-tertiary">완료일: {billing.paidDate}</p>}
          {autopayRegistered && (
            <div className="mx-auto max-w-xs rounded-lg bg-sky-50 border border-sky-200 p-3 text-left">
              <p className="text-xs font-semibold text-sky-800">카드 자동결제 등록 완료 · {autopayRegistered}</p>
              <p className="text-[11px] text-sky-700 mt-1 leading-relaxed">
                {customer.paymentDate
                  ? `다음부터는 매월 ${customer.paymentDate}일에 자동으로 결제됩니다.`
                  : '다음부터는 서비스 완료 후 자동으로 결제됩니다.'}
              </p>
            </div>
          )}
        </div>
      </Shell>
    )
  }

  // ─── 가상계좌 발급 완료 화면 ────────────────────────
  if (issuedAccount) {
    return (
      <Shell>
        <div className="space-y-5 py-4">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-sky-100 text-sky-700">
              <Clock size={28} />
            </div>
            <h1 className="text-lg font-bold text-text-primary mt-3">가상계좌 발급 완료</h1>
            <p className="text-xs text-text-secondary mt-1">아래 계좌로 <strong>{amountLabel}</strong> 입금해주세요</p>
          </div>

          <div className="rounded-xl border-2 border-sky-200 bg-sky-50 p-4 space-y-2">
            <Row label="은행" value={issuedAccount.bank} />
            <div className="pt-2 border-t border-sky-200">
              <p className="text-xs text-sky-700 mb-1">계좌번호</p>
              <div className="flex items-center gap-2">
                <p className="text-lg font-bold text-text-primary flex-1 font-mono">{issuedAccount.accountNumber}</p>
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border font-semibold ${
                    copied ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-white text-text-primary border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {copied ? <><Check size={12} /> 복사됨</> : <><Copy size={12} /> 복사</>}
                </button>
              </div>
            </div>
            <div className="pt-2 border-t border-sky-200 space-y-2">
              <Row label="예금주" value="범빌드코리아(주)" />
              <Row label="금액" value={amountLabel} strong />
              {issuedAccount.expiry && <Row label="입금 기한" value={issuedAccount.expiry.slice(0, 10).replace(/-/g, '.')} />}
            </div>
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
            <p className="text-[11px] text-amber-900 leading-relaxed">
              💡 입금 확인 즉시 결제 완료 처리됩니다. 입금 후 몇 분 안에 안내 SMS가 발송됩니다.
            </p>
          </div>
        </div>
      </Shell>
    )
  }

  // ─── 결제 요청 화면 ─────────────────────────────────
  const alreadyHasKey = customer.billingKeyStatus === 'active'
  return (
    <Shell>
      <div className="space-y-5 py-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
          <p className="text-xs text-emerald-700">{customer.businessName}</p>
          <p className="text-sm font-semibold text-text-primary">{totalLabel}</p>
          <div className="pt-2 border-t border-emerald-200 flex items-center justify-between">
            <span className="text-xs text-emerald-700">결제 금액</span>
            <span className="text-2xl font-bold text-text-primary">{amountLabel}</span>
          </div>
          {billing.dueDate && (
            <div className="flex items-center justify-between text-xs text-emerald-700">
              <span>결제 기한</span>
              <span>{billing.dueDate.replace(/-/g, '.')}</span>
            </div>
          )}
        </div>

        {/* 결제수단 선택 */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-text-secondary">결제 방법 선택</p>
          <div className="space-y-2">
            {visibleMethods.map(({ key, title, desc, Icon }) => {
              const selected = method === key
              const disabled = key === 'autopay' && (alreadyHasKey || !customer.id)
              return (
                <button
                  key={key}
                  type="button"
                  disabled={busy || disabled}
                  onClick={() => setMethod(key)}
                  className={`w-full text-left rounded-xl border-2 p-3 flex items-center gap-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    selected ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${selected ? 'bg-brand-600 text-white' : 'bg-gray-100 text-text-secondary'}`}>
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text-primary">{title}</span>
                    <span className="block text-[11px] text-text-tertiary leading-snug">
                      {key === 'autopay' && alreadyHasKey ? '이미 자동결제 카드가 등록되어 있습니다' : desc}
                    </span>
                  </span>
                  <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${selected ? 'border-brand-600 bg-brand-600' : 'border-gray-300'}`} />
                </button>
              )
            })}
          </div>
        </div>

        {method === 'vbank' && (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-text-secondary">입금받을 은행 선택</label>
            <select
              value={vbankCode}
              onChange={e => setVbankCode(e.target.value)}
              disabled={busy}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              {BBK_VBANK_BANKS.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
            <p className="text-[11px] text-text-tertiary">선택한 은행으로 7일간 유효한 가상계좌가 발급됩니다.</p>
          </div>
        )}

        {method === 'autopay' && (
          <div className="rounded-lg bg-sky-50 border border-sky-200 p-3 text-[11px] text-sky-800 leading-relaxed space-y-1">
            <p>· 카드를 한 번 등록하면 <strong>이번 결제({amountLabel})가 바로 진행</strong>됩니다.</p>
            <p>· {customer.paymentDate ? `다음부터는 매월 ${customer.paymentDate}일에` : '다음부터는 서비스 완료 후'} 등록한 카드로 자동 결제됩니다.</p>
            <p>· 해지를 원하시면 고객센터(1522-9597)로 연락 주세요.</p>
          </div>
        )}

        {errorMsg && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 flex items-start gap-2">
            <AlertCircle size={14} className="text-rose-600 shrink-0 mt-0.5" />
            <p className="text-xs text-rose-700 leading-relaxed">{errorMsg}</p>
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy}
          className="w-full py-3.5 text-sm font-bold bg-brand-600 hover:bg-brand-700 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
        >
          {busy
            ? <><Loader2 size={16} className="animate-spin" /> {busyLabel}</>
            : method === 'card' ? `카드로 ${amountLabel} 결제하기`
            : method === 'vbank' ? '가상계좌 발급받기'
            : `카드 등록하고 ${amountLabel} 결제하기`}
        </button>

        <p className="text-[10px] text-text-tertiary text-center leading-relaxed">
          결제 완료 즉시 자동 처리되며 안내 SMS가 발송됩니다.
        </p>
      </div>
    </Shell>
  )
}

/** 같은 결제 ID 로 이미 가상계좌가 발급된 뒤 다른 수단을 시도하면 PG 가 거절한다 — 안내 문구로 바꿔준다 */
function friendlyPgError(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('already') || msg.includes('이미') || m.includes('duplicate')) {
    return '이미 가상계좌가 발급된 결제입니다. 발급된 계좌로 입금하시거나, 다른 방법을 원하시면 고객센터(1522-9597)로 연락 주세요.'
  }
  return msg
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs text-sky-700">
      <span>{label}</span>
      <span className={strong ? 'font-bold text-base text-text-primary' : 'font-semibold'}>{value}</span>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-soft border border-gray-200 overflow-hidden">
        <header className="px-5 py-4 border-b border-gray-200 bg-brand-50/50">
          <p className="text-[10px] text-text-tertiary">BBK 공간케어</p>
          <h2 className="text-base font-bold text-brand-700 mt-0.5">정기 결제</h2>
        </header>
        <main className="px-5 pb-6">{children}</main>
        <footer className="px-5 py-3 border-t border-gray-100 bg-slate-50 text-center">
          <p className="text-[10px] text-text-tertiary">범빌드코리아(주) · 고객센터 1522-9597</p>
        </footer>
      </div>
    </div>
  )
}
