'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { requestPayment, requestIssueBillingKey } from '@portone/browser-sdk/v2'
import { findProduct, calcTotalAmount, isSubscriptionCode } from '@/lib/kg-audit/products'

export default function KgAuditPayPage() {
  const params       = useParams()
  const searchParams = useSearchParams()
  const paymentId    = params.paymentId as string
  const codesParam   = searchParams.get('codes') ?? ''

  const codes = useMemo(() => codesParam.split(',').filter(Boolean), [codesParam])
  const products = useMemo(() => codes.map(findProduct).filter(Boolean) as ReturnType<typeof findProduct>[], [codes])
  const totalAmount = useMemo(() => calcTotalAmount(codes), [codes])
  const isBilling = codes.length > 0 && isSubscriptionCode(codes[0])

  const [status,  setStatus]  = useState<'idle' | 'paying' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (codes.length === 0) {
      setStatus('error')
      setMessage('선택한 상품이 없습니다. 상품 페이지에서 다시 선택해주세요.')
    }
  }, [codes.length])

  const handlePay = useCallback(async () => {
    if (status === 'paying') return
    setStatus('paying')
    setMessage('')
    try {
      const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID ?? ''

      if (isBilling) {
        // 정기 상품 → 정기결제창(빌링키 발급)
        const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_BILLING ?? ''
        const billingKeyId = `bill_${paymentId}`
        const result = await requestIssueBillingKey({
          storeId,
          channelKey,
          billingKeyMethod: 'CARD',
          issueId:      billingKeyId,
          issueName:    `BBK 공간케어 정기구독 — ${products[0]?.label ?? ''}`,
          customer: {
            fullName:    '테스트 고객',
            phoneNumber: '01099998888',
            email:       'kg-audit@bbkorea.co.kr',
          },
        })
        if (!result || 'code' in result) {
          setStatus('error')
          setMessage((result as { message?: string } | undefined)?.message ?? '카드 등록에 실패했습니다.')
          return
        }
        setStatus('success')
        setMessage('카드 등록이 완료되었습니다. 테스트 환경에서는 실제 자동청구는 발생하지 않습니다.')
      } else {
        // 1회성 상품 → 일반결제창
        const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_CARD ?? ''
        const result = await requestPayment({
          storeId,
          channelKey,
          paymentId,
          orderName: products.length === 1
            ? `BBK 공간케어 · ${products[0]!.label}`
            : `BBK 공간케어 · ${products[0]!.label} 외 ${products.length - 1}건`,
          totalAmount,
          currency:  'KRW',
          payMethod: 'CARD',
          customer: {
            fullName:    '테스트 고객',
            phoneNumber: '01099998888',
            email:       'kg-audit@bbkorea.co.kr',
          },
        })
        if (!result || 'code' in result) {
          setStatus('error')
          setMessage((result as { message?: string } | undefined)?.message ?? '결제에 실패했습니다.')
          return
        }
        setStatus('success')
        setMessage('결제가 완료되었습니다. 테스트 환경에서는 실제 승인은 발생하지 않습니다.')
      }
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : '결제 처리 중 오류가 발생했습니다.')
    }
  }, [isBilling, paymentId, products, status, totalAmount])

  if (codes.length === 0) {
    return (
      <div className="bg-state-danger-bg border border-state-danger/30 rounded-2xl p-6 text-center">
        <p className="text-sm font-semibold text-state-danger">{message || '잘못된 접근입니다.'}</p>
        <a href="/kg-audit" className="inline-block mt-3 text-xs text-brand-600 underline">홈으로 돌아가기</a>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div>
        <p className="text-xs text-text-tertiary uppercase tracking-wider">
          {isBilling ? '정기 구독 · 카드 등록' : '1회성 서비스 · 결제'}
        </p>
        <h2 className="text-xl font-bold text-text-primary mt-1">결제 진행</h2>
      </div>

      {/* 선택 항목 요약 */}
      <section className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle">
          <p className="text-xs font-semibold text-text-secondary">선택 항목 ({products.length}건)</p>
        </div>
        <div className="divide-y divide-border-subtle max-h-72 overflow-y-auto">
          {products.map((p) => (
            <div key={p!.code} className="flex items-center justify-between px-5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text-primary truncate">{p!.label}</p>
                <p className="text-[11px] text-text-tertiary">{p!.category} · {p!.unit}</p>
              </div>
              <p className="text-sm font-semibold text-text-primary ml-2">{p!.price.toLocaleString('ko-KR')}원</p>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 bg-surface-sunken flex items-baseline justify-between">
          <p className="text-sm font-medium text-text-secondary">{isBilling ? '월 결제 금액' : '총 결제 금액'}</p>
          <p className="text-xl font-black text-brand-600">
            {totalAmount.toLocaleString('ko-KR')}<span className="text-xs font-medium">원</span>
          </p>
        </div>
      </section>

      {/* 상태 안내 */}
      {status === 'success' && (
        <div className="rounded-xl bg-state-success-bg border border-state-success/30 px-4 py-3 text-sm text-state-success">
          ✓ {message}
        </div>
      )}
      {status === 'error' && (
        <div className="rounded-xl bg-state-danger-bg border border-state-danger/30 px-4 py-3 text-sm text-state-danger">
          {message}
        </div>
      )}

      {/* 결제 버튼 */}
      {status !== 'success' && (
        <button
          onClick={handlePay}
          disabled={status === 'paying'}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-3.5 rounded-lg transition-colors"
        >
          {status === 'paying'
            ? '결제창 진입 중...'
            : isBilling
              ? '카드 등록하고 구독 시작'
              : `${totalAmount.toLocaleString('ko-KR')}원 결제하기`}
        </button>
      )}

      <p className="text-[11px] text-text-tertiary text-center leading-relaxed">
        결제 대행: 포트원(주) · PG사: KG이니시스
      </p>
    </div>
  )
}
