'use client'

import { useState, useEffect, useCallback } from 'react'
import { CreditCard, FileText, SlidersHorizontal, ClipboardList } from 'lucide-react'
import { fmt, fmtDate } from './utils'
import PayslipList, { type PayslipEntry } from './PayslipList'
import PayrollDetailModal from './PayrollDetailModal'
import PayslipDraftList, { type DraftPayslip } from './PayslipDraftList'
import PayslipDraftModal from './PayslipDraftModal'
import type { ManagerEntry, ManagerJob, PayrollRecord } from './types'

export default function ManagerCard({
  entry,
  month,
  isSelected,
  onToggleSelect,
  payslips,
  onPayslipUpdated,
  onPayslipDeleted,
  onUpdated,
  onPublished,
}: {
  entry: ManagerEntry
  month: string
  isSelected: boolean
  onToggleSelect: () => void
  payslips: PayslipEntry[]
  onPayslipUpdated: (p: PayslipEntry) => void
  onPayslipDeleted: (id: string) => void
  onUpdated: (record: PayrollRecord) => void
  onPublished: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [showDraftModal, setShowDraftModal] = useState(false)
  const [draftPayslips, setDraftPayslips] = useState<DraftPayslip[]>([])

  const workerDbId = entry.person.worker_id

  const fetchDraftPayslips = useCallback(async () => {
    if (!workerDbId) return
    try {
      const res = await fetch(
        `/api/admin/payroll/payslips/worker/${workerDbId}?year_month=${month}`
      )
      if (!res.ok) return
      const data = await res.json() as { payslips: DraftPayslip[] }
      setDraftPayslips(data.payslips ?? [])
    } catch {
      // 조회 실패 시 무시
    }
  }, [workerDbId, month])

  useEffect(() => {
    void fetchDraftPayslips()
  }, [fetchDraftPayslips])

  const isPaid = entry.record?.is_paid ?? false
  const finalAmount = entry.record?.final_amount ?? entry.auto_amount
  const isAdjusted = entry.record?.final_amount != null && entry.record.final_amount !== entry.auto_amount
  const hasNote = !!(entry.record?.note?.trim())
  const workDays = new Set(entry.jobs.map(j => j.construction_date)).size

  const jobsByDate = entry.jobs.reduce<Record<string, ManagerJob[]>>((acc, job) => {
    if (!acc[job.construction_date]) acc[job.construction_date] = []
    acc[job.construction_date].push(job)
    return acc
  }, {})
  const sortedDates = Object.keys(jobsByDate).sort()

  const displayMonth = (() => {
    const [y, m] = month.split('-')
    return `${y}년 ${Number(m)}월`
  })()

  return (
    <>
      <div
        className={`bg-surface rounded-xl border shadow-soft overflow-hidden transition-colors ${
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
                <span className={`text-lg font-bold leading-tight ${isAdjusted ? 'text-orange-600' : 'text-text-primary'}`}>
                  {finalAmount.toLocaleString('ko-KR')}
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
                  className="px-2 py-1 text-[11px] font-semibold rounded-md bg-brand-600 text-white hover:bg-brand-700 transition flex items-center gap-0.5"
                >
                  <SlidersHorizontal size={11} />
                  급여설정
                </button>
                <button
                  onClick={() => setShowDraftModal(true)}
                  disabled={!workerDbId}
                  title={workerDbId ? '법정 급여명세서 발행' : 'workers 연동 후 사용 가능'}
                  className="px-2 py-1 text-[11px] font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition flex items-center gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ClipboardList size={11} />
                  법정명세서
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

        {/* 신규 법정 급여명세서 리스트 */}
        <PayslipDraftList
          payslips={draftPayslips}
          onRefresh={fetchDraftPayslips}
        />

        {/* 일정 내역 (펼침) — 읽기 전용 */}
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
                        {jobs.map(job => (
                          <div key={job.id} className="px-3 py-1.5 flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-text-primary truncate leading-tight">
                                {job.business_name}
                              </p>
                              <p className="text-[10px] text-text-tertiary leading-tight">{job.service_type}</p>
                            </div>
                            <span className={`text-xs font-semibold shrink-0 ${job.resolved_pay > 0 ? 'text-orange-600' : 'text-text-tertiary'}`}>
                              {job.resolved_pay > 0 ? job.resolved_pay.toLocaleString('ko-KR') + '원' : '미설정'}
                            </span>
                          </div>
                        ))}
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

      {showDraftModal && workerDbId && (
        <PayslipDraftModal
          workerId={workerDbId}
          workerName={entry.person.name}
          workerEmploymentType={null}
          workerDayWage={null}
          month={month}
          onClose={() => setShowDraftModal(false)}
          onSaved={fetchDraftPayslips}
        />
      )}

      {showModal && (
        <PayrollDetailModal
          personType="user"
          personId={entry.person.id}
          personName={entry.person.name}
          workerDbId={entry.person.worker_id}
          phone={entry.person.phone}
          accountNumber={entry.person.account_number}
          taxType={entry.person.tax_type}
          salaryBasis={entry.person.salary_basis}
          autoAmount={entry.auto_amount}
          record={entry.record}
          month={month}
          displayMonth={displayMonth}
          payslips={payslips}
          onClose={() => setShowModal(false)}
          onUpdated={record => { onUpdated(record); setShowModal(false) }}
          onPayslipUpdated={onPayslipUpdated}
          onPayslipDeleted={onPayslipDeleted}
          onPublished={onPublished}
        />
      )}
    </>
  )
}
