'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { type LucideProps, CheckCircle2, Clock, XCircle, Trash2, Check } from 'lucide-react'
import type { ForwardRefExoticComponent, RefAttributes } from 'react'

export interface DraftPayslip {
  id: string
  year_month: string
  person_name: string
  pay_date: string | null
  gross_amount: number
  deduction_amount: number
  net_amount: number
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED'
  confirmed_at: string | null
  employment_type: string | null
  created_at: string
}

type StatusKey = DraftPayslip['status']
type LucideIcon = ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>>

interface StatusMeta {
  label: string
  color: string
  Icon: LucideIcon
}

const STATUS_META: Record<StatusKey, StatusMeta> = {
  DRAFT:     { label: 'DRAFT',  color: 'text-amber-600 bg-amber-50 border-amber-200',        Icon: Clock },
  CONFIRMED: { label: '확정',   color: 'text-emerald-600 bg-emerald-50 border-emerald-200',  Icon: CheckCircle2 },
  CANCELLED: { label: '취소됨', color: 'text-text-tertiary bg-surface-sunken border-border', Icon: XCircle },
}

const fmt = (n: number) => n.toLocaleString('ko-KR')

interface Props {
  payslips: DraftPayslip[]
  onRefresh: () => void
}

export default function PayslipDraftList({ payslips, onRefresh }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)

  if (payslips.length === 0) return null

  const handleConfirm = async (p: DraftPayslip) => {
    if (!confirm(`${p.year_month} 명세서를 확정하시겠습니까?\n확정 후에는 수정 불가합니다.`)) return
    setBusyId(p.id)
    try {
      const res = await fetch(`/api/admin/payroll/payslips/${p.id}/confirm`, { method: 'PATCH' })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? '확정 실패')
      toast.success('명세서가 확정되었습니다.')
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '확정 실패')
    } finally {
      setBusyId(null)
    }
  }

  const handleCancel = async (p: DraftPayslip) => {
    const msg = p.status === 'DRAFT'
      ? 'DRAFT 명세서를 삭제하시겠습니까?'
      : '확정 명세서를 취소 처리하시겠습니까?\n(이력은 보존됩니다)'
    if (!confirm(msg)) return
    setBusyId(p.id)
    try {
      const res = await fetch(`/api/admin/payroll/payslips/${p.id}/cancel`, { method: 'DELETE' })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? '취소 실패')
      toast.success(p.status === 'DRAFT' ? '삭제되었습니다.' : '취소 처리되었습니다.')
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '취소 실패')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="border-t border-border-subtle bg-emerald-50/20">
      <div className="px-3 py-1.5 flex items-center gap-1.5 border-b border-border-subtle">
        <CheckCircle2 size={11} className="text-emerald-600" />
        <span className="text-[11px] font-semibold text-emerald-700">
          법정 급여명세서 · {payslips.length}건
        </span>
      </div>
      <div className="divide-y divide-border-subtle">
        {payslips.map(p => {
          const meta = STATUS_META[p.status]
          const Icon = meta.Icon
          return (
            <div key={p.id} className="px-3 py-2 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-semibold text-text-primary">
                    {p.year_month} 귀속
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border flex items-center gap-0.5 ${meta.color}`}>
                    <Icon size={9} />
                    {meta.label}
                  </span>
                  {p.employment_type && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                      {p.employment_type}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                  실지급 {fmt(p.net_amount)}원
                  <span className="text-[10px] text-text-tertiary font-normal ml-1.5">
                    총지급 {fmt(p.gross_amount)} / 공제 {fmt(p.deduction_amount)}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {p.status === 'DRAFT' && (
                  <button
                    onClick={() => handleConfirm(p)}
                    disabled={busyId === p.id}
                    title="확정"
                    className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
                  >
                    <Check size={13} />
                  </button>
                )}
                {p.status !== 'CANCELLED' && (
                  <button
                    onClick={() => handleCancel(p)}
                    disabled={busyId === p.id}
                    title={p.status === 'DRAFT' ? '삭제' : '취소'}
                    className="p-1.5 rounded-md text-red-500 hover:bg-red-50 disabled:opacity-40"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
