'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'

// ─── 타입 ────────────────────────────────────────────────────────

interface ServiceTypeStat {
  count: number
  revenue: number
}

interface WorkerStat {
  worker_id: string
  worker_name: string
  days: number
  total_minutes: number
}

interface ReportData {
  month: string
  revenue_total: number
  job_count: number
  new_customers: number
  avg_price: number
  by_service_type: Record<string, ServiceTypeStat>
  by_worker: WorkerStat[]
}

// ─── 유틸 ────────────────────────────────────────────────────────

function getCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  return `${y}년 ${Number(m)}월`
}

function formatWon(amount: number) {
  return amount.toLocaleString('ko-KR') + '원'
}

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}분`
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`
}

// ─── 통계 카드 ────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: string
  sub?: string
  color: string
}

function StatCard({ label, value, sub, color }: StatCardProps) {
  return (
    <div className={`rounded-xl p-4 ${color}`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── 컴포넌트 ────────────────────────────────────────────────────

export default function ReportsPage() {
  const [month, setMonth] = useState(getCurrentMonth)
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchReport = useCallback(async (m: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/reports?month=${m}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '로드 실패'); return }
      setData(json)
    } catch {
      toast.error('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchReport(month) }, [fetchReport, month])

  const handleMonthChange = (delta: number) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h1 className="text-lg font-bold text-gray-900">월간보고서</h1>
      </div>

      {/* 월 선택 */}
      <div className="flex items-center gap-3 px-4 pb-4">
        <button
          onClick={() => handleMonthChange(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-gray-800 min-w-[90px] text-center">
          {monthLabel(month)}
        </span>
        <button
          onClick={() => handleMonthChange(1)}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
        >
          ›
        </button>
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="ml-2 border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">로딩 중...</div>
        ) : !data ? (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">데이터가 없습니다.</div>
        ) : (
          <>
            {/* 통계 카드 4개 */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="총 매출"
                value={formatWon(data.revenue_total)}
                color="bg-brand-50 text-brand-900"
              />
              <StatCard
                label="작업 건수"
                value={`${data.job_count}건`}
                color="bg-green-50 text-green-900"
              />
              <StatCard
                label="신규 고객"
                value={`${data.new_customers}명`}
                color="bg-purple-50 text-purple-900"
              />
              <StatCard
                label="평균 단가"
                value={formatWon(data.avg_price)}
                sub="완료 건 기준"
                color="bg-orange-50 text-orange-900"
              />
            </div>

            {/* 서비스 타입별 현황 */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-bold text-gray-900 mb-3">서비스 타입별 현황</h2>
              {Object.keys(data.by_service_type).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">데이터 없음</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(data.by_service_type).map(([type, stat]) => (
                    <div key={type} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{type}</p>
                        <p className="text-xs text-gray-400">{stat.count}건</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">{formatWon(stat.revenue)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 직원별 작업 현황 */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50">
                <h2 className="text-sm font-bold text-gray-900">직원별 작업 현황</h2>
              </div>
              {data.by_worker.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">데이터 없음</p>
              ) : (
                <>
                  {/* 헤더 */}
                  <div className="grid grid-cols-3 gap-2 px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500">
                    <span>직원</span>
                    <span className="text-center">출근일수</span>
                    <span className="text-right">총 근무시간</span>
                  </div>
                  {/* 행 */}
                  {data.by_worker.map(w => (
                    <div
                      key={w.worker_id || w.worker_name}
                      className="grid grid-cols-3 gap-2 px-4 py-3 text-sm border-t border-gray-50 items-center"
                    >
                      <span className="font-medium text-gray-800 truncate">{w.worker_name}</span>
                      <span className="text-center text-gray-700">{w.days}일</span>
                      <span className="text-right text-gray-600 text-xs">
                        {w.total_minutes > 0 ? formatMinutes(w.total_minutes) : '-'}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
