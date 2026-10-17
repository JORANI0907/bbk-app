'use client'

/**
 * 빌링키 등록 클라이언트 컴포넌트 (2026-10-18 Phase I.2)
 *
 * 역할:
 *   PortOne browser-sdk `requestIssueBillingKey` 호출 → 카드 등록 UI
 *   발급된 billingKey 를 BBK 서버 API `/api/portone/billing-key-save` 로 전달 → customers 테이블 저장
 *
 * UI 3단계:
 *   1. 안내 화면 (매월 자동결제 약관 + "카드 등록하기" 버튼)
 *   2. (PortOne UI 가 자체 모달로 뜸)
 *   3. 등록 완료 화면 (카드 표시명 + 매월 결제일 안내)
 */

import { useState, useEffect, useRef } from 'react'
import { requestIssueBillingKey, Entity } from '@portone/browser-sdk/v2'
import { Check, CreditCard, AlertCircle, Loader2, ShieldCheck } from 'lucide-react'

const { BillingKeyMethod, WindowType } = Entity

interface CustomerData {
  id: string
  businessName: string
  ownerName: string
  phone: string
  email: string | null
  monthlyAmount: number
  paymentDate: number | null
}

interface Props {
  customer: CustomerData
  isAlreadyActive: boolean
  token: string
}

const STORE_ID = process.env.NEXT_PUBLIC_PORTONE_STORE_ID ?? ''
const CHANNEL_KEY = process.env.NEXT_PUBLIC_PORTONE_BILLING_CHANNEL_KEY ?? ''

