'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function CompleteContent() {
  const searchParams = useSearchParams()
  const paymentId = searchParams.get('paymentId') ?? ''
  const stage     = (searchParams.get('stage') ?? 'deposit') as 'deposit' | 'balance'
  const appId     = searchParams.get('appId') ?? ''
  const custId    = searchParams.get('custId') ?? ''

  const [status,  setStatus]  = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!paymentId) {
      setStatus('error')
      setMessage('결제 정보가 없습니다.')
      return
    }

    fetch('/api/portone/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentId,
        applicationId: appId  || undefined,
        customerId:    custId || undefined,
        stage,
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setStatus('success')
        } else if (data.status === 'READY') {
          setStatus('error')
          setMessage('카드 승인이 완료되지 않았습니다. 결제창에서 카드 인증까지 마치신 뒤 다시 시도해주세요.')
        } else {
          setStatus('error')
          setMessage(data.error ?? '결제 검증에 실패했습니다.')
        }
      })
      .catch(() => {
        setStatus('error')
        setMessage('결제 처리 중 오류가 발생했습니다.')
      })
  }, [paymentId, stage, appId, custId])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(180deg, #FEFCF9 0%, #F5F1EB 100%)' }}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-stone-500 text-sm animate-pulse">결제 확인 중...</p>
        </div>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'linear-gradient(180deg, #F0FDF9 0%, #E6FFFA 100%)' }}>
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg" style={{ background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)' }}>
            <CheckIcon className="w-10 h-10 text-white" />
          </div>
          <p className="text-emerald-900 font-black text-2xl mb-3 tracking-tight">결제가 완료되었어요</p>
          <p className="text-stone-600 text-sm mb-8 leading-relaxed whitespace-pre-line">
            서비스 예약이 안전하게 접수되었습니다.{'\n'}담당자가 확인 후 예약 확정을 안내드릴게요.
          </p>
          <p className="text-stone-400 text-xs">범빌드코리아 · 1522-9597</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'linear-gradient(180deg, #FEFCF9 0%, #F5F1EB 100%)' }}>
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 rounded-2xl bg-rose-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="text-stone-900 font-bold text-lg mb-2">잠시 문제가 발생했어요</p>
        <p className="text-stone-500 text-sm mb-6 leading-relaxed">{message}</p>
        <p className="text-stone-400 text-xs">문의 · 1522-9597</p>
      </div>
    </div>
  )
}

export default function PortOneCompletePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(180deg, #FEFCF9 0%, #F5F1EB 100%)' }}>
        <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    }>
      <CompleteContent />
    </Suspense>
  )
}
