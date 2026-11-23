'use client'

/** 견적관리에서 저장된 계산 결과를 골라 불러오는 모달 */
import { useEffect, useState } from 'react'
import { Button, Modal, Spinner } from '@/components/ui'
import { SERVICE_TYPE_LABELS, type CalcResult, type PricingServiceType } from '@/lib/pricing/types'

export interface SavedCalculation {
  id: string
  service_type: PricingServiceType
  label: string | null
  created_at: string
  inputs: { _meta?: { size_name?: string; difficulty_name?: string } } & Record<string, unknown>
  result: CalcResult
}

/** 계산 결과 → 견적 항목(품목명·금액)과 할인 합계 */
export function calculationToQuote(c: SavedCalculation) {
  const r = c.result
  const meta = c.inputs._meta ?? {}
  const desc = [meta.size_name, meta.difficulty_name].filter(Boolean).join('·')
  const baseName = `${SERVICE_TYPE_LABELS[c.service_type]}${desc ? ` (${desc}` : ' ('}${desc ? ', ' : ''}${r.workers}명 × ${r.hours_per_worker}시간)`
  const items = [
    { name: baseName, qty: 1, unit_price: r.per_visit_amount, subtotal: r.per_visit_amount },
    ...r.surcharges.map((s) => ({ name: `할증 · ${s.label}`, qty: 1, unit_price: s.amount, subtotal: s.amount })),
  ]
  const discountTotal = r.discounts.reduce((s, d) => s + d.amount, 0)
  return { items, discountTotal, discountLabel: r.discounts.map((d) => d.label).join(', ') }
}

interface Props {
  open: boolean
  onClose: () => void
  onPick: (calc: SavedCalculation) => void
}

export function ImportCalculationModal({ open, onClose, onPick }: Props) {
  const [list, setList] = useState<SavedCalculation[] | null>(null)

  useEffect(() => {
    if (!open) return
    setList(null)
    fetch('/api/admin/pricing/calculations')
      .then((r) => r.json())
      .then((j) => setList(j.success ? j.data : []))
      .catch(() => setList([]))
  }, [open])

  return (
    <Modal open={open} onClose={onClose} title="계산기 결과 불러오기" description="비용 계산기에서 저장한 최근 20건입니다. 고르면 견적 항목과 할인이 채워집니다." size="lg">
      {list === null ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : list.length === 0 ? (
        <p className="text-sm text-text-tertiary py-6 text-center">저장된 계산이 없습니다. 비용 계산기에서 먼저 저장하세요.</p>
      ) : (
        <div className="divide-y divide-border-subtle max-h-[60vh] overflow-y-auto">
          {list.map((c) => (
            <div key={c.id} className="py-3 flex flex-col md:flex-row md:items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold break-keep">{c.label || '(메모 없음)'} <span className="text-xs font-normal text-text-tertiary">{SERVICE_TYPE_LABELS[c.service_type]}</span></p>
                <p className="text-xs text-text-secondary">
                  {[c.inputs._meta?.size_name, c.inputs._meta?.difficulty_name].filter(Boolean).join(' · ')} · {c.result.workers}명 × {c.result.hours_per_worker}h · 공급가 {c.result.supply_amount.toLocaleString('ko-KR')}원
                </p>
                <p className="text-xs text-text-tertiary">{new Date(c.created_at).toLocaleString('ko-KR')}</p>
              </div>
              <Button size="sm" onClick={() => { onPick(c); onClose() }}>불러오기</Button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
