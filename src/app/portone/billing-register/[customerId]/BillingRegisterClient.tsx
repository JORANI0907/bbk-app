'use client'

/**
 * 자동결제 카드 등록 클라이언트 컴포넌트 (2026-10-18 Phase I.2 → 2026-11-01 리디자인)
 *
 * 역할:
 *   PortOne browser-sdk `requestIssueBillingKey` 호출 → 카드 등록 UI
 *   발급된 billingKey 를 BBK 서버 API `/api/portone/billing-key-save` 로 전달 → customers 테이블 저장
 *
 * 2026-11-01:
 *   - 청구서 결제 페이지(/portone/billing-pay)와 같은 공용 뼈대(BillingShell) 사용
 *   - 공급가액·부가세·합계 분리 표기, 안내사항 보강, 이모지 제거
 *   - KG '신규 PC 결제창'(displayAmount+currency)에서 500 이 나서 기본 결제창으로 호출
 */

import { useState, useEffect, useRef } from 'react'
import { requestIssueBillingKey, Entity } from '@portone/browser-sdk/v2'
import { Check, CreditCard, AlertCircle, ShieldCheck, Clock, Receipt, Phone } from 'lucide-react'
import { Button } from '@/components/ui'
import { hasVat, normalizePaymentMethod } from '@/lib/payment-methods'
import { isValidPaymentEmail } from '@/lib/payment-email'
import { Shell, Section, Row, Notes, Figure, SUPPORT, CTA_CLASS, won, fmtDate } from '../../_shared/BillingShell'

const { BillingKeyMethod, WindowType } = Entity

export interface BillingRegisterCustomer {
  id: string
  businessName: string
  ownerName: string
  phone: string
  email: string | null
  customerType: string | null
  /** 주기당 결제 금액(부가세 포함 총액). 건별 고객은 회당 금액 */
  amount: number
  paymentDate: number | null
  billingTrigger: string | null
  billingCycle: string | null
  paymentMethod: string | null
  cardName: string | null
  issuedAt: string | null
}

interface Props {
  customer: BillingRegisterCustomer
  isAlreadyActive: boolean
  token: string
}

const STORE_ID = process.env.NEXT_PUBLIC_PORTONE_STORE_ID ?? ''
const CHANNEL_KEY = process.env.NEXT_PUBLIC_PORTONE_BILLING_CHANNEL_KEY
  ?? process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_BILLING ?? ''

function serviceLabel(t: string | null): string {
  if (t === '정기딥케어') return '정기 딥케어'
  if (t === '정기엔드케어') return '정기 엔드케어'
  return '정기 서비스'
}

function cycleLabel(cycle: string | null): string {
  if (!cycle || cycle === '월간') return '1개월'
  if (cycle === '연간') return '12개월'
  return cycle
}

/** 언제 자동결제가 되는지 한 문장 */
function scheduleText(c: BillingRegisterCustomer): string {
  if (c.billingTrigger === 'per_visit') return '시공 1건이 완료될 때마다 등록한 카드로 자동 결제됩니다.'
  if (c.paymentDate) return `${cycleLabel(c.billingCycle)}마다 ${c.paymentDate}일에 등록한 카드로 자동 결제됩니다.`
  return `${cycleLabel(c.billingCycle)}마다 결제일에 등록한 카드로 자동 결제됩니다.`
}

function splitVat(total: number, paymentMethod: string | null) {
  if (!hasVat(paymentMethod)) return { supply: total, vat: 0, taxable: false }
  const supply = Math.round(total / 1.1)
  return { supply, vat: total - supply, taxable: true }
}