export function BillingRegisterClient({ customer, isAlreadyActive, token }: Props) {
  const [issuing, setIssuing] = useState(false)
  const [completed, setCompleted] = useState(isAlreadyActive)
  const [cardName, setCardName] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const autoSavedRef = useRef(false)  // StrictMode / 중복 호출 방지

  // 서버에 billingKey 저장 공통 로직
  const saveBillingKey = async (billingKey: string, issueId: string) => {
    const saveRes = await fetch('/api/portone/billing-key-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: customer.id, billingKey, issueId }),
    })
    if (!saveRes.ok) {
      const errData = await saveRes.json().catch(() => ({}))
      throw new Error(errData?.error ?? '빌링키 저장 실패 (서버 오류)')
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
      // 실패 리디렉션
      autoSavedRef.current = true
      setErrorMsg(decodeURIComponent(returnedMsg ?? '빌링키 발급 실패'))
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
      setErrorMsg('결제 시스템 환경변수가 설정되지 않았습니다. 관리자에게 연락해주세요.')
      return
    }
    setIssuing(true)
    setErrorMsg(null)
    try {
      const issueId = `bbk_billkey_${customer.id.replace(/-/g, '').slice(0, 8)}_${Date.now()}`
      // 모바일 리디렉션 복귀 URL (현재 페이지 + token 유지 + issueId 포함)
      const origin = window.location.origin
      const redirectUrl = `${origin}/portone/billing-register/${customer.id}?t=${token}&issueId=${issueId}`

      const response = await requestIssueBillingKey({
        storeId: STORE_ID,
        channelKey: CHANNEL_KEY,
        billingKeyMethod: BillingKeyMethod.CARD,
        issueId,
        issueName: `${customer.businessName} 매월 자동결제 등록`,
        redirectUrl,
        windowType: {
          pc: WindowType.POPUP,
          mobile: WindowType.REDIRECTION,  // 모바일은 반드시 리디렉션 (INIStdPay/Dev Error 방지)
        },
        customer: {
          customerId: customer.id,
          fullName: customer.ownerName || customer.businessName,
          phoneNumber: customer.phone.replace(/-/g, '') || undefined,
          email: customer.email || undefined,
        },
      })

      // 모바일 리디렉션 방식에서는 response 가 undefined — 페이지가 PortOne 쪽으로 이동 중
      // (useEffect 가 돌아왔을 때 쿼리로 처리)
      if (!response) return

      if (response.code != null) {
        throw new Error(response.message ?? response.pgMessage ?? '빌링키 발급 실패')
      }

      await saveBillingKey(response.billingKey, issueId)
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '등록 실패')
    } finally {
      setIssuing(false)
    }
  }

  // ─── 등록 완료 화면 ─────────────────────────────────
  if (completed) {
    return (
      <Shell>
        <div className="text-center space-y-4 py-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 text-emerald-700">
            <Check size={32} />
          </div>
          <h1 className="text-xl font-bold text-text-primary">카드 등록이 완료되었습니다</h1>
          <p className="text-sm text-text-secondary">
            {customer.businessName}
          </p>
          {cardName && (
            <p className="inline-flex items-center gap-1.5 text-xs text-text-primary bg-slate-100 px-3 py-1.5 rounded-lg">
              <CreditCard size={12} /> {cardName}
            </p>
          )}
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-left">
            <p className="text-xs text-emerald-800 leading-relaxed">
              ✅ <strong>매월 {customer.paymentDate ?? '지정'}일</strong> 자동 결제됩니다<br/>
              💳 결제 금액: <strong>{customer.monthlyAmount.toLocaleString('ko-KR')}원</strong><br/>
              📧 결제 결과는 등록된 연락처로 안내됩니다
            </p>
          </div>
          <p className="text-[10px] text-text-tertiary pt-2">
            카드 변경이 필요하시면 BBK 범빌드코리아에 연락해주세요
          </p>
        </div>
      </Shell>
    )
  }

  // ─── 안내 + 등록 요청 화면 ───────────────────────────
  return (
    <Shell>
      <div className="space-y-5 py-2">
        {/* 소개 */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-100 text-brand-700">
            <CreditCard size={28} />
          </div>
          <h1 className="text-lg font-bold text-text-primary">매월 자동결제 카드 등록</h1>
          <p className="text-xs text-text-secondary">
            {customer.businessName}
          </p>
        </div>

        {/* 요약 */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-emerald-700">
            <span>월 결제 금액</span>
            <span className="text-base font-bold text-text-primary">
              {customer.monthlyAmount.toLocaleString('ko-KR')}원
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-emerald-700 pt-2 border-t border-emerald-200">
            <span>결제일</span>
            <span className="font-semibold">
              매월 {customer.paymentDate ?? '-'}일
            </span>
          </div>
        </div>

        {/* 안내 사항 */}
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-brand-600" />
            카드 등록 안내
          </p>
          <ul className="text-[11px] text-text-secondary space-y-1 leading-relaxed pl-5 list-disc">
            <li>지금 등록한 카드로 <strong>매월 자동 결제</strong>됩니다</li>
            <li>카드 정보는 <strong>포트원(PortOne)에만 안전하게 보관</strong>되며, BBK는 카드번호를 받지 않습니다</li>
            <li>해지·카드 변경은 언제든 BBK에 연락해 요청 가능합니다</li>
            <li>결제 실패 시 <strong>즉시 안내 SMS</strong>가 발송됩니다</li>
          </ul>
        </div>

        {/* 에러 */}
        {errorMsg && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 flex items-start gap-2">
            <AlertCircle size={14} className="text-rose-600 shrink-0 mt-0.5" />
            <p className="text-xs text-rose-700 leading-relaxed">{errorMsg}</p>
          </div>
        )}

        {/* 등록 버튼 */}
        <button
          onClick={handleRegister}
          disabled={issuing}
          className="w-full py-3.5 text-sm font-bold bg-brand-600 hover:bg-brand-700 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
        >
          {issuing
            ? <><Loader2 size={16} className="animate-spin" /> 카드 등록 창 여는 중...</>
            : <><CreditCard size={16} /> 카드 등록하기</>}
        </button>

        <p className="text-[10px] text-text-tertiary text-center leading-relaxed">
          등록 후 PortOne 공식 UI 를 통해 카드번호를 입력합니다<br/>
          BBK 서버는 카드번호를 받지도, 저장하지도 않습니다
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
          <h2 className="text-base font-bold text-brand-700 mt-0.5">정기엔드케어 자동결제</h2>
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
