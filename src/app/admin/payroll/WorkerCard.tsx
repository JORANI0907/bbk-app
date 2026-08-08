'use client'

import { useState } from 'react'
import { CreditCard, FileText, ClipboardList } from 'lucide-react'
import { fmt, fmtDate } from './utils'
import PayslipList, { type PayslipEntry } from './PayslipList'
import PayslipDraftModal from './PayslipDraftModal'
import type { WorkerEntry, WorkerJob, PayrollRecord } from './types'

export default function WorkerCard({
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
}: {
  entry: WorkerEntry
  month: string
  isSelected: boolean
  isDualRole?: boolean
  onToggleSelect: () => void
  payslips: PayslipEntry[]
  onPayslipUpdated: (p: PayslipEntry) => void
  onPayslipDeleted: (id: string) => void
  onUpdated: (record: PayrollRecord) => void
  onPublished: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showModal, setShowModal] = useState(false)

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

  const jobsByDate = entry.jobs.reduce<Record<string, WorkerJob[]>>((acc, job) => {
    if (!acc[job.construction_date]) acc[job.construction_date] = []
    acc[job.construction_date].push(job)
    return acc
  }, {})
  const sortedDates = Object.keys(jobsByDate).sort()

  return (
    <>
      <div
        className={`bg-surface rounded-xl border shadow-soft overflow-hidden transition-colors border-l-4 border-l-amber-500 ${
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
                  <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-amber-500 text-white font-bold">
                    🔧 작업자
                  </span>
                  {isDualRole && (
                    <span
                      className="text-[11px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-semibold"
                      title="이 분은 담당자로도 등록되어 있습니다. 다른 카드도 확인하세요."
                    >
                      🔗 겸직
                    </span>
                  )}
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">
                    {entry.person.employment_type ?? '기타'}
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
                {entry.person.employment_type === 'FULL_TIME' && entry.person.avg_salary && (
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    월급 참고: <span className="font-semibold">{fmt(entry.person.avg_salary)}</span>
                  </p>
                )}
                {entry.person.employment_type !== 'FULL_TIME' && (entry.person.day_wage || entry.person.night_wage) && (
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    주간 <span className="font-semibold">{fmt(entry.person.day_wage)}</span>
                    <span className="mx-1 text-amber-300">·</span>
                    야간 <span className="font-semibold">{fmt(entry.person.night_wage)}</span>
                  </p>
                )}
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
                  className="px-2 py-1 text-[11px] font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition flex items-center gap-0.5"
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
              <p className="text-xs text-text-tertiary text-center py-4">배정 없음</p>
            ) : (
              <>
                {sortedDates.map(date => {
                  const jobs = jobsByDate[date]
                  const daySum = jobs.reduce((s, j) => s + (j.salary ?? 0), 0)
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
                            </div>
                            <span className={`text-xs font-semibold shrink-0 ${(job.salary ?? 0) > 0 ? 'text-orange-600' : 'text-text-tertiary'}`}>
                              {(job.salary ?? 0) > 0 ? job.salary!.toLocaleString('ko-KR') + '원' : '미설정'}
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

      {showModal && (
        <PayslipDraftModal
          workerId={entry.person.id}
          workerName={entry.person.name}
          workerEmploymentType={entry.person.employment_type}
          workerDayWage={entry.person.day_wage}
          month={month}
          personType="worker"
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
