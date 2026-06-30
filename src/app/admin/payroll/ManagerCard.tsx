'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { CreditCard, Pencil } from 'lucide-react'
import { Button } from '@/components/ui'
import { fmt, fmtDate } from './utils'
import type { ManagerEntry, ManagerJob, PayrollRecord } from './types'

export default function ManagerCard({
  entry,
  month,
  onUpdated,
  onRefresh,
}: {
  entry: ManagerEntry
  month: string
  onUpdated: (record: PayrollRecord) => void
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [finalInput, setFinalInput] = useState(entry.record?.final_amount?.toString() ?? '')
  const [noteInput, setNoteInput] = useState(entry.record?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState(false)
  const [jobPayEdits, setJobPayEdits] = useState<Record<string, string>>({})
  const [savingJob, setSavingJob] = useState<string | null>(null)

  const isPaid = entry.record?.is_paid ?? false
  const finalAmount = entry.record?.final_amount ?? entry.auto_amount
  const isAdjusted = entry.record?.final_amount != null && entry.record.final_amount !== entry.auto_amount
  const hasNote = !!(entry.record?.note && entry.record.note.trim() !== '')

  const handleSave = async () => {
    setSaving(true)
    try {
      const finalVal = finalInput.trim() === '' ? null : Number(finalInput)
      const res = await fetch('/api/admin/payroll', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year_month: month,
          person_type: 'user',
          person_id: entry.person.id,
          auto_amount: entry.auto_amount,
          final_amount: finalVal,
          note: noteInput,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onUpdated(data.record)
      toast.success('저장되었습니다.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleTogglePaid = async () => {
    setPaying(true)
    try {
      const res = await fetch('/api/admin/payroll', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year_month: month,
          person_type: 'user',
          person_id: entry.person.id,
          auto_amount: entry.auto_amount,
          final_amount: finalInput.trim() === '' ? null : Number(finalInput),
          note: noteInput,
          is_paid: !isPaid,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onUpdated(data.record)
      toast.success(isPaid ? '지급 취소되었습니다.' : '지급 완료 처리되었습니다.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '처리 실패')
    } finally {
      setPaying(false)
    }
  }

  const handleJobPaySave = async (job: ManagerJob) => {
    const val = jobPayEdits[job.id]
    if (val === undefined) return
    setSavingJob(job.id)
    try {
      const res = await fetch('/api/admin/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: job.id, manager_pay: val === '' ? null : Number(val) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('단가 저장됨')
      setJobPayEdits(prev => {
        const next = { ...prev }
        delete next[job.id]
        return next
      })
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSavingJob(null)
    }
  }

  return (
    <div className={`bg-surface rounded-xl border ${isPaid ? 'border-state-success-bg' : 'border-border-subtle'} shadow-soft overflow-hidden`}>
      <div className="p-3">
        <div className="flex items-start justify-between mb-2 gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-text-primary">{entry.person.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-600">{entry.person.role === 'admin' ? '관리자' : '직원'}</span>
              {isPaid && <span className="text-xs px-2 py-0.5 rounded-full bg-state-success-bg text-state-success flex items-center gap-0.5"><CreditCard size={11} />지급완료</span>}
              {hasNote && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200" title={entry.record?.note ?? ''}>
                  📝 메모
                </span>
              )}
            </div>
            <p className="text-xs text-text-tertiary mt-0.5">{entry.jobs.length}건 · 자동 {fmt(entry.auto_amount)}</p>
            {(entry.person.phone || entry.person.account_number) && (
              <p className="text-xs text-text-tertiary mt-0.5">
                {entry.person.phone && <span>{entry.person.phone}</span>}
                {entry.person.phone && entry.person.account_number && <span className="mx-1">·</span>}
                {entry.person.account_number && <span className="font-mono">{entry.person.account_number}</span>}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end shrink-0">
            <span className={`text-lg font-bold leading-tight ${isAdjusted ? 'text-orange-600' : 'text-text-primary'}`}>
              {finalAmount.toLocaleString('ko-KR')}
              <span className="text-xs text-text-tertiary ml-0.5">원</span>
            </span>
            {isAdjusted && (
              <span className="text-[10px] text-orange-500 font-medium">조정됨</span>
            )}
            <button onClick={() => setExpanded(v => !v)} className="text-text-tertiary hover:text-text-secondary text-sm leading-none p-1 mt-1">
              {expanded ? '▲' : '▼'}
            </button>
          </div>
        </div>

        {/* 입력 + 저장 한 줄 (라벨 제거, placeholder로 대체) */}
        <div className="flex gap-1.5 mb-2">
          <input
            type="number"
            value={finalInput}
            onChange={e => setFinalInput(e.target.value)}
            placeholder={`최종 지급액 (${entry.auto_amount.toLocaleString('ko-KR')})`}
            className="flex-1 min-w-0 px-2 py-1.5 border border-border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            value={noteInput}
            onChange={e => setNoteInput(e.target.value)}
            placeholder="메모"
            className="flex-1 min-w-0 px-2 py-1.5 border border-border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-1.5">
          <Button
            onClick={handleSave}
            disabled={saving}
            variant="secondary"
            className="flex-1 py-1.5 text-xs bg-gray-800 text-white hover:bg-gray-700"
          >
            {saving ? '저장 중...' : '저장'}
          </Button>
          <button
            onClick={handleTogglePaid}
            disabled={paying}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors disabled:opacity-60 ${
              isPaid
                ? 'bg-surface-sunken text-text-secondary hover:bg-surface-sunken'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {paying ? '처리 중...' : isPaid ? '지급 취소' : <><CreditCard size={12} className="inline mr-0.5" />지급완료</>}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border-subtle">
          {entry.jobs.length === 0 ? (
            <p className="text-xs text-text-tertiary text-center py-4">일정 없음</p>
          ) : (
            <div className="divide-y divide-border-subtle">
              {entry.jobs.map(job => {
                const editVal = jobPayEdits[job.id]
                const isEditing = editVal !== undefined
                return (
                  <div key={job.id} className="px-4 py-2.5 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-text-tertiary font-mono">{fmtDate(job.construction_date)}</span>
                        <span className="text-xs text-text-tertiary">·</span>
                        <span className="text-xs text-text-secondary">{job.service_type}</span>
                      </div>
                      <p className="text-sm font-medium text-text-primary truncate">{job.business_name}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isEditing ? (
                        <>
                          <input
                            type="number"
                            value={editVal}
                            onChange={e => setJobPayEdits(prev => ({ ...prev, [job.id]: e.target.value }))}
                            className="w-24 px-2 py-1 border border-blue-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="금액"
                            autoFocus
                          />
                          <Button
                            onClick={() => handleJobPaySave(job)}
                            disabled={savingJob === job.id}
                            size="sm"
                          >
                            {savingJob === job.id ? '...' : '저장'}
                          </Button>
                          <button
                            onClick={() => setJobPayEdits(prev => { const n = { ...prev }; delete n[job.id]; return n })}
                            className="text-xs text-text-tertiary hover:text-text-secondary"
                          >
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          <span className={`text-sm font-semibold ${job.resolved_pay > 0 ? 'text-orange-600' : 'text-text-tertiary'}`}>
                            {job.resolved_pay > 0 ? job.resolved_pay.toLocaleString('ko-KR') + '원' : '미설정'}
                          </span>
                          <button
                            onClick={() => setJobPayEdits(prev => ({ ...prev, [job.id]: String(job.manager_pay ?? job.unit_price_per_visit ?? '') }))}
                            className="text-xs text-text-tertiary hover:text-brand-600 px-1"
                          >
                            <Pencil size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="px-4 py-2 bg-orange-50 flex justify-between items-center border-t border-orange-100">
            <span className="text-xs text-orange-700">건별 합계</span>
            <span className="text-sm font-bold text-orange-700">{entry.auto_amount.toLocaleString('ko-KR')}원</span>
          </div>
        </div>
      )}
    </div>
  )
}
