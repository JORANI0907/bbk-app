'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ChevronLeft, ChevronRight, ClipboardList, LayoutDashboard, BarChart2, FileText } from 'lucide-react'
import ExportModal from './ExportModal'
import PayslipModal from './PayslipModal'
import ManagerCard from './ManagerCard'
import WorkerCard from './WorkerCard'
import SummaryCards from './SummaryCards'
import UnitPriceSettings from './UnitPriceSettings'
import { currentYM } from './utils'
import type { ManagerEntry, WorkerEntry, PayrollRecord } from './types'
import type { PayslipEntry } from './PayslipList'

function parseMonthParam(raw: string | null): string | null {
  if (!raw) return null
  return /^\d{4}-\d{2}$/.test(raw) ? raw : null
}

type PersonFilter = 'all' | 'manager' | 'worker'

export default function PayrollPage() {
  const searchParams = useSearchParams()
  const initialMonth = parseMonthParam(searchParams.get('month')) ?? currentYM()
  const [month, setMonth] = useState(initialMonth)
  const [tab, setTab] = useState<'payroll' | 'unit_price'>('payroll')
  const [personFilter, setPersonFilter] = useState<PersonFilter>('all')
  const [loading, setLoading] = useState(false)
  const [managers, setManagers] = useState<ManagerEntry[]>([])
  const [workersPayroll, setWorkersPayroll] = useState<WorkerEntry[]>([])
  const [showExport, setShowExport] = useState(false)
  const [showPayslip, setShowPayslip] = useState(false)
  // 선택된 인원 (key 형식: "user:<id>" 또는 "worker:<id>")
  const [selectedPersons, setSelectedPersons] = useState<Set<string>>(new Set())
  // 월별 발행된 명세서 이력
  const [payslips, setPayslips] = useState<PayslipEntry[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/payroll?month=${month}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '불러오기 실패')
      setManagers(data.managers ?? [])
      setWorkersPayroll(data.workers_payroll ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '데이터 불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [month])

  const fetchPayslips = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/payroll/payslips?year_month=${month}`)
      const data = await res.json()
      if (!res.ok) return
      setPayslips(data.payslips ?? [])
    } catch {
      // 조용히 실패 — 카드 리스트가 비어있을 뿐 급여정산 자체는 사용 가능
    }
  }, [month])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetchPayslips() }, [fetchPayslips])

  // 카드가 자체적으로 갱신되도록 콜백 제공
  const handlePayslipUpdated = useCallback((updated: PayslipEntry) => {
    setPayslips(prev => prev.map(p => p.id === updated.id ? updated : p))
  }, [])
  const handlePayslipDeleted = useCallback((id: string) => {
    setPayslips(prev => prev.filter(p => p.id !== id))
  }, [])

  // 월/필터 변경 시 선택 초기화 (표시되지 않는 인원까지 선택 유지되면 혼란)
  useEffect(() => {
    setSelectedPersons(new Set())
  }, [month, personFilter])

  const togglePersonSelection = useCallback((type: 'user' | 'worker', id: string) => {
    setSelectedPersons(prev => {
      const next = new Set(prev)
      const key = `${type}:${id}`
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const prevMonth = () => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const nextMonth = () => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const handleManagerRecordUpdated = (record: PayrollRecord) => {
    setManagers(prev => prev.map(e =>
      e.person.id === record.person_id ? { ...e, record } : e
    ))
  }

  const handleWorkerRecordUpdated = (record: PayrollRecord) => {
    setWorkersPayroll(prev => prev.map(e =>
      e.person.id === record.person_id ? { ...e, record } : e
    ))
  }

  // 건별 단가(manager_pay) 저장 후 — 전체 refetch 대신 해당 job만 갱신 (페이지 새로고침 방지)
  const handleManagerJobUpdated = (personId: string, jobId: string, newPay: number | null) => {
    setManagers(prev => prev.map(e => {
      if (e.person.id !== personId) return e
      const newJobs = e.jobs.map(j =>
        j.id === jobId
          ? { ...j, manager_pay: newPay, resolved_pay: newPay ?? j.resolved_pay ?? 0 }
          : j
      )
      const newAuto = newJobs.reduce((s, j) => s + j.resolved_pay, 0)
      return { ...e, jobs: newJobs, auto_amount: newAuto }
    }))
  }

  // 건별 급여(salary) 저장 후 — 동일 패턴
  const handleWorkerJobUpdated = (personId: string, jobId: string, newSalary: number | null) => {
    setWorkersPayroll(prev => prev.map(e => {
      if (e.person.id !== personId) return e
      const newJobs = e.jobs.map(j =>
        j.id === jobId ? { ...j, salary: newSalary } : j
      )
      const newAuto = newJobs.reduce((s, j) => s + (j.salary ?? 0), 0)
      return { ...e, jobs: newJobs, auto_amount: newAuto }
    }))
  }

  const displayMonth = (() => {
    const [y, m] = month.split('-')
    return `${y}년 ${Number(m)}월`
  })()

  // 필터 적용된 entries — 요약 카드용 (담당자/작업자 통합)
  const filteredEntries = useMemo(() => {
    if (personFilter === 'manager') return managers
    if (personFilter === 'worker') return workersPayroll
    return [...managers, ...workersPayroll]
  }, [personFilter, managers, workersPayroll])

  const filterLabel = personFilter === 'manager' ? '담당자' : personFilter === 'worker' ? '작업자' : '전체'
  const showManagers = personFilter === 'all' || personFilter === 'manager'
  const showWorkers = personFilter === 'all' || personFilter === 'worker'
  const totalCount = (showManagers ? managers.length : 0) + (showWorkers ? workersPayroll.length : 0)
  const selectedCount = selectedPersons.size

  // 현재 표시된 전체 인원의 key 목록 (전체 선택/해제용)
  const visiblePersonKeys = useMemo(() => {
    const keys: string[] = []
    if (showManagers) managers.forEach(m => keys.push(`user:${m.person.id}`))
    if (showWorkers) workersPayroll.forEach(w => keys.push(`worker:${w.person.id}`))
    return keys
  }, [showManagers, showWorkers, managers, workersPayroll])

  const allVisibleSelected = visiblePersonKeys.length > 0 && visiblePersonKeys.every(k => selectedPersons.has(k))

  const toggleAllSelection = () => {
    if (allVisibleSelected) {
      setSelectedPersons(new Set())
    } else {
      setSelectedPersons(new Set(visiblePersonKeys))
    }
  }

  // 급여명세서 발행: 선택된 인원이 없으면 안내
  const handleOpenPayslip = () => {
    if (selectedCount === 0) {
      toast.error('급여명세서를 발행할 인원을 카드에서 선택하세요.')
      return
    }
    setShowPayslip(true)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 pb-6 max-w-3xl mx-auto w-full">

        {/* 헤더: 월 네비 + 탭 + 우상단 액션 */}
        <div className="flex items-center justify-between gap-2 my-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            {/* 월 네비 (컴팩트) */}
            <div className="flex items-center bg-surface border border-border rounded-lg overflow-hidden">
              <button onClick={prevMonth} className="px-1.5 py-1.5 hover:bg-surface-sunken transition" aria-label="이전 달">
                <ChevronLeft size={14} />
              </button>
              <span className="px-2 py-1 text-sm font-bold text-text-primary whitespace-nowrap">{displayMonth}</span>
              <button onClick={nextMonth} className="px-1.5 py-1.5 hover:bg-surface-sunken transition" aria-label="다음 달">
                <ChevronRight size={14} />
              </button>
            </div>

            {/* 작은 탭 (급여정산 / 단가설정) */}
            <div className="flex bg-surface-sunken rounded-lg p-0.5">
              <button
                onClick={() => setTab('payroll')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  tab === 'payroll' ? 'bg-surface text-brand-700 shadow-soft' : 'text-text-secondary'
                }`}
              >
                급여정산
              </button>
              <button
                onClick={() => setTab('unit_price')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  tab === 'unit_price' ? 'bg-surface text-brand-700 shadow-soft' : 'text-text-secondary'
                }`}
              >
                단가설정
              </button>
            </div>
          </div>

          {/* 우상단 액션 아이콘 (작게) */}
          <div className="flex items-center gap-1">
            <Link
              href="/admin/finance"
              title="재무 대시보드로 이동"
              className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg transition"
            >
              <LayoutDashboard size={13} />
              <span className="hidden sm:inline">대시보드</span>
            </Link>
            {tab === 'payroll' && (
              <>
                <button
                  onClick={() => setShowExport(true)}
                  title="급여 지급 현황 저장"
                  className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition"
                >
                  <BarChart2 size={13} />
                  <span className="hidden sm:inline">현황 저장</span>
                </button>
                <button
                  onClick={handleOpenPayslip}
                  title="선택 인원 급여명세서 발행"
                  className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition disabled:opacity-50"
                  disabled={selectedCount === 0}
                >
                  <FileText size={13} />
                  <span className="hidden sm:inline">급여명세서</span>
                </button>
              </>
            )}
          </div>
        </div>

        {showExport && (
          <ExportModal
            month={month}
            displayMonth={displayMonth}
            selectedPersons={selectedCount > 0 ? Array.from(selectedPersons) : null}
            onClose={() => setShowExport(false)}
          />
        )}

        {showPayslip && (
          <PayslipModal
            month={month}
            displayMonth={displayMonth}
            selectedPersons={Array.from(selectedPersons)}
            onClose={() => setShowPayslip(false)}
            onPublished={() => {
              // 발행 완료 → 명세서 리스트 새로고침 + 선택 초기화
              fetchPayslips()
              setSelectedPersons(new Set())
            }}
          />
        )}

        {tab === 'payroll' ? (
          <>
            {/* 좌측 필터 (작게) */}
            <div className="flex items-center justify-start mb-3">
              <div className="flex bg-surface-sunken rounded-lg p-0.5">
                {(['all', 'manager', 'worker'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setPersonFilter(f)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                      personFilter === f
                        ? 'bg-brand-600 text-white shadow-soft'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {f === 'all' ? '전체' : f === 'manager' ? '담당자' : '작업자'}
                  </button>
                ))}
              </div>
              <span className="ml-3 text-xs text-text-tertiary">
                {totalCount}명
              </span>
              {totalCount > 0 && (
                <button
                  onClick={toggleAllSelection}
                  className="ml-2 text-xs text-brand-600 hover:text-brand-700 font-medium underline underline-offset-2"
                >
                  {allVisibleSelected ? '전체 해제' : '전체 선택'}
                </button>
              )}
              {selectedCount > 0 && (
                <span className="ml-2 text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                  {selectedCount}명 선택
                </span>
              )}
            </div>

            {loading ? (
              <div className="text-center py-12">
                <p className="text-sm text-text-tertiary">불러오는 중...</p>
              </div>
            ) : (
              <>
                {/* 통합 요약 카드 (필터 반영, 항상 상단 고정) */}
                {filteredEntries.length > 0 && (
                  <SummaryCards entries={filteredEntries} label={filterLabel} />
                )}

                {/* 통합 카드 리스트 (필터에 따라 표시) */}
                {filteredEntries.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="flex justify-center mb-2"><ClipboardList size={32} /></div>
                    <p className="text-sm text-text-tertiary">{displayMonth} {filterLabel} 급여 데이터가 없습니다.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {showManagers && managers.map(entry => (
                      <ManagerCard
                        key={`m-${entry.person.id}`}
                        entry={entry}
                        month={month}
                        isSelected={selectedPersons.has(`user:${entry.person.id}`)}
                        onToggleSelect={() => togglePersonSelection('user', entry.person.id)}
                        payslips={payslips.filter(p => p.person_type === 'user' && p.person_id === entry.person.id)}
                        onPayslipUpdated={handlePayslipUpdated}
                        onPayslipDeleted={handlePayslipDeleted}
                        onUpdated={handleManagerRecordUpdated}
                        onJobUpdated={(jobId, newPay) => handleManagerJobUpdated(entry.person.id, jobId, newPay)}
                      />
                    ))}
                    {showWorkers && workersPayroll.map(entry => (
                      <WorkerCard
                        key={`w-${entry.person.id}`}
                        entry={entry}
                        month={month}
                        isSelected={selectedPersons.has(`worker:${entry.person.id}`)}
                        onToggleSelect={() => togglePersonSelection('worker', entry.person.id)}
                        payslips={payslips.filter(p => p.person_type === 'worker' && p.person_id === entry.person.id)}
                        onPayslipUpdated={handlePayslipUpdated}
                        onPayslipDeleted={handlePayslipDeleted}
                        onUpdated={handleWorkerRecordUpdated}
                        onJobUpdated={(jobId, newSalary) => handleWorkerJobUpdated(entry.person.id, jobId, newSalary)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <UnitPriceSettings month={month} />
        )}
      </div>
    </div>
  )
}
