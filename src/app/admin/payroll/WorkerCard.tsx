'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { CreditCard, Pencil } from 'lucide-react'
import { Button } from '@/components/ui'
import { fmt, fmtDate } from './utils'
import type { WorkerEntry, WorkerJob, PayrollRecord } from './types'

export default function WorkerCard({
  entry,
  month,
  onUpdated,
  onRefresh,
}: {
  entry: WorkerEntry
  month: string
  onUpdated: (record: PayrollRecord) => void
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [finalInput, setFinalInput] = useState(entry.record?.final_amount?.toString() ?? '')
  const [noteInput, setNoteInput] = useState(entry.record?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState(false)
  const [jobSalaryEdits, setJobSalaryEdits] = useState<Record<string, string>>({})
  const [savingJob, setSavingJob] = useState<string | null>(null)

  const isPaid = entry.record?.is_paid ?? false

  const handleSave = async () => {
    setSaving(true)
    try {
      const finalVal = finalInput.trim() === '' ? null : Number(finalInput)
      const res = await fetch('/api/admin/payroll', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year_month: month,
          person_type: 'worker',
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
          person_type: 'worker',
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

  const handleJobSalarySave = async (job: WorkerJob) => {
    const val = jobSalaryEdits[job.id]
    if (val === undefined) return
    setSavingJob(job.id)
    try {
      const res = await fetch('/api/admin/work-assignments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: job.id, salary: val === '' ? null : Number(val) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('급여 저장됨')
      setJobSalaryEdits(prev => {
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
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-text-primary">{entry.person.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">{entry.person.employment_type ?? '기타'}</span>
              {isPaid && <span className="text-xs px-2 py-0.5 rounded-full bg-state-success-bg text-state-success flex items-center gap-0.5"><CreditCard size={11} />지급완료</span>}
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
          <button onClick={() => setExpanded(v => !v)} className="text-text-tertiary hover:text-text-secondary text-lg leading-none p-1">
            {expanded ? '▲' : '▼'}
          </button>
        </div>

        {entry.person.employment_type === '정직원' ? (
          <div className="mb-3 px-3 py-2 bg-amber-50 rounded-lg">
            <p className="text-xs text-amber-700">월급 참고: <span className="font-semibold">{fmt(entry.person.avg_salary)}</span></p>
          </div>
        ) : entry.person.day_wage || entry.person.night_wage ? (
          <div className="mb-3 px-3 py-2 bg-amber-50 rounded-lg">
            <p className="text-xs text-amber-700">
              주간 <span className="font-semibold">{fmt(entry.person.day_wage)}</span>
              <span className="mx-1.5 text-amber-300">·</span>
              야간 <span className="font-semibold">{fmt(entry.person.night_wage)}</span>
              <span className="ml-1 text-amber-500">(참고용)</span>
            </p>
          </div>
        ) : null}

        <div className="flex gap-2 mb-3">
          <div className="flex-1">
            <label className="text-xs text-text-tertiary mb-1 block">최종 지급액</label>
            <input
              type="number"
              value={finalInput}
              onChange={e => setFinalInput(e.target.value)}
              placeholder={`${entry.auto_amount.toLocaleString('ko-KR')} (자동)`}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-text-tertiary mb-1 block">메모</label>
            <input
              type="text"
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              placeholder="조정 사유 등"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            variant="secondary"
            className="flex-1 py-2 bg-gray-800 text-white hover:bg-gray-700"
          >
            {saving ? '저장 중...' : '저장'}
          </Button>
          <button
            onClick={handleTogglePaid}
            disabled={paying}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 ${
              isPaid
                ? 'bg-surface-sunken text-text-secondary hover:bg-surface-sunken'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {paying ? '처리 중...' : isPaid ? '지급 취소' : <><CreditCard size={14} className="inline mr-1" />지급완료</>}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border-subtle">
          {entry.jobs.length === 0 ? (
            <p className="text-xs text-text-tertiary text-center py-4">배정 없음</p>
          ) : (
            <div className="divide-y divide-border-subtle">
              {entry.jobs.map(job => {
                const editVal = jobSalaryEdits[job.id]
                const isEditing = editVal !== undefined
                return (
                  <div key={job.id} className="px-4 py-2.5 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-text-tertiary font-mono">{fmtDate(job.construction_date)}</span>
                      <p className="text-sm font-medium text-text-primary truncate">{job.business_name}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isEditing ? (
                        <>
                          <input
                            type="number"
                            value={editVal}
                            onChange={e => setJobSalaryEdits(prev => ({ ...prev, [job.id]: e.target.value }))}
                            className="w-24 px-2 py-1 border border-blue-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="금액"
                            autoFocus
                          />
                          <Button
                            onClick={() => handleJobSalarySave(job)}
                            disabled={savingJob === job.id}
                            size="sm"
                          >
                            {savingJob === job.id ? '...' : '저장'}
                          </Button>
                          <button
                            onClick={() => setJobSalaryEdits(prev => { const n = { ...prev }; delete n[job.id]; return n })}
                            className="text-xs text-text-tertiary hover:text-text-secondary"
                          >
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          <span className={`text-sm font-semibold ${(job.salary ?? 0) > 0 ? 'text-orange-600' : 'text-text-tertiary'}`}>
                            {(job.salary ?? 0) > 0 ? (job.salary!).toLocaleString('ko-KR') + '원' : '미설정'}
                          </span>
                          <button
                            onClick={() => setJobSalaryEdits(prev => ({ ...prev, [job.id]: String(job.salary ?? '') }))}
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
