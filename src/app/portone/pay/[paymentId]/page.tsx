'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { requestPayment } from '@portone/browser-sdk/v2'
import { KbEscrowBadge } from '@/components/KbEscrowBadge'

type AppInfo = {
  owner_name: string
  business_name: string
  phone: string
  email: string
  service_type?: string | null
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
  const custId       = searchParams.get('custId') ?? ''

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
    if (!appId && !custId) { setStatus('error'); setMessage('잘못된 접근입니다.'); return }
    const q = custId ? `custId=${custId}` : `appId=${appId}`
    fetch(`/api/portone/pay-info?${q}`)
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

      // Step 1: 완결형 원큐 결제 요청 (예약금·잔금 각각 독립된 카드 승인)
      // KG이니시스 심사 정책: 두 결제는 서로 참조 관계 없는 독립 승인.
      // KG이니시스는 customer.email 필수. 신청서에 이메일이 없으면 유효 형식 폴백 사용.
      const emailToUse = (app.email && app.email.trim())
        || `noemail-${appId.replace(/-/g, '').slice(0, 8)}@bbkorea.co.kr`

      const result = await requestPayment({
        storeId,
        channelKey,
        paymentId,
        orderName: `BBK 공간케어 청소서비스 — ${app.business_name}`,
        totalAmount: amount,
        currency: 'KRW',
        payMethod: 'CARD',
        customer: {
          fullName: app.owner_name,
          phoneNumber: app.phone.replace(/-/g, ''),
          email: emailToUse,
        },
      })

      if (!result || 'code' in result) {
        setStatus('error')
        setMessage((result as { message?: string } | undefined)?.message ?? '결제에 실패했습니다.')
        return
      }

      // Step 2: 서버에서 결제 상태 검증 (paymentId만 전달, 금액 위변조 방지)
      // customer-mode(custId) 결제 링크의 경우 customerId 로 후처리 필요.
      const verifyRes = await fetch('/api/portone/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId,
          applicationId: appId || undefined,
          customerId:    custId || undefined,
          stage,
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
            {app?.service_type ? `${app.service_type} 결제` : '서비스 결제'}
          </h1>
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
              <span className="text-white/50 text-sm">서비스</span>
              <span className="text-white text-sm font-medium">{app?.service_type ?? '청소 서비스'}</span>
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
            ) : `${amount.toLocaleString('ko-KR')}원 결제하기`}
          </button>
        )}

        {/* CS 안내 */}
        <div className="mt-6 rounded-2xl border border-white/10 px-4 py-3 text-center"
          style={{ background: 'rgba(255,255,255,0.04)' }}>
          <p className="text-white/60 text-xs font-semibold mb-1">고객센터</p>
          <p className="text-white/50 text-[11px]">
            평일·토요일 09:00 - 18:00 (일요일·공휴일 휴무)
          </p>
          <p className="text-white/60 text-xs mt-1.5">
            📞 <a href="tel:031-759-4877" className="text-sky-300 hover:text-sky-200">031-759-4877</a>
            {' · '}
            ✉ <a href="mailto:sunrise@bbkorea.co.kr" className="text-sky-300 hover:text-sky-200">sunrise@bbkorea.co.kr</a>
          </p>
          <p className="text-white/40 text-[10px] mt-2">
            결제 취소·환불은 결제 완료 후 고객센터로 문의해주세요.
          </p>
        </div>

        {/* 사업자 정보 */}
        <div className="mt-3 text-center text-white/30 text-[10px] leading-relaxed">
          <p className="font-semibold text-white/40 mb-0.5">범빌드코리아 (BBK 공간케어)</p>
          <p>대표: 조동환 · 사업자등록번호: 398-81-04260</p>
          <p>경기도 성남시 중원구 둔촌대로268번길 22, 1동 2층 201호</p>
          <p>통신판매업 신고번호: 제 2025-경기성남중원-XXXX호 (신고 진행 중)</p>
          <p className="mt-1.5">
            <a href="/terms" className="text-white/40 hover:text-white/60 underline mx-1.5">이용약관</a>
            <a href="/privacy" className="text-white/40 hover:text-white/60 underline mx-1.5">개인정보처리방침</a>
            <a href="/refund" className="text-white/40 hover:text-white/60 underline mx-1.5">환불규정</a>
          </p>
          <p className="mt-2 text-white/25">결제 대행: 포트원(주) · KG이니시스</p>
          <div className="mt-3 flex justify-center">
            <KbEscrowBadge theme="dark" />
          </div>
        </div>
      </div>
    </div>
  )
}
