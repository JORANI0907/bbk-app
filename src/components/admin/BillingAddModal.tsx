'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Modal, Button, Input } from '@/components/ui'

interface Props {
  open: boolean
  onClose: () => void
  customerId: string
  customerType: string           // '정기딥케어' | '정기엔드케어'
  billingCycle: string           // '월간' | '연간' | 'N개월'
  defaultAmount: number | null   // 마스터 청구액 (자동 채움)
  defaultTiming: 'prepaid' | 'postpaid'
  onSuccess: () => void          // 저장 성공 시 부모에 알림 (리스트 리프레시)
}

const PERIOD_HINT_MONTHLY = '예: 2026-08 (YYYY-MM)'
const PERIOD_HINT_ANNUAL  = '예: 2026 (YYYY)'

/** 오늘 KST 기준 초기 billing_period 문자열 */
function initialPeriod(isAnnual: boolean): string {
  const now = new Date()
  const y = now.getFullYear()
  if (isAnnual) return String(y)
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** 오늘 KST 기준 초기 due_date 문자열 (YYYY-MM-DD) */
function initialDueDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function BillingAddModal({
  open, onClose, customerId, customerType, billingCycle,
  defaultAmount, defaultTiming, onSuccess,
}: Props) {
  const isAnnual = billingCycle === '연간'
  const billingType: 'monthly' | 'annual' = isAnnual ? 'annual' : 'monthly'

  const [billingPeriod, setBillingPeriod] = useState(() => initialPeriod(isAnnual))
  const [dueDate, setDueDate]             = useState(() => initialDueDate())
  const [amount, setAmount]               = useState(() => (defaultAmount ? String(defaultAmount) : ''))
  const [timing, setTiming]               = useState<'prepaid' | 'postpaid'>(defaultTiming)
  const [notes, setNotes]                 = useState('')
  const [saving, setSaving]               = useState(false)

  // 모달이 다시 열릴 때 기본값으로 초기화 (마스터 청구액이 바뀐 경우 등 반영)
  useEffect(() => {
    if (!open) return
    setBillingPeriod(initialPeriod(isAnnual))
    setDueDate(initialDueDate())
    setAmount(defaultAmount ? String(defaultAmount) : '')
    setTiming(defaultTiming)
    setNotes('')
  }, [open, isAnnual, defaultAmount, defaultTiming])

  const handleSave = async () => {
    // billing_period 형식 검증
    const periodOk = isAnnual
      ? /^\d{4}$/.test(billingPeriod)
      : /^\d{4}-\d{2}$/.test(billingPeriod)
    if (!periodOk) {
      toast.error(`청구 기간 형식이 올바르지 않습니다. (${isAnnual ? PERIOD_HINT_ANNUAL : PERIOD_HINT_MONTHLY})`)
      return
    }
    const parsedAmount = Number(amount)
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error('금액을 정확히 입력하세요.')
      return
    }
    if (!dueDate) {
      toast.error('결제 예정일을 선택하세요.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/admin/billings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id:    customerId,
          billing_type:   billingType,
          billing_period: billingPeriod,
          due_date:       dueDate,
          amount:         parsedAmount,
          billing_timing: timing,
          service_type:   customerType,
          notes:          notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: '추가 실패' }))
        throw new Error(j.error ?? '추가 실패')
      }
      toast.success('청구 이력이 추가되었습니다.')
      onSuccess()
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : '추가 중 오류가 발생했습니다.'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="청구 이력 수동 추가"
      description="자동 생성되지 않은 과거 회차를 직접 등록할 때 사용하세요. 저장 후 결제완료 처리·알림·매출 반영은 자동 이력과 동일하게 작동합니다."
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-text-secondary hover:bg-surface-sunken transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '추가 중...' : '추가'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* 청구 기간 */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-text-secondary">
            청구 기간
          </label>
          <Input
            value={billingPeriod}
            onChange={e => setBillingPeriod(e.target.value)}
            placeholder={isAnnual ? PERIOD_HINT_ANNUAL : PERIOD_HINT_MONTHLY}
          />
          <p className="text-xs text-text-tertiary">
            {isAnnual ? PERIOD_HINT_ANNUAL : PERIOD_HINT_MONTHLY}
          </p>
        </div>

        {/* 결제 예정일 */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-text-secondary">
            결제 예정일
          </label>
          <Input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
          />
        </div>

        {/* 금액 */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-text-secondary">
            금액 (원)
          </label>
          <Input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder={defaultAmount ? String(defaultAmount) : '금액 입력'}
          />
          {defaultAmount && (
            <p className="text-xs text-text-tertiary">
              마스터 청구액 {defaultAmount.toLocaleString('ko-KR')}원 자동 세팅됨
            </p>
          )}
        </div>

        {/* 결제 방식 */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-text-secondary">
            결제 방식
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTiming('prepaid')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                timing === 'prepaid'
                  ? 'bg-brand-50 text-brand-700 border-brand-300'
                  : 'bg-surface text-text-secondary border-border hover:bg-surface-sunken'
              }`}
            >
              선납
            </button>
            <button
              type="button"
              onClick={() => setTiming('postpaid')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                timing === 'postpaid'
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                  : 'bg-surface text-text-secondary border-border hover:bg-surface-sunken'
              }`}
            >
              후납
            </button>
          </div>
        </div>

        {/* 메모 (선택) */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-text-secondary">
            메모 (선택)
          </label>
          <Input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="예: 과거분 수동 등록"
          />
        </div>
      </div>
    </Modal>
  )
}
