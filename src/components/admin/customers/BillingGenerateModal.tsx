'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

/**
 * 결제청구 수동 생성 모달 (2026-10-19 Phase B)
 *
 * 사장님이 고객 모달의 [결제청구 생성] 또는 [수정반영] 버튼을 누르면 열림.
 *   1) preview API 로 생성될 리스트 조회 (DB 변경 없음)
 *   2) 사장님이 체크박스로 생성 대상 선택
 *   3) [확인하고 생성] 누르면 generate API 호출 → service_billings INSERT + payment_url 동시 발급
 *
 * mode:
 *   'create' = 신규 생성 (이미 있는 period 는 자동 skip)
 *   'regenerate' = 수정반영 (선택된 period 의 pending 레코드 먼저 삭제 후 재생성, paid 는 절대 유지)
 */

export type BillingGenerateMode = 'create' | 'regenerate'

interface ScheduleItem {
  billing_type: string
  billing_period: string
  due_date: string
  amount: number
  service_type: string | null
  billing_timing: 'prepaid' | 'postpaid'
  existing_status: string | null
  existing_due_date: string | null
}

interface PreviewResponse {
  schedule: ScheduleItem[]
  customer_name?: string
  customer_type?: string | null
  billing_cycle?: string | null
  billing_timing?: 'prepaid' | 'postpaid'
  message?: string
  error?: string
}

interface Props {
  customerId: string
  customerName: string
  mode: BillingGenerateMode
  onClose: () => void
  onSuccess?: (inserted: number) => void
}

