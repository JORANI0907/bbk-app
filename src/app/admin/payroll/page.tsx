'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Banknote, BarChart2, ClipboardList, Tag, LayoutDashboard } from 'lucide-react'
import ExportModal from './ExportModal'
import ManagerCard from './ManagerCard'
import WorkerCard from './WorkerCard'
import SummaryCards from './SummaryCards'
import UnitPriceSettings from './UnitPriceSettings'
import { currentYM } from './utils'
import type { ManagerEntry, WorkerEntry, PayrollRecord } from './types'

// URL ?month=YYYY-MM 형식 검증
function parseMonthParam(raw: string | null): string | null {
  if (!raw) return null
  return /^\d{4}-\d{2}$/.test(raw) ? raw : null
}

export default function PayrollPage() {
  const searchParams = useSearchParams()
  const initialMonth = parseMonthParam(searchParams.get('month')) ?? currentYM()
  const [month, setMonth] = useState(initialMonth)
  const [tab, setTab] = useState<'payroll' | 'unit_price'>('payroll')
  const [personFilter, setPersonFilter] = useState<'all' | 'manager' | 'worker'>('all')
  const [loading, setLoading] = useState(false)
  const [managers, setManagers] = useState<ManagerEntry[]>([])
  const [workersPayroll, setWorkersPayroll] = useState<WorkerEntry[]>([])
  const [showExport, setShowExport] = useState(false)

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

  useEffect(() => { fetchData() }, [fetchData])

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

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {/* Month selector + 재무 대시보드 링크 */}
        <div className="flex items-center justify-between my-4">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-surface-sunken text-text-secondary transition-colors">‹</button>
          <div className="text-center">
            <h2 className="text-base font-bold text-text-primary">{displayMonth}</h2>
            <p className="text-xs text-text-tertiary">급여 정산</p>
          </div>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-surface-sunken text-text-secondary transition-colors">›</button>
        </div>

        {/* 재무 대시보드 빠른 이동 */}
        <Link
          href="/admin/finance"
          className="mb-3 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg transition"
        >
          <LayoutDashboard size={12} />
          재무 대시보드로 이동
        </Link>

        {/* Sub-tab selector */}
        <div className="flex gap-1 bg-surface-sunken rounded-xl p-1 mb-4">
          <button
            onClick={() => setTab('payroll')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'payroll' ? 'bg-surface text-text-primary shadow-soft' : 'text-text-secondary'}`}
          >
            <Banknote size={14} className="inline mr-1" />급여정산
          </button>
          <button
            onClick={() => setTab('unit_price')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'unit_price' ? 'bg-surface text-text-primary shadow-soft' : 'text-text-secondary'}`}
          >
            <Tag size={14} className="inline mr-1" />단가 설정
          </button>
        </div>

        {showExport && (
          <ExportModal
            month={month}
            displayMonth={displayMonth}
            onClose={() => setShowExport(false)}
          />
        )}

        {tab === 'payroll' ? (
          <>
            <button
              onClick={() => setShowExport(true)}
              className="w-full mb-4 py-2.5 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 shadow-soft"
            >
              <BarChart2 size={14} className="inline mr-1" />급여 지급 현황 저장
            </button>

            {/* 인원 필터 */}
            <div className="flex gap-2 mb-4">
              {(['all', 'manager', 'worker'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setPersonFilter(f)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    personFilter === f
                      ? 'bg-brand-600 text-white'
                      : 'bg-surface-sunken text-text-secondary'
                  }`}
                >
                  {f === 'all' ? '전체' : f === 'manager' ? '담당자' : '작업자'}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="text-center py-12">
                <p className="text-sm text-text-tertiary">불러오는 중...</p>
              </div>
            ) : (
              <>
                {(personFilter === 'all' || personFilter === 'manager') && (
                  <>
                    {managers.length > 0 ? (
                      <>
                        <div className="flex items-center gap-2 mb-3">
                          <h3 className="text-sm font-bold text-text-primary">담당자</h3>
                          <span className="text-xs bg-brand-100 text-brand-600 px-2 py-0.5 rounded-full">{managers.length}명</span>
                        </div>
                        <SummaryCards entries={managers} label="담당자" />
                        <div className="flex flex-col gap-3 mb-6">
                          {managers.map(entry => (
                            <ManagerCard
                              key={entry.person.id}
                              entry={entry}
                              month={month}
                              onUpdated={handleManagerRecordUpdated}
                              onRefresh={fetchData}
                            />
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-6 text-sm text-text-tertiary mb-4">
                        {displayMonth} 담당자 배정 없음
                      </div>
                    )}
                  </>
                )}

                {(personFilter === 'all' || personFilter === 'worker') && (
                  <>
                    {workersPayroll.length > 0 ? (
                      <>
                        <div className="flex items-center gap-2 mb-3">
                          <h3 className="text-sm font-bold text-text-primary">작업자</h3>
                          <span className="text-xs bg-state-warning-bg text-state-warning px-2 py-0.5 rounded-full">{workersPayroll.length}명</span>
                        </div>
                        <SummaryCards entries={workersPayroll} label="작업자" />
                        <div className="flex flex-col gap-3">
                          {workersPayroll.map(entry => (
                            <WorkerCard
                              key={entry.person.id}
                              entry={entry}
                              month={month}
                              onUpdated={handleWorkerRecordUpdated}
                              onRefresh={fetchData}
                            />
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-6 text-sm text-text-tertiary">
                        {displayMonth} 작업자 배정 없음
                      </div>
                    )}
                  </>
                )}

                {managers.length === 0 && workersPayroll.length === 0 && (
                  <div className="text-center py-12">
                    <div className="flex justify-center mb-2"><ClipboardList size={32} /></div>
                    <p className="text-sm text-text-tertiary">{displayMonth} 급여 데이터가 없습니다.</p>
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
