'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { CreditCard, FileText, ClipboardList, Pencil, Check, X } from 'lucide-react'
import { fmt, fmtDate } from './utils'
import PayslipList, { type PayslipEntry } from './PayslipList'
import PayslipDraftModal from './PayslipDraftModal'
import type { ManagerEntry, ManagerJob, PayrollRecord } from './types'

export default function ManagerCard({
  entry,
  month,
  isSelected,
  isDualRole = false,
  onToggleSelect,
  payslips,
  onPayslipUpdated,
  onPayslipDeleted,
  onUpdated,
  onPublished,
  onRefresh,
  onJobPayChanged,
}: {
  entry: ManagerEntry
  month: string
  isSelected: boolean
  isDualRole?: boolean
  onToggleSelect: () => void
  payslips: PayslipEntry[]
  onPayslipUpdated: (p: PayslipEntry) => void
  onPayslipDeleted: (id: string) => void
  onUpdated: (record: PayrollRecord) => void
  onPublished: () => void
  onRefresh?: () => void  // 일정별 금액 편집 후 부모 데이터 재조회 (폴백용, 지금은 미사용)
  onJobPayChanged?: (personId: string, jobId: string, newPay: number) => void
}) {
  const [editingJobId, setEditingJobId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingJobId, setSavingJobId] = useState<string | null>(null)

  const startEditJob = (job: ManagerJob) => {
    setEditingJobId(job.id)
    setEditValue(String(job.resolved_pay ?? 0))
  }
  const cancelEditJob = () => {
    setEditingJobId(null)
    setEditValue('')
  }
  const saveEditJob = async (jobId: string) => {
    const newPay = Number(editValue)
    if (!Number.isFinite(newPay) || newPay < 0) {
      toast.error('올바른 금액을 입력하세요')
      return
    }
    setSavingJobId(jobId)
    try {
      const res = await fetch('/api/admin/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: jobId, manager_pay: newPay }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? '저장 실패')
      toast.success('금액이 저장되었습니다')
      setEditingJobId(null)
      // 낙관적 업데이트: 부모 state의 해당 job만 갱신 (전체 refetch 없음).
      // 콜백 미주입 시에만 폴백으로 전체 재조회.
      if (onJobPayChanged) onJobPayChanged(entry.person.id, jobId, newPay)
      else onRefresh?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSavingJobId(null)
    }
  }
  const [expanded, setExpanded] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const workerDbId = entry.person.worker_id
  const record = entry.record

  const isPaid = record?.is_paid ?? false
  const isAdjusted = record?.final_amount != null && record.final_amount !== entry.auto_amount
  const hasNote = !!(record?.note?.trim())
  const workDays = new Set(entry.jobs.map(j => j.construction_date)).size

  // 카드 우측 표시 금액: 저장된 record가 있으면 실지급 예상액, 없으면 자동 계산액
  const extraItemsTotal = (record?.extra_items ?? []).reduce((s, it) => s + (it.amount || 0), 0)
  const extraDedTotal = (record?.extra_deductions ?? []).reduce((s, it) => s + (it.amount || 0), 0)
  const base = record?.final_amount ?? entry.auto_amount
  const hasSaved = record != null
  const netEstimate = base + extraItemsTotal - extraDedTotal
  const displayAmount = hasSaved ? netEstimate : entry.auto_amount
  const displayLabel = hasSaved ? '실지급 예상' : '자동 계산액'
  const hasExtras = extraItemsTotal !== 0 || extraDedTotal !== 0

  const jobsByDate = entry.jobs.reduce<Record<string, ManagerJob[]>>((acc, job) => {
    if (!acc[job.construction_date]) acc[job.construction_date] = []
    acc[job.construction_date].push(job)
    return acc
  }, {})
  const sortedDates = Object.keys(jobsByDate).sort()

  return (
    <>
      <div
        className={`bg-surface rounded-xl border shadow-soft overflow-hidden transition-colors border-l-4 border-l-brand-500 ${
          isSelected
            ? 'border-brand-500 ring-2 ring-brand-200'
            : isPaid
              ? 'border-state-success-bg'
              : 'border-border-subtle'
        }`}
      >
        <div className="p-3">
          <div className="flex items-start justify-between gap-3">
            {/* 왼쪽: 체크박스 + 정보 */}
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
                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                  <span className="font-semibold text-text-primary">{entry.person.name}</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-brand-600 text-white font-bold">
                    👤 담당자
                  </span>
                  {isDualRole && (
                    <span
                      className="text-[11px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-semibold"
                      title="이 분은 작업자로도 등록되어 있습니다. 다른 카드도 확인하세요."
                    >
                      🔗 겸직
                    </span>
                  )}
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-600">
                    {entry.person.role === 'admin' ? '관리자' : '직원'}
                  </span>
                  {isPaid && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-state-success-bg text-state-success flex items-center gap-0.5">
                      <CreditCard size={10} />지급완료
                    </span>
                  )}
                  {isAdjusted && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200">
                      조정됨
                    </span>
                  )}
                  {hasNote && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200"
                      title={entry.record?.note ?? ''}
                    >
                      📝
                    </span>
                  )}
                  {payslips.length > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 flex items-center gap-0.5">
                      <FileText size={10} />{payslips.length}
                    </span>
                  )}
                  {entry.person.tax_type && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {entry.person.tax_type}
                    </span>
                  )}
                  {entry.person.salary_basis && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full border ${
                      entry.person.salary_basis === '세후'
                        ? 'bg-violet-50 text-violet-700 border-violet-200'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}>
                      {entry.person.salary_basis}
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-tertiary">
                  {workDays}일 출근 · {entry.jobs.length}건 · 자동 {fmt(entry.auto_amount)}
                </p>
                {(entry.person.phone || entry.person.account_number) && (
                  <p className="text-xs text-text-tertiary mt-0.5">
                    {entry.person.phone}
                    {entry.person.phone && entry.person.account_number && <span className="mx-1">·</span>}
                    {entry.person.account_number && (
                      <span className="font-mono">{entry.person.account_number}</span>
                    )}
                  </p>
                )}
              </div>
            </div>

            {/* 오른쪽: 금액 + 버튼 */}
            <div className="flex flex-col items-end shrink-0 gap-1.5">
              <div className="text-right">
                <span className="block text-[10px] text-text-tertiary leading-none mb-0.5">{displayLabel}</span>
                <span
                  className={`text-lg font-bold leading-tight ${isAdjusted || hasExtras ? 'text-orange-600' : 'text-text-primary'}`}
                  title={hasSaved && hasExtras ? `조정 ${base.toLocaleString('ko-KR')} + 추가지급 ${extraItemsTotal.toLocaleString('ko-KR')} − 추가공제 ${extraDedTotal.toLocaleString('ko-KR')}` : undefined}
                >
                  {displayAmount.toLocaleString('ko-KR')}
                </span>
                <span className="text-xs text-text-tertiary ml-0.5">원</span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setExpanded(v => !v)}
                  className="px-2 py-1 text-[11px] font-medium rounded-md border border-border text-text-secondary hover:bg-surface-sunken transition"
                >
                  {expanded ? '접기' : '내역'}
                </button>
                <button
                  onClick={() => setShowModal(true)}
                  disabled={!workerDbId}
                  title={workerDbId ? '급여 관리' : 'workers 연동 후 사용 가능'}
                  className="px-2 py-1 text-[11px] font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition flex items-center gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ClipboardList size={11} />
                  급여관리
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 발행된 급여명세서 리스트 (레거시) */}
        <PayslipList
          payslips={payslips}
          onUpdated={onPayslipUpdated}
          onDeleted={onPayslipDeleted}
        />

        {/* 일정 내역 (펼침) */}
        {expanded && (
          <div className="border-t border-border-subtle">
            {entry.jobs.length === 0 ? (
              <p className="text-xs text-text-tertiary text-center py-4">일정 없음</p>
            ) : (
              <>
                {sortedDates.map(date => {
                  const jobs = jobsByDate[date]
                  const daySum = jobs.reduce((s, j) => s + j.resolved_pay, 0)
                  return (
                    <div key={date} className="border-b border-border-subtle last:border-b-0">
                      <div className="px-3 py-1 bg-surface-sunken flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-text-secondary">
                          📅 {fmtDate(date)}
                          <span className="ml-1.5 text-text-tertiary font-normal">{jobs.length}건</span>
                        </span>
                        <span className="text-[11px] font-semibold text-orange-600">
                          {daySum > 0 ? daySum.toLocaleString('ko-KR') + '원' : '—'}
                        </span>
                      </div>
                      <div className="divide-y divide-border-subtle">
                        {jobs.map(job => {
                          const isEditing = editingJobId === job.id
                          const isSavingThis = savingJobId === job.id
                          return (
                            <div key={job.id} className="px-3 py-1.5 flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-text-primary truncate leading-tight">
                                  {job.business_name}
                                </p>
                                <p className="text-[10px] text-text-tertiary leading-tight">{job.service_type}</p>
                              </div>
                              {isEditing ? (
                                <div className="flex items-center gap-1 shrink-0">
                                  <input
                                    type="number"
                                    value={editValue}
                                    onChange={e => setEditValue(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') void saveEditJob(job.id)
                                      if (e.key === 'Escape') cancelEditJob()
                                    }}
                                    disabled={isSavingThis}
                                    autoFocus
                                    className="w-24 px-2 py-0.5 border border-brand-400 rounded text-xs text-right focus:outline-none focus:ring-2 focus:ring-brand-500 tabular-nums"
                                  />
                                  <button
                                    onClick={() => void saveEditJob(job.id)}
                                    disabled={isSavingThis}
                                    title="저장 (Enter)"
                                    className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded disabled:opacity-50"
                                  >
                                    <Check size={13} />
                                  </button>
                                  <button
                                    onClick={cancelEditJob}
                                    disabled={isSavingThis}
                                    title="취소 (Esc)"
                                    className="p-0.5 text-text-tertiary hover:bg-surface-sunken rounded disabled:opacity-50"
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => startEditJob(job)}
                                  title="클릭하여 금액 수정 (service_applications.manager_pay)"
                                  className={`text-xs font-semibold shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-surface-sunken transition ${
                                    job.resolved_pay > 0 ? 'text-orange-600' : 'text-text-tertiary'
                                  }`}
                                >
                                  {job.resolved_pay > 0 ? job.resolved_pay.toLocaleString('ko-KR') + '원' : '미설정'}
                                  <Pencil size={9} className="opacity-40" />
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                <div className="px-3 py-1.5 bg-orange-50 flex justify-between items-center border-t border-orange-100">
                  <span className="text-[11px] text-orange-700">건별 합계 ({workDays}일 출근)</span>
                  <span className="text-xs font-bold text-orange-700">{entry.auto_amount.toLocaleString('ko-KR')}원</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {showModal && workerDbId && (
        <PayslipDraftModal
          workerId={workerDbId}
          workerName={entry.person.name}
          workerEmploymentType={null}
          workerDayWage={null}
          month={month}
          personType="user"
          personId={entry.person.id}
          phone={entry.person.phone}
          accountNumber={entry.person.account_number}
          taxType={entry.person.tax_type}
          salaryBasis={entry.person.salary_basis}
          autoAmount={entry.auto_amount}
          record={entry.record}
          payslips={payslips}
          onClose={() => setShowModal(false)}
          onUpdated={record => onUpdated(record)}
          onPayslipUpdated={onPayslipUpdated}
          onPayslipDeleted={onPayslipDeleted}
          onPublished={onPublished}
        />
      )}
    </>
  )
}
