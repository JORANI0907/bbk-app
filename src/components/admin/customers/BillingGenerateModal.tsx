'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'

/**
 * 결제청구 수동 생성 모달 (2026-10-19 Phase D 2단계 플로우)
 *
 * Step 1 (range): 사장님이 생성 범위 설정 (시작월 ~ 종료월)
 * Step 2 (preview): 그 범위의 생성 대상 미리보기 → 체크 → 확인하고 생성
 *   - preview API 는 DB 변경 없음
 *   - generate API 가 체크된 period 만 INSERT + payment_url 동시 발급
 *
 * mode:
 *   'create' = 신규 생성 (이미 있는 period 는 자동 skip)
 *   'regenerate' = 수정반영 (선택된 period 의 pending 레코드 먼저 삭제 후 재생성, paid 는 보존)
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
  total_available?: number
  customer_name?: string
  customer_type?: string | null
  billing_cycle?: string | null
  billing_timing?: 'prepaid' | 'postpaid'
  contract_start_date?: string | null
  contract_end_date?: string | null
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

function todayMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function BillingGenerateModal({ customerId, customerName, mode, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<'range' | 'preview'>('range')
  const [fromPeriod, setFromPeriod] = useState<string>(todayMonth())
  const [toPeriod, setToPeriod] = useState<string>(addMonths(todayMonth(), 12))

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [schedule, setSchedule] = useState<ScheduleItem[]>([])
  const [totalAvailable, setTotalAvailable] = useState<number>(0)
  const [checkedPeriods, setCheckedPeriods] = useState<Set<string>>(new Set())
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ billing_cycle?: string | null; billing_timing?: string; contract_end_date?: string | null }>({})

  const handleLoadPreview = async () => {
    if (fromPeriod > toPeriod) {
      toast.error('시작 월이 종료 월보다 늦습니다.')
      return
    }
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/billings/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromPeriod, toPeriod }),
      })
      const data = await res.json() as PreviewResponse
      if (!res.ok || data.error) {
        setErrorMsg(data.error ?? data.message ?? '미리보기 실패')
        setLoading(false)
        return
      }
      setSchedule(data.schedule)
      setTotalAvailable(data.total_available ?? data.schedule.length)
      setMeta({
        billing_cycle: data.billing_cycle,
        billing_timing: data.billing_timing,
        contract_end_date: data.contract_end_date,
      })
      // 기본 체크: create 는 신규만, regenerate 는 pending+신규 (paid 는 제외)
      const initChecked = new Set<string>()
      for (const item of data.schedule) {
        if (mode === 'create') {
          if (!item.existing_status) initChecked.add(item.billing_period)
        } else {
          if (item.existing_status !== 'paid') initChecked.add(item.billing_period)
        }
      }
      setCheckedPeriods(initChecked)
      setStep('preview')
      setLoading(false)
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '미리보기 요청 실패')
      setLoading(false)
    }
  }

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
          // 2026-10-19 긴급: generate 가 preview 와 동일 generator 범위를 쓰도록
          fromPeriod,
          toPeriod,
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
                <span className="ml-2 text-xs text-text-tertiary font-normal">
                  · {step === 'range' ? '1단계: 기간 설정' : '2단계: 미리보기 · 선택'}
                </span>
              </h3>
              <p className="text-xs text-text-secondary mt-0.5 break-keep">
                {customerName}
                {meta.billing_cycle && <> · {meta.billing_cycle}</>}
                {meta.billing_timing && <> · {meta.billing_timing === 'prepaid' ? '선납' : '후납'}</>}
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-text-tertiary hover:text-text-primary text-xl leading-none px-2">×</button>
          </div>
          {mode === 'regenerate' && step === 'preview' && (
            <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              ⚠️ 수정반영은 선택된 기간의 <b>pending(미결제)</b> 레코드를 먼저 삭제한 뒤 다시 생성합니다. 결제완료(paid)된 이력은 절대 삭제되지 않습니다.
            </p>
          )}
        </div>

        {/* 바디 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Step 1: 기간 설정 */}
          {step === 'range' && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-text-primary mb-2">생성할 결제청구의 기간을 지정하세요.</p>
                <p className="text-xs text-text-secondary break-keep leading-relaxed">
                  시작 월부터 종료 월까지 범위에 해당하는 결제청구가 미리보기로 나타납니다. 이후 체크박스로 세부 선택이 가능합니다.
                </p>
              </div>

              <div className="rounded-lg bg-sky-50 border border-sky-200 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-sky-800 w-16 shrink-0">시작 월</span>
                  <input
                    type="month"
                    value={fromPeriod}
                    onChange={e => setFromPeriod(e.target.value)}
                    className="flex-1 border border-sky-300 rounded-md px-3 py-2 text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-sky-800 w-16 shrink-0">종료 월</span>
                  <input
                    type="month"
                    value={toPeriod}
                    onChange={e => setToPeriod(e.target.value)}
                    className="flex-1 border border-sky-300 rounded-md px-3 py-2 text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setFromPeriod(todayMonth()); setToPeriod(addMonths(todayMonth(), 3)) }}
                    className="text-[11px] text-sky-700 hover:underline"
                  >
                    + 3개월
                  </button>
                  <span className="text-text-tertiary text-[11px]">·</span>
                  <button
                    type="button"
                    onClick={() => { setFromPeriod(todayMonth()); setToPeriod(addMonths(todayMonth(), 6)) }}
                    className="text-[11px] text-sky-700 hover:underline"
                  >
                    + 6개월
                  </button>
                  <span className="text-text-tertiary text-[11px]">·</span>
                  <button
                    type="button"
                    onClick={() => { setFromPeriod(todayMonth()); setToPeriod(addMonths(todayMonth(), 12)) }}
                    className="text-[11px] text-sky-700 hover:underline"
                  >
                    + 12개월
                  </button>
                </div>
              </div>

              {errorMsg && (
                <div className="rounded-lg border border-state-danger-border bg-state-danger-bg text-state-danger text-sm p-3">
                  {errorMsg}
                </div>
              )}
            </div>
          )}

          {/* Step 2: 미리보기 리스트 */}
          {step === 'preview' && (
            <>
              {loading ? (
                <div className="text-center py-10 text-sm text-text-secondary">미리보기 불러오는 중…</div>
              ) : errorMsg ? (
                <div className="rounded-lg border border-state-danger-border bg-state-danger-bg text-state-danger text-sm p-4">
                  {errorMsg}
                </div>
              ) : schedule.length === 0 ? (
                <div className="text-center py-10 text-sm text-text-tertiary break-keep">
                  {fromPeriod} ~ {toPeriod} 범위에 생성될 결제청구가 없습니다.
                  <br />위 [← 범위 다시 설정] 버튼으로 기간을 조정해보세요.
                  {totalAvailable > 0 && (
                    <p className="mt-2 text-[11px] text-sky-700">
                      전체 계약기간 기준으로는 {totalAvailable}건의 결제청구가 생성 가능합니다.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setStep('range')} className="text-xs text-sky-700 hover:underline">
                        ← 범위 다시 설정
                      </button>
                      <span className="text-[11px] text-text-tertiary">
                        {fromPeriod} ~ {toPeriod}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={toggleAll} className="text-xs text-brand-600 hover:underline">
                        전체 선택/해제
                      </button>
                      <span className="text-xs text-text-secondary">{checkedCount}/{schedule.length} 선택</span>
                    </div>
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
            </>
          )}
        </div>

        {/* 푸터 */}
        <div className="px-5 py-3 border-t border-border-subtle flex items-center justify-between gap-3 bg-surface-sunken rounded-b-2xl">
          {step === 'range' ? (
            <>
              <div className="text-xs text-text-secondary">
                기간을 지정하고 [다음]을 누르세요.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleLoadPreview}
                  disabled={loading}
                  className="px-4 py-1.5 bg-sky-600 text-white text-sm font-semibold rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? '불러오는 중…' : '다음 (미리보기)'}
                </button>
              </div>
            </>
          ) : (
            <>
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
                  disabled={saving || schedule.length === 0 || checkedCount === 0}
                  className="px-4 py-1.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? '생성 중…' : mode === 'create' ? '확인하고 생성' : '확인하고 수정반영'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
