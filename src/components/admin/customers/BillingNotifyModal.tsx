'use client'

/**
 * 결제 안내 SMS 발송 모달 (2026-10-18 Phase I.1)
 *
 * 설계 의도:
 * - 월별 service_billings 1건에 대해 '결제알림' SMS 를 수동 발송.
 * - 발송 전 "텍스트 미리보기" 노출 — 사장님이 뭐 보낼지 확인 후 전송.
 *
 * 실제 발송 파이프라인:
 *   POST /api/admin/notify
 *     application_id = 그 월 마지막 service_application
 *     type = '결제알림'
 *   서버의 notification_templates 테이블 '결제알림' 코드 템플릿 적용.
 *   (미리보기는 간단 조립 — 실제 템플릿과 약간 다를 수 있음을 명시)
 */

import { useEffect, useState } from 'react'
import { X, Send } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  customerId: string
  month: string          // 'YYYY-MM' or 'YYYY'(연간)
  customerName: string
  customerType: string
  onClose: () => void
  onSent?: () => void
}

interface BillingPreview {
  id: string
  billing_type: string | null
  billing_period: string | null
  amount: number | null
  due_date: string | null
  status: string | null
  payment_url: string | null
}

interface AppLite {
  id: string
  construction_date: string | null
}

function monthLabelOf(key: string): string {
  if (/^\d{4}$/.test(key)) return `${key}년`
  const [y, m] = key.split('-')
  return `${y}년 ${parseInt(m, 10)}월`
}

export function BillingNotifyModal({
  customerId, month, customerName, customerType, onClose, onSent,
}: Props) {
  const [billing, setBilling] = useState<BillingPreview | null>(null)
  const [targetAppId, setTargetAppId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sending) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, sending])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const [billingRes, appRes] = await Promise.all([
          fetch(`/api/admin/billings?customer_id=${customerId}`),
          fetch(`/api/admin/applications?customer_id=${customerId}&month=${month}`),
        ])
        const billingData = await billingRes.json() as { billings?: BillingPreview[] }
        const appData = await appRes.json() as { applications?: AppLite[] }
        if (cancelled) return
        const monthBilling = (billingData.billings ?? [])
          .find(b => b.billing_period === month) ?? null
        const monthApps = (appData.applications ?? [])
          .filter(a => a.construction_date?.startsWith(month))
          .sort((a, b) => (b.construction_date ?? '').localeCompare(a.construction_date ?? ''))
        setBilling(monthBilling)
        setTargetAppId(monthApps[0]?.id ?? null)
      } catch {
        if (!cancelled) {
          setBilling(null)
          setTargetAppId(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [customerId, month])

  const label = monthLabelOf(month)

  const previewText = billing ? [
    `[BBK 공간케어] ${customerName}님,`,
    `${label} ${customerType === '정기엔드케어' ? '정기엔드' : '정기딥'} 결제 안내 드립니다.`,
    ``,
    `금액: ${Number(billing.amount ?? 0).toLocaleString('ko-KR')}원`,
    `결제 기한: ${billing.due_date ?? '-'}`,
    billing.payment_url
      ? `결제 링크: ${billing.payment_url}`
      : `※ 결제 링크 아직 생성 안 됨 — 모달에서 자동 생성 후 재발송 추천`,
  ].join('\n') : ''

  const handleSend = async () => {
    if (!billing) {
      toast.error(`${label} 결제 레코드가 없어요`)
      return
    }
    if (!targetAppId) {
      toast.error(`${label} 방문이 없어 SMS 대상 매칭 실패 — 월 작업 먼저 등록해주세요`)
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: targetAppId,
          type: '결제알림',
          method: 'manual',
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? '발송 실패')
      }
      toast.success('결제 안내 SMS 발송됨')
      onSent?.()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '발송 실패')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
      onClick={!sending ? onClose : undefined}
    >
      <div
        className="bg-white rounded-2xl shadow-modal w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-gray-200 bg-slate-50 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-text-primary">📱 결제 안내 SMS</h3>
            <p className="text-xs text-text-secondary mt-0.5">{customerName} · {label}</p>
          </div>
          <button
            onClick={onClose}
            disabled={sending}
            className="p-1 text-text-tertiary hover:text-text-primary rounded-md hover:bg-slate-100 disabled:opacity-30"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        {/* 미리보기 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <label className="block text-[11px] font-semibold text-text-secondary">
            발송될 메시지 미리보기
          </label>
          {loading ? (
            <div className="text-xs text-text-tertiary py-6 text-center">로딩 중...</div>
          ) : billing ? (
            <>
              <pre className="whitespace-pre-wrap text-xs text-text-primary bg-slate-50 p-3 rounded-lg border border-gray-200 font-sans leading-relaxed">
                {previewText}
              </pre>
              <p className="text-[10px] text-text-tertiary leading-relaxed">
                💡 위 미리보기는 간단 조립 버전. 실제 발송 시 서버의 <strong>&apos;결제알림&apos; 템플릿</strong>이
                적용되어 약간 다를 수 있습니다.
                {!billing.payment_url && (
                  <> <br/>⚠️ <strong>결제 링크 비어있음</strong> — 결제 모달에서 &quot;자동 생성&quot; 먼저 추천.</>
                )}
              </p>
            </>
          ) : (
            <div className="px-3 py-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-900">
                ⚠️ {label} 결제 레코드가 없습니다. 결제이력에서 수동 추가하거나 cron 자동 생성을 기다려주세요.
              </p>
            </div>
          )}
        </div>

        {/* 하단 */}
        <div className="px-5 py-3 border-t border-gray-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 text-sm font-medium text-text-secondary border border-gray-200 rounded-lg hover:bg-white disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleSend}
            disabled={sending || loading || !billing || !targetAppId}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={14} />
            {sending ? '발송 중...' : '발송'}
          </button>
        </div>
      </div>
    </div>
  )
}