export default function BillingGenerateModal({ customerId, customerName, mode, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [schedule, setSchedule] = useState<ScheduleItem[]>([])
  const [checkedPeriods, setCheckedPeriods] = useState<Set<string>>(new Set())
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ billing_cycle?: string | null; billing_timing?: string }>({})

  useEffect(() => {
    let aborted = false
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/customers/${customerId}/billings/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        const data = await res.json() as PreviewResponse
        if (aborted) return
        if (!res.ok || data.error) {
          setErrorMsg(data.error ?? data.message ?? '미리보기 실패')
          setLoading(false)
          return
        }
        setSchedule(data.schedule)
        setMeta({ billing_cycle: data.billing_cycle, billing_timing: data.billing_timing })
        // 기본 체크 전략:
        //   create 모드: 아직 없는(신규) 항목만 기본 체크
        //   regenerate 모드: pending 또는 신규 전부 체크 (paid 는 제외)
        const initChecked = new Set<string>()
        for (const item of data.schedule) {
          if (mode === 'create') {
            if (!item.existing_status) initChecked.add(item.billing_period)
          } else {
            if (item.existing_status !== 'paid') initChecked.add(item.billing_period)
          }
        }
        setCheckedPeriods(initChecked)
        setLoading(false)
      } catch (e) {
        if (aborted) return
        setErrorMsg(e instanceof Error ? e.message : '미리보기 요청 실패')
        setLoading(false)
      }
    })()
    return () => { aborted = true }
  }, [customerId, mode])

  const toggle = (period: string) => {
    setCheckedPeriods(prev => {
      const next = new Set(prev)
      if (next.has(period)) next.delete(period)
      else next.add(period)
      return next
    })
  }

  const toggleAll = () => {
    const selectable = schedule.filter(s => s.existing_status !== 'paid').map(s => s.billing_period)
    const allChecked = selectable.every(p => checkedPeriods.has(p))
    if (allChecked) setCheckedPeriods(new Set())
    else setCheckedPeriods(new Set(selectable))
  }

  const handleSubmit = async () => {
    if (checkedPeriods.size === 0) {
      toast.error('생성할 항목을 하나 이상 선택해주세요.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/billings/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periods: Array.from(checkedPeriods),
          regenerate: mode === 'regenerate',
        }),
      })
      const data = await res.json() as {
        inserted?: number; skipped?: number; generated_links?: number; error?: string
      }
      if (!res.ok || data.error) {
        toast.error(data.error ?? '생성 실패')
        setSaving(false)
        return
      }
      toast.success(
        `${data.inserted}건 생성 완료 (링크 ${data.generated_links ?? 0}건 발급` +
        (data.skipped ? `, 이미 존재 ${data.skipped}건 skip` : '') +
        `)`
      )
      onSuccess?.(data.inserted ?? 0)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '요청 실패')
      setSaving(false)
    }
  }

  const checkedCount = checkedPeriods.size
  const totalAmount = schedule
    .filter(s => checkedPeriods.has(s.billing_period))
    .reduce((sum, s) => sum + (s.amount || 0), 0)

  return (
    <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-pop w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-text-primary">
                {mode === 'create' ? '💰 결제청구 생성' : '🔄 결제청구 수정반영'}
              </h3>
              <p className="text-xs text-text-secondary mt-0.5 break-keep">
                {customerName}
                {meta.billing_cycle && <> · {meta.billing_cycle}</>}
                {meta.billing_timing && <> · {meta.billing_timing === 'prepaid' ? '선납' : '후납'}</>}
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-text-tertiary hover:text-text-primary text-xl leading-none px-2">×</button>
          </div>
          {mode === 'regenerate' && (
            <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              ⚠️ 수정반영은 선택된 기간의 <b>pending(미결제)</b> 레코드를 먼저 삭제한 뒤 다시 생성합니다. 결제완료(paid)된 이력은 절대 삭제되지 않습니다.
            </p>
          )}
        </div>

        {/* 바디 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="text-center py-10 text-sm text-text-secondary">미리보기 불러오는 중…</div>
          ) : errorMsg ? (
            <div className="rounded-lg border border-state-danger-border bg-state-danger-bg text-state-danger text-sm p-4">
              {errorMsg}
            </div>
          ) : schedule.length === 0 ? (
            <div className="text-center py-10 text-sm text-text-tertiary break-keep">
              생성될 결제청구가 없습니다. 결제주기 · 결제방식 · 계약기간 · 총액을 확인해주세요.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <button type="button" onClick={toggleAll} className="text-xs text-brand-600 hover:underline">
                  전체 선택/해제
                </button>
                <span className="text-xs text-text-secondary">{checkedCount}/{schedule.length} 선택</span>
              </div>
              {schedule.map((item) => {
                const isPaid = item.existing_status === 'paid'
                const isPending = item.existing_status === 'pending'
                const isChecked = checkedPeriods.has(item.billing_period)
                return (
                  <label
                    key={item.billing_period}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                      isPaid
                        ? 'border-border-subtle bg-surface-sunken opacity-60 cursor-not-allowed'
                        : isChecked
                        ? 'border-brand-400 bg-brand-50 cursor-pointer'
                        : 'border-border bg-white hover:bg-surface-sunken cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={isPaid}
                      checked={isChecked}
                      onChange={() => toggle(item.billing_period)}
                      className="w-4 h-4 accent-brand-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-text-primary">
                          {item.billing_period}
                        </span>
                        <span className="text-xs text-text-secondary">
                          결제예정: {item.due_date}
                        </span>
                        {isPaid && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 rounded px-1.5 py-0.5">
                            ✓ 결제완료
                          </span>
                        )}
                        {isPending && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
                            이미 생성됨
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-text-primary tabular-nums">
                      {item.amount.toLocaleString('ko-KR')}원
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="px-5 py-3 border-t border-border-subtle flex items-center justify-between gap-3 bg-surface-sunken rounded-b-2xl">
          <div className="text-xs text-text-secondary">
            선택 합계: <span className="font-bold text-text-primary tabular-nums">{totalAmount.toLocaleString('ko-KR')}원</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || loading || schedule.length === 0 || checkedCount === 0}
              className="px-4 py-1.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? '생성 중…' : mode === 'create' ? '확인하고 생성' : '확인하고 수정반영'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
