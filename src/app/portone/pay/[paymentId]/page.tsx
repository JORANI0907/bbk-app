'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { requestIssueBillingKey } from '@portone/browser-sdk/v2'

type AppInfo = {
  owner_name: string
  business_name: string
  phone: string
  email: string
  deposit: number
  supply_amount: number
  vat: number
  payment_method: string
  virtual_account_number?: string
  virtual_account_bank?: string
  virtual_account_expired_at?: string
  deposit_paid_at?: string
  balance_paid_at?: string
}

type Stage = 'deposit' | 'balance'

function calcBalance(supply: number, vat: number, deposit: number) {
  return (supply + vat) - deposit
}

export default function PortOnePayPage() {
  const params       = useParams()
  const searchParams = useSearchParams()
  const paymentId    = params.paymentId as string
  const stage        = (searchParams.get('stage') ?? 'deposit') as Stage
  const appId        = searchParams.get('appId') ?? ''

  const [app,     setApp]     = useState<AppInfo | null>(null)
  const [status,  setStatus]  = useState<'idle' | 'loading' | 'paying' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  const isCard  = app?.payment_method === '카드(온라인 간편결제)'
  const isVbank = app?.payment_method === '현금(계산서 희망)'
  const amount  = app
    ? stage === 'deposit'
      ? app.deposit
      : calcBalance(app.supply_amount, app.vat, app.deposit)
    : 0

  const alreadyPaid = stage === 'deposit'
    ? Boolean(app?.deposit_paid_at)
    : Boolean(app?.balance_paid_at)

  useEffect(() => {
    if (!appId) { setStatus('error'); setMessage('잘못된 접근입니다.'); return }
    fetch(`/api/portone/pay-info?appId=${appId}`)
      .then(r => r.json())
      .then(d => { setApp(d.app); setStatus('idle') })
      .catch(() => { setStatus('error'); setMessage('결제 정보를 불러오는 중 오류가 발생했습니다.') })
  }, [appId])

  const handleCardPay = useCallback(async () => {
    if (!app) return
    setStatus('paying')
    try {
      const storeId    = process.env.NEXT_PUBLIC_PORTONE_STORE_ID ?? ''
      const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_CARD ?? ''

      // Step 1: 빌링키 발급 (KG이니시스 V2는 requestIssueBillingKey 사용)
      const result = await requestIssueBillingKey({
        storeId,
        channelKey,
        billingKeyMethod: 'CARD',
        issueId: paymentId,
        issueName: `BBK 공간케어 ${stage === 'deposit' ? '예약금' : '잔금'} 카드 등록`,
        customer: {
          fullName: app.owner_name,
          phoneNumber: app.phone.replace(/-/g, ''),
          email: app.email,
        },
      })

      if (!result || 'code' in result) {
        setStatus('error')
        setMessage((result as { message?: string } | undefined)?.message ?? '카드 등록에 실패했습니다.')
        return
      }

      // Step 2: 서버에 빌링키 전달 → 서버가 payWithBillingKey로 실제 청구
      const verifyRes = await fetch('/api/portone/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId,
          applicationId: appId,
          stage,
          billingKey: (result as Record<string,unknown>).billingKey,
        }),
      })
      const verifyData = await verifyRes.json()

      if (!verifyRes.ok || !verifyData.success) {
        setStatus('error')
        setMessage(verifyData.error ?? '결제 검증에 실패했습니다.')
        return
      }

      setStatus('success')
      setMessage('결제가 완료되었습니다. 감사합니다!')
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : '결제 중 오류가 발생했습니다.')
    }
  }, [app, amount, appId, paymentId, stage])

  // ─── 로딩 ────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-white/60 text-sm">결제 정보 불러오는 중...</div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
        <div className="text-center">
          <p className="text-red-400 font-semibold mb-2">오류</p>
          <p className="text-white/60 text-sm">{message}</p>
          <p className="text-white/40 text-xs mt-4">문의: 031-759-4877</p>
        </div>
      </div>
    )
  }

  if (status === 'success' || alreadyPaid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-white font-bold text-lg mb-1">결제 완료</p>
          <p className="text-white/60 text-sm">
            {alreadyPaid ? '이미 결제가 완료된 건입니다.' : message}
          </p>
          <p className="text-white/40 text-xs mt-4">BBK 공간케어 · 031-759-4877</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <p className="text-white/50 text-xs font-mono uppercase tracking-widest mb-2">BBK 공간케어</p>
          <h1 className="text-white font-black text-2xl">
            {stage === 'deposit' ? '예약금 결제' : '잔금 결제'}
          </h1>
          {stage === 'deposit' && isCard && (
            <p className="text-sky-300/70 text-xs mt-1.5">카드 등록 후 잔금은 작업 완료 시 자동 청구됩니다</p>
          )}
        </div>

        {/* 결제 정보 카드 */}
        <div className="rounded-2xl border border-white/15 overflow-hidden mb-5"
          style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(16px)' }}>
          <div className="px-5 py-4 border-b border-white/10">
            <p className="text-white/50 text-xs">결제 정보</p>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-white/50 text-sm">상호명</span>
              <span className="text-white text-sm font-medium">{app?.business_name ?? '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50 text-sm">결제 항목</span>
              <span className="text-white text-sm font-medium">{stage === 'deposit' ? '예약금' : '잔금'}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-white/50 text-sm">결제 금액</span>
              <span className="text-sky-300 text-xl font-black">{amount.toLocaleString('ko-KR')}원</span>
            </div>
          </div>
        </div>

        {/* 가상계좌 안내 */}
        {isVbank && app?.virtual_account_number && (
          <div className="rounded-2xl border border-amber-500/30 px-5 py-4 mb-5"
            style={{ background: 'rgba(245,158,11,0.08)' }}>
            <p className="text-amber-400 font-semibold text-sm mb-3">가상계좌 입금 안내</p>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-white/50 text-sm">은행</span>
                <span className="text-white text-sm font-medium">{app.virtual_account_bank}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50 text-sm">계좌번호</span>
                <span className="text-white text-sm font-bold tracking-wider">{app.virtual_account_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50 text-sm">예금주</span>
                <span className="text-white text-sm font-medium">범빌드코리아</span>
              </div>
              {app.virtual_account_expired_at && (
                <div className="flex justify-between">
                  <span className="text-white/50 text-sm">입금 기한</span>
                  <span className="text-amber-300 text-sm font-medium">
                    {new Date(app.virtual_account_expired_at).toLocaleString('ko-KR', {
                      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
              )}
            </div>
            <p className="text-white/40 text-xs mt-3">* 입금 확인 후 자동으로 처리됩니다.</p>
          </div>
        )}

        {/* 카드 결제 버튼 */}
        {isCard && (
          <button
            onClick={handleCardPay}
            disabled={status === 'paying'}
            className="w-full py-4 rounded-xl font-bold text-white disabled:opacity-60 transition-all active:scale-[0.98]"
            style={{ background: status === 'paying' ? '#93c5fd' : 'linear-gradient(135deg, #2563eb, #4f46e5)' }}
          >
            {status === 'paying' ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                결제 처리 중...
              </span>
            ) : `카드 등록 및 ${amount.toLocaleString('ko-KR')}원 결제`}
          </button>
        )}

        <p className="text-center text-white/30 text-xs mt-5">
          BBK 공간케어 · 031-759-4877
        </p>
      </div>
    </div>
  )
}
