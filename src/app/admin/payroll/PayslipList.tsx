'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { FileText, Send, ExternalLink, Trash2, CheckCircle2 } from 'lucide-react'

export interface PayslipEntry {
  id: string
  year_month: string
  person_type: 'user' | 'worker'
  person_id: string
  person_name: string
  pay_date: string | null
  file_url: string | null
  file_name: string | null
  gross_amount: number
  deduction_amount: number
  net_amount: number
  tax_type: string | null
  is_sent: boolean
  sent_at: string | null
  sent_channel: string | null
  issued_at: string
}

/**
 * 발행된 급여명세서 리스트 (카드 확장 영역에 표시)
 * 각 항목: 지급일 · 실지급액 · 세금유형 · [PDF] · [발송/발송취소] · [삭제]
 */
export default function PayslipList({
  payslips,
  onUpdated,
  onDeleted,
}: {
  payslips: PayslipEntry[]
  onUpdated: (payslip: PayslipEntry) => void
  onDeleted: (id: string) => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)

  if (payslips.length === 0) return null

  const handleToggleSent = async (p: PayslipEntry) => {
    // 미발송 → 발송 처리
    if (!p.is_sent) {
      const ok = confirm(`${p.person_name}님에게 급여명세서를 발송 처리하시겠습니까?\n(현재는 발송 상태만 기록됩니다.)`)
      if (!ok) return
    } else {
      const ok = confirm(`이미 발송된 명세서입니다. 발송 취소하시겠습니까?`)
      if (!ok) return
    }

    setBusyId(p.id)
    try {
      const res = await fetch('/api/admin/payroll/payslips', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: p.id,
          is_sent: !p.is_sent,
          sent_channel: !p.is_sent ? 'manual' : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '업데이트 실패')
      onUpdated(json.payslip)
      toast.success(!p.is_sent ? '발송 처리되었습니다.' : '발송 취소되었습니다.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '처리 실패')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (p: PayslipEntry) => {
    const ok = confirm(`${p.person_name}님의 급여명세서를 삭제하시겠습니까?\n(Drive 파일은 남고 이력만 삭제됩니다.)`)
    if (!ok) return

    setBusyId(p.id)
    try {
      const res = await fetch(`/api/admin/payroll/payslips?id=${p.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? '삭제 실패')
      }
      onDeleted(p.id)
      toast.success('삭제되었습니다.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '삭제 실패')
    } finally {
      setBusyId(null)
    }
  }

  const fmtDate = (d: string | null) => {
    if (!d) return '-'
    return d.slice(5).replace('-', '/')
  }

  return (
    <div className="border-t border-border-subtle bg-indigo-50/30">
      <div className="px-3 py-1.5 flex items-center gap-1.5 border-b border-border-subtle">
        <FileText size={11} className="text-indigo-600" />
        <span className="text-[11px] font-semibold text-indigo-700">
          발행된 급여명세서 · {payslips.length}건
        </span>
      </div>
      <div className="divide-y divide-border-subtle">
        {payslips.map(p => (
          <div key={p.id} className="px-3 py-2 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-semibold text-text-primary">
                  지급 {fmtDate(p.pay_date)}
                </span>
                <span className="text-[11px] font-bold text-emerald-700">
                  {p.net_amount.toLocaleString('ko-KR')}원
                </span>
                {p.tax_type && (
                  <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                    {p.tax_type}
                  </span>
                )}
                {p.is_sent && (
                  <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full flex items-center gap-0.5">
                    <CheckCircle2 size={9} />
                    발송
                  </span>
                )}
              </div>
              <p className="text-[10px] text-text-tertiary mt-0.5">
                발행 {new Date(p.issued_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {p.file_url && (
                <a
                  href={p.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  title="PDF 열기"
                  className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-md"
                >
                  <ExternalLink size={12} />
                </a>
              )}
              <button
                onClick={e => { e.stopPropagation(); handleToggleSent(p) }}
                disabled={busyId === p.id}
                title={p.is_sent ? '발송 취소' : '발송 처리'}
                className={`p-1.5 rounded-md disabled:opacity-40 ${
                  p.is_sent
                    ? 'text-emerald-600 hover:bg-emerald-50'
                    : 'text-indigo-600 hover:bg-indigo-50'
                }`}
              >
                <Send size={12} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); handleDelete(p) }}
                disabled={busyId === p.id}
                title="이력 삭제"
                className="p-1.5 text-red-500 hover:bg-red-50 rounded-md disabled:opacity-40"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
