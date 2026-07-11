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
  isSelected,
  onToggleSelect,
  onUpdated,
  onJobUpdated,
}: {
  entry: ManagerEntry
  month: string
  isSelected: boolean
  onToggleSelect: () => void
  onUpdated: (record: PayrollRecord) => void
  onJobUpdated: (jobId: string, newPay: number | null) => void
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

  // 출근 일수 (distinct construction_date)
  const workDays = new Set(entry.jobs.map(j => j.construction_date)).size

  // 일자별 그룹핑 (펼침 시 표시)
  const jobsByDate = entry.jobs.reduce<Record<string, ManagerJob[]>>((acc, job) => {
    const key = job.construction_date
    if (!acc[key]) acc[key] = []
    acc[key].push(job)
    return acc
  }, {})
  const sortedDates = Object.keys(jobsByDate).sort()

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
      const newPay = val === '' ? null : Number(val)
      const res = await fetch('/api/admin/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: job.id, manager_pay: newPay }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('단가 저장됨')
      setJobPayEdits(prev => {
        const next = { ...prev }
        delete next[job.id]
        return next
      })
      // 낙관적 업데이트 — 전체 refetch 대신 해당 job만 부모 state에 반영 (펼침 상태 유지)
      onJobUpdated(job.id, newPay)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSavingJob(null)
    }
  }

  return (
    <div
      className={`bg-surface rounded-xl border shadow-soft overflow-hidden transition-colors ${
        isSelected
          ? 'border-brand-500 ring-2 ring-brand-200'
          : isPaid
            ? 'border-state-success-bg'
            : 'border-border-subtle'
      }`}
    >
      <div className="p-3 cursor-pointer select-none" onClick={onToggleSelect}>
        <div className="flex items-start justify-between mb-2 gap-3">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              onClick={e => e.stopPropagation()}
              className="w-4 h-4 accent-brand-600 mt-0.5 shrink-0"
              aria-label={`${entry.person.name} 선택`}
            />
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
            <p className="text-xs text-text-tertiary mt-0.5">{workDays}일 출근 · {entry.jobs.length}건 · 자동 {fmt(entry.auto_amount)}</p>
            {(entry.person.phone || entry.person.account_number) && (
              <p className="text-xs text-text-tertiary mt-0.5">
                {entry.person.phone && <span>{entry.person.phone}</span>}
                {entry.person.phone && entry.person.account_number && <span className="mx-1">·</span>}
                {entry.person.account_number && <span className="font-mono">{entry.person.account_number}</span>}
              </p>
            )}
            </div>
          </div>
          <div className="flex flex-col items-end shrink-0">
            <span className={`text-lg font-bold leading-tight ${isAdjusted ? 'text-orange-600' : 'text-text-primary'}`}>
              {finalAmount.toLocaleString('ko-KR')}
              <span className="text-xs text-text-tertiary ml-0.5">원</span>
            </span>
            {isAdjusted && (
              <span className="text-[10px] text-orange-500 font-medium">조정됨</span>
            )}
            <button
              onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
              className="text-text-tertiary hover:text-text-secondary text-sm leading-none p-1 mt-1"
            >
              {expanded ? '▲' : '▼'}
            </button>
          </div>
        </div>

        {/* 입력 + 저장 한 줄 — 클릭 시 카드 선택 방지 */}
        <div onClick={e => e.stopPropagation()} className="cursor-default">
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
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
            <button
              onClick={handleTogglePaid}
              disabled={paying}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors disabled:opacity-60 ${
                isPaid
                  ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {paying ? '처리 중...' : isPaid ? '지급 취소' : <><CreditCard size={12} className="inline mr-0.5" />지급완료</>}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border-subtle">
          {entry.jobs.length === 0 ? (
            <p className="text-xs text-text-tertiary text-center py-4">일정 없음</p>
          ) : (
            <div>
              {sortedDates.map(date => {
                const jobs = jobsByDate[date]
                const daySum = jobs.reduce((s, j) => s + j.resolved_pay, 0)
                return (
                  <div key={date} className="border-b border-border-subtle last:border-b-0">
                    {/* 일자 헤더 */}
                    <div className="px-3 py-1 bg-surface-sunken flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-text-secondary">
                        📅 {fmtDate(date)}
                        <span className="ml-1.5 text-text-tertiary font-normal">{jobs.length}건</span>
                      </span>
                      <span className="text-[11px] font-semibold text-orange-600">
                        {daySum > 0 ? daySum.toLocaleString('ko-KR') + '원' : '—'}
                      </span>
                    </div>
                    {/* 그 일자 항목들 */}
                    <div className="divide-y divide-border-subtle">
                      {jobs.map(job => {
                        const editVal = jobPayEdits[job.id]
                        const isEditing = editVal !== undefined
                        return (
                          <div key={job.id} className="px-3 py-1.5 flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-text-primary truncate leading-tight">{job.business_name}</p>
                              <p className="text-[10px] text-text-tertiary leading-tight">{job.service_type}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isEditing ? (
                                <>
                                  <input
                                    type="number"
                                    value={editVal}
                                    onChange={e => setJobPayEdits(prev => ({ ...prev, [job.id]: e.target.value }))}
                                    className="w-20 px-1.5 py-0.5 border border-blue-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                                    className="text-[10px] text-text-tertiary hover:text-text-secondary"
                                  >
                                    취소
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className={`text-xs font-semibold ${job.resolved_pay > 0 ? 'text-orange-600' : 'text-text-tertiary'}`}>
                                    {job.resolved_pay > 0 ? job.resolved_pay.toLocaleString('ko-KR') + '원' : '미설정'}
                                  </span>
                                  <button
                                    onClick={() => setJobPayEdits(prev => ({ ...prev, [job.id]: String(job.manager_pay ?? job.unit_price_per_visit ?? '') }))}
                                    className="text-[10px] text-text-tertiary hover:text-brand-600 px-0.5"
                                  >
                                    <Pencil size={11} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="px-3 py-1.5 bg-orange-50 flex justify-between items-center border-t border-orange-100">
            <span className="text-[11px] text-orange-700">건별 합계 ({workDays}일 출근)</span>
            <span className="text-xs font-bold text-orange-700">{entry.auto_amount.toLocaleString('ko-KR')}원</span>
          </div>
        </div>
      )}
    </div>
  )
}
