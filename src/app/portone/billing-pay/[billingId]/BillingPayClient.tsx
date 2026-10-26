'use client'

/**
 * 정기 결제 클라이언트 컴포넌트 (2026-10-18 Phase H.6)
 *
 * 설계:
 * - 가상계좌 중심 (사장님 수금 추적 최적화)
 * - 은행 선택 → "결제하기" → PortOne SDK requestPayment 호출
 * - 발급된 가상계좌 번호 즉시 표시 → 고객이 그 계좌로 입금
 * - 입금 시 PortOne webhook Transaction.Paid → service_billings.status='paid' 자동 전환 (Phase H.3)
 *
 * 결제 완료 조건:
 * - billing.status === 'paid' 또는 paidDate 세팅됨 → 완료 화면 바로 표시
 */

import { useState } from 'react'
import { requestPayment, Entity } from '@portone/browser-sdk/v2'
import { BBK_VBANK_BANKS, DEFAULT_VBANK_CODE, getBankLabel } from '@/lib/portone-banks'
import { isValidPaymentEmail } from '@/lib/payment-email'
import { Check, Clock, AlertCircle, Loader2, Copy } from 'lucide-react'

const { Bank, CashReceiptType } = Entity

type BrowserBank = typeof Bank[keyof typeof Bank]

// portone-banks.ts 는 server-sdk Bank enum('KOOKMIN') 기준이지만
// browser-sdk requestPayment 는 'KOOKMIN_BANK' 형식 enum 을 요구함.
// 지원 12개 은행 매핑 (BBK_VBANK_BANKS 와 동기화 필요).
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

interface CustomerData {
  id: string | null
  businessName: string
  ownerName: string
  phone: string
  email: string | null
}

interface Props {
  billing: BillingData
  customer: CustomerData
}

const STORE_ID = process.env.NEXT_PUBLIC_PORTONE_STORE_ID ?? ''
const CHANNEL_KEY = process.env.NEXT_PUBLIC_PORTONE_VBANK_CHANNEL_KEY
  ?? process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY ?? ''

function monthLabel(period: string): string {
  if (/^\d{4}$/.test(period)) return `${period}년`
  const [y, m] = period.split('-')
  return `${y}년 ${parseInt(m, 10)}월`
}

function typeLabel(t: string): string {
  if (t === 'annual') return '연간'
  if (t === 'onetime') return '추가'
  return '월간'
}

