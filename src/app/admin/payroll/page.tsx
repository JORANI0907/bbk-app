'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ChevronLeft, ChevronRight, ClipboardList, LayoutDashboard, BarChart2, FileText, Percent } from 'lucide-react'
import ExportModal from './ExportModal'
import PayslipModal from './PayslipModal'
import ManagerCard from './ManagerCard'
import WorkerCard from './WorkerCard'
import SummaryCards from './SummaryCards'
import UnitPriceSettings from './UnitPriceSettings'
import InsuranceRateModal from './InsuranceRateModal'
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
  const [showInsuranceRate, setShowInsuranceRate] = useState(false)
  const [selectedPersons, setSelectedPersons] = useState<Set<string>>(new Set())
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
      // 조용히 실패
    }
  }, [month])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetchPayslips() }, [fetchPayslips])

  const handlePayslipUpdated = useCallback((updated: PayslipEntry) => {
    setPayslips(prev => prev.map(p => p.id === updated.id ? updated : p))
  }, [])
  const handlePayslipDeleted = useCallback((id: string) => {
    setPayslips(prev => prev.filter(p => p.id !== id))
  }, [])

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

  const displayMonth = (() => {
    const [y, m] = month.split('-')
    return `${y}년 ${Number(m)}월`
  })()

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

  const visiblePersonKeys = useMemo(() => {
    const keys: string[] = []
    if (showManagers) managers.forEach(m => keys.push(`user:${m.person.id}`))
    if (showWorkers) workersPayroll.forEach(w => keys.push(`worker:${w.person.id}`))
    return keys
  }, [showManagers, showWorkers, managers, workersPayroll])

  // 담당자·작업자 겸직 감지 — phone 우선, 없으면 이름 기준
  const dualRoleKeys = useMemo(() => {
    const keyOf = (p: { phone: string | null; name: string }) =>
      p.phone ? `p:${p.phone}` : `n:${p.name}`
    const managerSet = new Set(managers.map(m => keyOf(m.person)))
    const workerSet = new Set(workersPayroll.map(w => keyOf(w.person)))
    const dual = new Set<string>()
    managerSet.forEach(k => { if (workerSet.has(k)) dual.add(k) })
    return dual
  }, [managers, workersPayroll])
  const isDual = (p: { phone: string | null; name: string }) =>
    dualRoleKeys.has(p.phone ? `p:${p.phone}` : `n:${p.name}`)
  const dualRoleNames = useMemo(() => {
    const names = new Set<string>()
    managers.forEach(m => { if (isDual(m.person)) names.add(m.person.name) })
    return Array.from(names)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managers, workersPayroll, dualRoleKeys])

  const allVisibleSelected = visiblePersonKeys.length > 0 && visiblePersonKeys.every(k => selectedPersons.has(k))

  const toggleAllSelection = () => {
    if (allVisibleSelected) setSelectedPersons(new Set())
    else setSelectedPersons(new Set(visiblePersonKeys))
  }

  const handleOpenPayslip = () => {
    if (selectedCount === 0) {
      toast.error('급여명세서를 발행할 인원을 카드에서 선택하세요.')
      return
    }
    setShowPayslip(true)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ───── 고정 헤더 (스크롤 외부) ───── */}
      <div className="bg-surface border-b border-border-subtle shrink-0">
        <div className="px-4 pt-3 pb-2 max-w-3xl mx-auto w-full">
          {/* 1행: 월 네비 + 탭 + 보험요율 + 우측 액션 */}
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              {/* 월 네비 */}
              <div className="flex items-center bg-surface-sunken border border-border rounded-lg overflow-hidden">
                <button onClick={prevMonth} className="px-1.5 py-1.5 hover:bg-surface-sunken transition" aria-label="이전 달">
                  <ChevronLeft size={14} />
                </button>
                <span className="px-2 py-1 text-sm font-bold text-text-primary whitespace-nowrap">{displayMonth}</span>
                <button onClick={nextMonth} className="px-1.5 py-1.5 hover:bg-surface-sunken transition" aria-label="다음 달">
                  <ChevronRight size={14} />
                </button>
              </div>

              {/* 탭 */}
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

              {/* 보험요율 버튼 (단가설정 탭 옆) */}
              <button
                onClick={() => setShowInsuranceRate(true)}
                title="보험 요율 설정"
                className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-text-secondary bg-surface-sunken hover:bg-surface border border-border rounded-lg transition"
              >
                <Percent size={12} />
                <span className="hidden sm:inline">요율</span>
              </button>
            </div>

            {/* 우측 액션 */}
            <div className="flex items-center gap-1">
              <Link
                href="/admin/finance"
                title="재무 대시보드"
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
                    className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition"
                  >
                    <BarChart2 size={13} />
                    <span className="hidden sm:inline">현황 저장</span>
                  </button>
                  <button
                    onClick={handleOpenPayslip}
                    title="선택 인원 급여명세서 발행"
                    disabled={selectedCount === 0}
                    className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition disabled:opacity-40"
                  >
                    <FileText size={13} />
                    <span className="hidden sm:inline">급여명세서</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 2행: 필터 + 선택 상태 (급여정산 탭일 때만) */}
          {tab === 'payroll' && (
            <div className="flex items-center gap-2">
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
              <span className="text-xs text-text-tertiary">{totalCount}명</span>
              {totalCount > 0 && (
                <button
                  onClick={toggleAllSelection}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium underline underline-offset-2"
                >
                  {allVisibleSelected ? '전체 해제' : '전체 선택'}
                </button>
              )}
              {selectedCount > 0 && (
                <span className="text-xs font-semibold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">
                  {selectedCount}명 선택
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ───── 스크롤 영역 (카드만) ───── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pb-6 pt-3 max-w-3xl mx-auto w-full">
          {tab === 'payroll' ? (
            loading ? (
              <div className="text-center py-12">
                <p className="text-sm text-text-tertiary">불러오는 중...</p>
              </div>
            ) : (
              <>
                {filteredEntries.length > 0 && (
                  <div className="mb-3">
                    <SummaryCards entries={filteredEntries} label={filterLabel} />
                  </div>
                )}
                {dualRoleNames.length > 0 && personFilter === 'all' && (
                  <div className="mb-3 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <span>🔗</span>
                    <span>
                      <b>{dualRoleNames.join(', ')}</b> 님은 담당자·작업자 두 역할로 활동 중입니다.
                      각 카드는 <b>해당 역할의 급여만</b> 표시하며, 이체 시 두 카드를 모두 확인하세요.
                    </span>
                  </div>
                )}
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
                        isDualRole={isDual(entry.person)}
                        onToggleSelect={() => togglePersonSelection('user', entry.person.id)}
                        payslips={payslips.filter(p => p.person_type === 'user' && p.person_id === entry.person.id)}
                        onPayslipUpdated={handlePayslipUpdated}
                        onPayslipDeleted={handlePayslipDeleted}
                        onUpdated={handleManagerRecordUpdated}
                        onPublished={fetchPayslips}
                      />
                    ))}
                    {showWorkers && workersPayroll.map(entry => (
                      <WorkerCard
                        key={`w-${entry.person.id}`}
                        entry={entry}
                        month={month}
                        isSelected={selectedPersons.has(`worker:${entry.person.id}`)}
                        isDualRole={isDual(entry.person)}
                        onToggleSelect={() => togglePersonSelection('worker', entry.person.id)}
                        payslips={payslips.filter(p => p.person_type === 'worker' && p.person_id === entry.person.id)}
                        onPayslipUpdated={handlePayslipUpdated}
                        onPayslipDeleted={handlePayslipDeleted}
                        onUpdated={handleWorkerRecordUpdated}
                        onPublished={fetchPayslips}
                      />
                    ))}
                  </div>
                )}
              </>
            )
          ) : (
            <UnitPriceSettings month={month} />
          )}
        </div>
      </div>

      {/* ───── 모달 ───── */}
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
            fetchPayslips()
            setSelectedPersons(new Set())
          }}
        />
      )}
      {showInsuranceRate && (
        <InsuranceRateModal onClose={() => setShowInsuranceRate(false)} />
      )}
    </div>
  )
}