export function BillingRegisterClient({ customer, isAlreadyActive, token }: Props) {
  const [issuing, setIssuing] = useState(false)
  const [completed, setCompleted] = useState(isAlreadyActive)
  const [cardName, setCardName] = useState<string | null>(customer.cardName)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const autoSavedRef = useRef(false)  // StrictMode / 중복 호출 방지

  const { supply, vat, taxable } = splitVat(customer.amount, customer.paymentMethod)
  const isCash = normalizePaymentMethod(customer.paymentMethod) === 'cash_untaxed'
  const amountTitle = customer.billingTrigger === 'per_visit' ? '회당 결제 금액' : `${cycleLabel(customer.billingCycle)}마다 결제 금액`

  // 서버에 billingKey 저장 공통 로직
  const saveBillingKey = async (billingKey: string, issueId: string) => {
    const saveRes = await fetch('/api/portone/billing-key-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: customer.id, billingKey, issueId }),
    })
    if (!saveRes.ok) {
      const errData = await saveRes.json().catch(() => ({}))
      throw new Error(errData?.error ?? '카드 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    }
    const saveData = await saveRes.json() as { cardName?: string }
    setCardName(saveData.cardName ?? null)
    setCompleted(true)
  }

  // 모바일 리디렉션 복귀 처리 — URL 쿼리에 billingKey 가 있으면 자동 저장
  useEffect(() => {
    if (autoSavedRef.current || isAlreadyActive) return
    const params = new URLSearchParams(window.location.search)
    const returnedBillingKey = params.get('billingKey')
    const returnedTxType = params.get('transactionType')
    const returnedCode = params.get('code')
    const returnedMsg = params.get('message')
    const returnedIssueId = params.get('issueId') ?? `bbk_billkey_${customer.id.replace(/-/g, '').slice(0, 8)}_redirect`

    if (returnedCode) {
      autoSavedRef.current = true
      setErrorMsg(returnedMsg ?? '카드 등록창에서 오류가 발생했습니다.')
      return
    }
    if (returnedBillingKey && returnedTxType === 'ISSUE_BILLING_KEY') {
      autoSavedRef.current = true
      setIssuing(true)
      setErrorMsg(null)
      saveBillingKey(returnedBillingKey, returnedIssueId)
        .catch(e => setErrorMsg(e instanceof Error ? e.message : '저장 실패'))
        .finally(() => setIssuing(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRegister = async () => {
    if (!STORE_ID || !CHANNEL_KEY) {
      setErrorMsg('결제 시스템 설정이 없습니다. 고객센터로 연락해 주세요.')
      return
    }
    setIssuing(true)
    setErrorMsg(null)
    try {
      const issueId = `bbk_billkey_${customer.id.replace(/-/g, '').slice(0, 8)}_${Date.now()}`
      const origin = window.location.origin
      const redirectUrl = `${origin}/portone/billing-register/${customer.id}?t=${token}&issueId=${issueId}`

      const response = await requestIssueBillingKey({
        storeId: STORE_ID,
        channelKey: CHANNEL_KEY,
        billingKeyMethod: BillingKeyMethod.CARD,
        issueId,
        // KG 결제창 제목: 대괄호·따옴표 등 특수문자는 PG 가 거절할 수 있어 제거
        issueName: `${customer.businessName.replace(/[\[\]<>&'"]/g, '').trim()} 정기 자동결제 등록`,
        redirectUrl,
        windowType: { mobile: WindowType.REDIRECTION },
        offerPeriod: { interval: '1m' },
        // displayAmount+currency 는 KG '신규 PC 결제창' 조합 → /pay/card/billing 500. 기본 결제창으로 호출한다.
        customer: {
          customerId: customer.id,
          fullName: customer.ownerName || customer.businessName,
          phoneNumber: customer.phone.replace(/-/g, '') || undefined,
          email: isValidPaymentEmail(customer.email) ? customer.email!.trim() : undefined,
        },
      })

      if (!response) return  // 모바일 리디렉션 중
      if (response.code != null) {
        const isCancel = String(response.code).toUpperCase().includes('CANCEL') || String(response.message ?? '').includes('취소')
        if (isCancel) return
        throw new Error(response.message ?? response.pgMessage ?? '카드 등록에 실패했습니다.')
      }
      await saveBillingKey(response.billingKey, issueId)
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '등록 실패')
    } finally {
      setIssuing(false)
    }
  }

  const kicker = `BBK 공간케어 · ${serviceLabel(customer.customerType)} 자동결제`

  // ═══════════════════════════════════════════════════
  // 등록 완료 화면
  // ═══════════════════════════════════════════════════
  if (completed) {
    return (
      <Shell kicker={kicker} businessName={customer.businessName} subtitle="자동결제 카드 등록" tone="done">
        <Section delay={0}>
          <div className="flex flex-col items-center text-center gap-3 pt-2">
            <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-state-success-bg text-state-success">
              <Check size={26} strokeWidth={2.5} />
            </span>
            <h1 className="text-xl font-semibold text-text-primary leading-snug">카드 등록이 완료되었습니다</h1>
            {cardName && (
              <p className="inline-flex items-center gap-2 text-sm text-text-primary bg-surface-sunken border border-border-subtle px-3 py-1.5 rounded-lg">
                <CreditCard size={14} className="text-text-secondary" /> {cardName}
              </p>
            )}
          </div>
        </Section>
        <Section delay={1}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <Row k="업체" v={customer.businessName} />
            <Row k="서비스" v={serviceLabel(customer.customerType)} />
            <Row k={amountTitle} v={won(customer.amount)} />
            {customer.issuedAt && <Row k="등록일" v={fmtDate(customer.issuedAt)} />}
          </dl>
          <div className="mt-4 rounded-lg border border-sky-100 bg-sky-50 p-4 text-sm text-sky-900 leading-normal break-keep">
            {scheduleText(customer)}
          </div>
        </Section>
        <Section delay={2}>
          <Notes items={[
            { Icon: ShieldCheck, text: '결제가 이루어질 때마다 등록된 연락처로 확인 문자를 보내드립니다.' },
            { Icon: CreditCard, text: `카드 변경·해지는 고객센터(${SUPPORT.phone})로 연락 주시면 바로 처리해 드립니다.` },
          ]} />
        </Section>
      </Shell>
    )
  }

  // ═══════════════════════════════════════════════════
  // 등록 안내 화면
  // ═══════════════════════════════════════════════════
  return (
    <Shell kicker={kicker} businessName={customer.businessName} subtitle="자동결제 카드 등록">
      <Section delay={0} title="결제 안내">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <Row k="서비스" v={serviceLabel(customer.customerType)} />
          <Row k="결제 시점" v={customer.billingTrigger === 'per_visit' ? '시공 건 완료 시' : (customer.paymentDate ? `${cycleLabel(customer.billingCycle)}마다 ${customer.paymentDate}일` : `${cycleLabel(customer.billingCycle)}마다`)} />
        </dl>
        <div className="mt-4 rounded-xl border border-border-subtle bg-surface-sunken px-4 py-3 space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-text-secondary">공급가액</span>
            <span className="font-medium tabular-nums text-text-primary">{won(supply)}</span>
          </div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-text-secondary">{taxable ? '부가세 (10%)' : isCash ? '부가세 (현금 비과세)' : '부가세'}</span>
            <span className="font-medium tabular-nums text-text-primary">{taxable ? won(vat) : '해당 없음'}</span>
          </div>
          <div className="border-t border-border-subtle" />
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-text-primary">{amountTitle}</span>
            <Figure amount={customer.amount} size="lg" />
          </div>
        </div>
        <p className="mt-3 text-sm text-text-secondary leading-normal break-keep">
          카드를 한 번만 등록해 두시면 {scheduleText(customer).replace('등록한 카드로 자동 결제됩니다.', '자동으로 결제됩니다.')} 지금 등록만 하며, 이 화면에서 결제가 일어나지는 않습니다.
        </p>
      </Section>

      <Section delay={1} title="카드 등록">
        {errorMsg && (
          <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-state-danger-bg p-4 flex items-start gap-2">
            <AlertCircle size={16} className="text-state-danger shrink-0 mt-0.5" />
            <p className="text-sm text-state-danger leading-normal break-keep">{errorMsg}</p>
          </div>
        )}
        <Button size="lg" onClick={handleRegister} isLoading={issuing} disabled={issuing} className={`w-full h-12 ${CTA_CLASS}`}>
          {issuing ? '카드 등록창 여는 중...' : '카드 등록하기'}
        </Button>
        <p className="mt-2 text-xs text-text-tertiary text-center leading-normal break-keep">
          포트원(KG이니시스) 보안 창에서 카드번호를 입력합니다. 저희 서버는 카드번호를 받지도, 저장하지도 않습니다.
        </p>
      </Section>

      <Section delay={2} title="안내 사항">
        <Notes items={[
          { Icon: ShieldCheck, text: '카드 정보는 포트원에만 안전하게 보관되며, 저희는 결제 요청만 보냅니다.' },
          { Icon: Clock, text: '결제가 이루어질 때마다 확인 문자를 보내드리고, 실패하면 결제 링크가 담긴 안내를 보내드립니다.' },
          { Icon: Receipt, text: taxable
              ? '카드 결제분은 카드 매출전표로 갈음되며 별도 세금계산서는 발행되지 않습니다.'
              : '현금 결제 건은 부가세가 포함되지 않은 금액입니다.' },
          { Icon: Phone, text: `해지·카드 변경 문의: ${SUPPORT.phone} · ${SUPPORT.hours}` },
        ]} />
      </Section>
    </Shell>
  )
}