export function BillingPayClient({ billing, customer }: Props) {
  const [vbankCode, setVbankCode] = useState<string>(DEFAULT_VBANK_CODE)
  const [paying, setPaying] = useState(false)
  const [issuedAccount, setIssuedAccount] = useState<{
    bank: string; accountNumber: string; expiry?: string
  } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const isPaid = billing.status === 'paid' || !!billing.paidDate
  const totalLabel = `${monthLabel(billing.billingPeriod)} ${typeLabel(billing.billingType)} 결제`

  // 가상계좌 발급 (PortOne SDK)
  const handlePay = async () => {
    if (!billing.paymentPortoneId) {
      setErrorMsg('결제 ID가 생성되지 않았습니다. 관리자에게 연락해주세요.')
      return
    }
    if (!STORE_ID || !CHANNEL_KEY) {
      setErrorMsg('PortOne 환경변수 미설정. 관리자에게 연락해주세요.')
      return
    }
    setPaying(true)
    setErrorMsg(null)
    try {
      const browserBankCode = SERVER_TO_BROWSER_BANK[vbankCode] ?? Bank.KOOKMIN_BANK

      const response = await requestPayment({
        storeId: STORE_ID,
        channelKey: CHANNEL_KEY,
        paymentId: billing.paymentPortoneId,
        orderName: `${customer.businessName} ${totalLabel}`,
        totalAmount: billing.amount,
        currency: 'CURRENCY_KRW',
        payMethod: 'VIRTUAL_ACCOUNT',
        virtualAccount: {
          accountExpiry: { validHours: 24 * 7 },  // 7일 유효
          bankCode: browserBankCode,
          cashReceiptType: CashReceiptType.CORPORATE,  // 지출증빙(사업자)
        },
        customer: {
          fullName: customer.ownerName || customer.businessName,
          phoneNumber: customer.phone.replace(/-/g, '') || undefined,
          // 형식이 틀린 이메일은 PortOne 이 거절 → 비어있을 때처럼 생략
          email: isValidPaymentEmail(customer.email) ? customer.email!.trim() : undefined,
        },
      })

      if (!response || response.code != null) {
        throw new Error(response?.message ?? '결제 발급 실패')
      }

      // PortOne V2 payInstantly 응답: virtualAccount 정보가 담김 (비동기 발급 가능 — webhook 보완)
      const r = response as unknown as {
        virtualAccount?: {
          accountNumber?: string
          bankCode?: string
          accountExpiry?: string | { validUntil?: string }
        }
      }
      if (r.virtualAccount?.accountNumber) {
        const bankLabel = getBankLabel(r.virtualAccount.bankCode ?? vbankCode)
        const expLabel = typeof r.virtualAccount.accountExpiry === 'string'
          ? r.virtualAccount.accountExpiry
          : r.virtualAccount.accountExpiry?.validUntil
        setIssuedAccount({
          bank: bankLabel,
          accountNumber: r.virtualAccount.accountNumber,
          expiry: expLabel,
        })
      } else {
        // 가상계좌 응답 없음 → webhook 이 비동기로 전달. "발급 중" 안내.
        setIssuedAccount({
          bank: getBankLabel(vbankCode),
          accountNumber: '발급 중... (잠시 후 SMS로 안내됩니다)',
        })
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '결제 발급 실패')
    } finally {
      setPaying(false)
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
  if (isPaid) {
    return (
      <Shell>
        <div className="text-center space-y-4 py-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 text-emerald-700">
            <Check size={32} />
          </div>
          <h1 className="text-xl font-bold text-text-primary">결제가 완료되었습니다</h1>
          <p className="text-sm text-text-secondary">
            {customer.businessName} · {totalLabel}
          </p>
          <p className="text-2xl font-bold text-text-primary">
            {billing.amount.toLocaleString('ko-KR')}원
          </p>
          {billing.paidDate && (
            <p className="text-xs text-text-tertiary">완료일: {billing.paidDate}</p>
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
            <p className="text-xs text-text-secondary mt-1">
              아래 계좌로 <strong>{billing.amount.toLocaleString('ko-KR')}원</strong> 입금해주세요
            </p>
          </div>

          <div className="rounded-xl border-2 border-sky-200 bg-sky-50 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-sky-700">
              <span>은행</span>
              <span className="font-semibold">{issuedAccount.bank}</span>
            </div>
            <div className="pt-2 border-t border-sky-200">
              <p className="text-xs text-sky-700 mb-1">계좌번호</p>
              <div className="flex items-center gap-2">
                <p className="text-lg font-bold text-text-primary flex-1 font-mono">
                  {issuedAccount.accountNumber}
                </p>
                <button
                  onClick={handleCopy}
                  className={`inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border font-semibold ${
                    copied
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                      : 'bg-white text-text-primary border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {copied ? <><Check size={12} /> 복사됨</> : <><Copy size={12} /> 복사</>}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-sky-700 pt-2 border-t border-sky-200">
              <span>예금주</span>
              <span className="font-semibold">범빌드코리아(주)</span>
            </div>
            <div className="flex items-center justify-between text-xs text-sky-700">
              <span>금액</span>
              <span className="font-bold text-base text-text-primary">
                {billing.amount.toLocaleString('ko-KR')}원
              </span>
            </div>
            {issuedAccount.expiry && (
              <div className="flex items-center justify-between text-xs text-sky-700">
                <span>입금 기한</span>
                <span>{issuedAccount.expiry.slice(0, 10).replace(/-/g, '.')}</span>
              </div>
            )}
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
  return (
    <Shell>
      <div className="space-y-5 py-2">
        {/* 금액 요약 */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
          <p className="text-xs text-emerald-700">{customer.businessName}</p>
          <p className="text-sm font-semibold text-text-primary">{totalLabel}</p>
          <div className="pt-2 border-t border-emerald-200 flex items-center justify-between">
            <span className="text-xs text-emerald-700">결제 금액</span>
            <span className="text-2xl font-bold text-text-primary">
              {billing.amount.toLocaleString('ko-KR')}원
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-emerald-700">
            <span>결제 기한</span>
            <span>{billing.dueDate.replace(/-/g, '.')}</span>
          </div>
        </div>

        {/* 은행 선택 */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-text-secondary">
            🏦 입금받을 은행 선택
          </label>
          <select
            value={vbankCode}
            onChange={e => setVbankCode(e.target.value)}
            disabled={paying}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            {BBK_VBANK_BANKS.map(b => (
              <option key={b.code} value={b.code}>{b.name}</option>
            ))}
          </select>
          <p className="text-[11px] text-text-tertiary">
            선택한 은행으로 가상계좌가 발급됩니다. 7일간 유효.
          </p>
        </div>

        {/* 에러 */}
        {errorMsg && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 flex items-start gap-2">
            <AlertCircle size={14} className="text-rose-600 shrink-0 mt-0.5" />
            <p className="text-xs text-rose-700 leading-relaxed">{errorMsg}</p>
          </div>
        )}

        {/* 결제 버튼 */}
        <button
          onClick={handlePay}
          disabled={paying}
          className="w-full py-3.5 text-sm font-bold bg-brand-600 hover:bg-brand-700 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
        >
          {paying ? <><Loader2 size={16} className="animate-spin" /> 가상계좌 발급 중...</> : '💳 결제하기'}
        </button>

        <p className="text-[10px] text-text-tertiary text-center leading-relaxed">
          결제 수단: 가상계좌 (계좌이체) · 선택한 은행에서 7일간 유효한 가상계좌가 발급됩니다<br/>
          입금 확인 즉시 결제 완료 처리 · 입금 안내 SMS 자동 발송
        </p>
      </div>
    </Shell>
  )
}

// ─── Shell (전체 레이아웃) ────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-soft border border-gray-200 overflow-hidden">
        <header className="px-5 py-4 border-b border-gray-200 bg-brand-50/50">
          <p className="text-[10px] text-text-tertiary">BBK 공간케어</p>
          <h2 className="text-base font-bold text-brand-700 mt-0.5">정기 결제</h2>
        </header>
        <main className="px-5 pb-6">
          {children}
        </main>
        <footer className="px-5 py-3 border-t border-gray-100 bg-slate-50 text-center">
          <p className="text-[10px] text-text-tertiary">
            범빌드코리아(주) · 문의 02-xxxx-xxxx
          </p>
        </footer>
      </div>
    </div>
  )
}
