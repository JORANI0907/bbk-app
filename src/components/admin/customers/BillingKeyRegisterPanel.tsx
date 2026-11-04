'use client'

/**
 * 자동결제 카드 등록 링크 패널 (2026-10-18 Phase I.3 → 2026-11-05 접이식·파스텔로 개편)
 *
 * 위치: 고객관리 세부창 결제청구 묶음 맨 아래.
 * 모양: 파스텔 하늘색 버튼 한 줄 → 누르면 설명·링크 생성·복사가 아래로 펼쳐진다.
 *       등록 완료 고객은 민트색 상태 줄 → 누르면 카드·등록일·최근 결제일이 펼쳐진다.
 */

import { useState } from 'react'
import { CreditCard, Copy, Check, AlertCircle, Loader2, RefreshCw, ChevronDown } from 'lucide-react'

interface Props {
  customerId: string
  monthlyAmount: number
  paymentDate: number | null
  billingKeyStatus?: string | null  // 'active' | 'inactive' | null
  billingKeyCardName?: string | null
  billingKeyIssuedAt?: string | null  // ISO
  lastBilledAt?: string | null  // ISO
}

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : null

export function BillingKeyRegisterPanel(props: Props) {
  const [open, setOpen] = useState(false)
  const registered = props.billingKeyStatus === 'active'

  return (
    <div className={`rounded-xl border ${registered ? 'border-emerald-200 bg-emerald-50/60' : 'border-sky-200 bg-sky-50/60'}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
          registered ? 'text-emerald-800 hover:bg-emerald-100/70' : 'text-sky-800 hover:bg-sky-100/70'
        }`}
      >
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${registered ? 'bg-emerald-100 text-emerald-600' : 'bg-sky-100 text-sky-600'}`}>
          {registered ? <Check size={15} /> : <CreditCard size={15} />}
        </span>
        <span className="min-w-0 flex-1 truncate">
          {registered ? '정기결제 등록됨 · 매월 자동결제 중' : '정기결제 카드 등록 링크'}
        </span>
        <ChevronDown size={16} className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3">
          {registered ? <RegisteredBody {...props} /> : <RegisterBody {...props} />}
        </div>
      )}
    </div>
  )
}

function RegisteredBody({ monthlyAmount, paymentDate, billingKeyCardName, billingKeyIssuedAt, lastBilledAt }: Props) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-emerald-800">
      <dt className="text-emerald-600">결제</dt>
      <dd>매월 {paymentDate ?? '지정'}일 · <strong>{monthlyAmount.toLocaleString('ko-KR')}원</strong> 자동 결제</dd>
      {billingKeyCardName && (<><dt className="text-emerald-600">카드</dt><dd>{billingKeyCardName}</dd></>)}
      {billingKeyIssuedAt && (<><dt className="text-emerald-600">등록일</dt><dd>{fmtDate(billingKeyIssuedAt)}</dd></>)}
      {lastBilledAt && (<><dt className="text-emerald-600">최근 결제</dt><dd>{fmtDate(lastBilledAt)}</dd></>)}
      <dd className="col-span-2 pt-1 text-[11px] text-emerald-600 break-keep">해지는 고객센터 요청 시 포트원 콘솔에서 빌링키를 삭제하면 됩니다.</dd>
    </dl>
  )
}

function RegisterBody({ customerId, monthlyAmount, paymentDate }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleGenerate = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/customer/billing-register/issue-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId }),
      })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? '링크 생성 실패')
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
    } catch { /* 클립보드 거부 — 사용자가 직접 복사 */ }
  }

  const pastelBtn = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-100 px-3 py-2 text-xs font-semibold text-sky-800 transition-colors hover:bg-sky-200 disabled:opacity-50'

  return (
    <div className="space-y-2">
      {url ? (
        <>
          <div className="rounded-lg border border-sky-200 bg-white p-2 font-mono text-[11px] text-text-primary break-all">{url}</div>
          <div className="flex gap-2">
            <button type="button" onClick={handleCopy} className={`flex-1 ${pastelBtn} ${copied ? '!bg-emerald-100 !text-emerald-700 !border-emerald-200' : ''}`}>
              {copied ? <><Check size={13} /> 복사됨</> : <><Copy size={13} /> 링크 복사</>}
            </button>
            <button type="button" onClick={handleGenerate} disabled={loading} className={pastelBtn} title="이전 링크는 무효화됩니다">
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} 재생성
            </button>
          </div>
        </>
      ) : (
        <button type="button" onClick={handleGenerate} disabled={loading} className={`w-full ${pastelBtn}`}>
          {loading ? <><Loader2 size={13} className="animate-spin" /> 생성 중…</> : <><CreditCard size={13} /> 카드 등록 링크 만들기</>}
        </button>
      )}

      {errorMsg && (
        <div className="flex items-start gap-1.5 rounded-lg border border-rose-200 bg-rose-50 p-2">
          <AlertCircle size={12} className="mt-0.5 shrink-0 text-rose-600" />
          <p className="text-[11px] leading-relaxed text-rose-700">{errorMsg}</p>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-sky-700 break-keep">
        고객이 링크에서 카드를 한 번 등록하면 매월 {paymentDate ?? '지정'}일에 {monthlyAmount.toLocaleString('ko-KR')}원이 자동 결제됩니다.
        링크를 복사해 톡·문자로 보내 주세요. 재생성하면 이전 링크는 쓸 수 없습니다.
      </p>
    </div>
  )
}
