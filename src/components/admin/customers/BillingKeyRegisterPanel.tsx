'use client'

/**
 * 빌링키 등록 링크 패널 (2026-10-18 Phase I.3)
 *
 * 역할:
 *   사장님이 고객관리 → 정기엔드케어 섹션에서
 *   "매월 자동결제 카드 등록 링크"를 생성·복사할 수 있는 미니 패널.
 *
 * MVP 범위:
 *   - "링크 생성" 버튼 → POST /api/customer/billing-register/issue-link
 *   - 생성된 URL 표시 + "복사" 버튼 (사장님이 톡/SMS 수동 전송)
 *   - 상태 뱃지·해지·재등록 등은 테스트 후 Phase I.4 이상으로 확장.
 */

import { useState } from 'react'
import { CreditCard, Copy, Check, AlertCircle, Loader2, RefreshCw } from 'lucide-react'

interface Props {
  customerId: string
  monthlyAmount: number
  paymentDate: number | null
  // 2026-10-19 Phase E: 빌링키 등록 완료 상태 표시
  billingKeyStatus?: string | null  // 'active' | 'inactive' | null
  billingKeyCardName?: string | null
  billingKeyIssuedAt?: string | null  // ISO
  lastBilledAt?: string | null  // ISO
}

export function BillingKeyRegisterPanel({
  customerId,
  monthlyAmount,
  paymentDate,
  billingKeyStatus,
  billingKeyCardName,
  billingKeyIssuedAt,
  lastBilledAt,
}: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // 2026-10-19 Phase E: 빌링키 활성 상태면 "등록 완료" 뱃지만 표시
  const isRegistered = billingKeyStatus === 'active'
  if (isRegistered) {
    const fmtDate = (iso: string | null | undefined) =>
      iso ? new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : null
    return (
      <div className="rounded-lg bg-emerald-50 border border-emerald-300 p-3 space-y-1.5">
        <p className="text-sm font-bold text-emerald-800 flex items-center gap-1.5">
          <Check size={14} /> 빌링키 등록 완료 — 매월 자동결제 활성
        </p>
        <p className="text-[11px] text-emerald-700 leading-relaxed">
          이 고객은 매월 {paymentDate ?? '지정'}일에{' '}
          <strong>{monthlyAmount.toLocaleString('ko-KR')}원</strong>이 자동으로 결제됩니다.
        </p>
        {billingKeyCardName && (
          <p className="text-[11px] text-emerald-700">💳 카드: <strong>{billingKeyCardName}</strong></p>
        )}
        {billingKeyIssuedAt && (
          <p className="text-[11px] text-emerald-600">등록일: {fmtDate(billingKeyIssuedAt)}</p>
        )}
        {lastBilledAt && (
          <p className="text-[11px] text-emerald-600">최근 자동결제: {fmtDate(lastBilledAt)}</p>
        )}
      </div>
    )
  }

  const handleGenerate = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/customer/billing-register/issue-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId }),
      })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? '링크 생성 실패')
      }
      setUrl(data.url)
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '링크 생성 실패')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* 무시 */ }
  }

  return (
    <div className="rounded-lg bg-sky-50 border border-sky-200 p-3 space-y-2.5">
      <p className="text-xs font-bold text-sky-800 flex items-center gap-1.5">
        <CreditCard size={12} /> 매월 자동결제 카드 등록 (빌링키)
      </p>

      <p className="text-[11px] text-sky-700 leading-relaxed">
        고객이 <strong>1번만</strong> 카드 등록하면 매월 {paymentDate ?? '지정'}일에 {' '}
        <strong>{monthlyAmount.toLocaleString('ko-KR')}원</strong>이 자동 결제됩니다.
        아래 "링크 생성" 버튼을 눌러 URL을 복사해 톡·SMS로 전송하세요.
      </p>

      {errorMsg && (
        <div className="rounded bg-rose-50 border border-rose-200 p-2 flex items-start gap-1.5">
          <AlertCircle size={12} className="text-rose-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-rose-700 leading-relaxed">{errorMsg}</p>
        </div>
      )}

      {url ? (
        <div className="space-y-1.5">
          <div className="rounded bg-white border border-sky-200 p-2 text-[11px] text-text-primary font-mono break-all">
            {url}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className={`flex-1 inline-flex items-center justify-center gap-1 text-xs px-3 py-1.5 rounded-md border font-semibold transition-colors ${
                copied
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                  : 'bg-white text-text-primary border-sky-300 hover:bg-sky-50'
              }`}
            >
              {copied ? <><Check size={12} /> 복사됨</> : <><Copy size={12} /> URL 복사</>}
            </button>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-sky-300 bg-white text-text-primary hover:bg-sky-50 disabled:opacity-50"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              재생성
            </button>
          </div>
          <p className="text-[10px] text-sky-600 pt-0.5">
            💡 재생성 시 이전 URL은 자동 무효화됩니다 (토큰 1회성)
          </p>
        </div>
      ) : (
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50"
        >
          {loading ? <><Loader2 size={12} className="animate-spin" /> 생성 중...</> : <><CreditCard size={12} /> 카드 등록 링크 생성</>}
        </button>
      )}
    </div>
  )
}
