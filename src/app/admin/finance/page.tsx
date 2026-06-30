'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Wallet, Users, Building2, ShoppingCart, ArrowRight, FileText, AlertTriangle } from 'lucide-react'

// ─── 타입 ────────────────────────────────────────────────

interface RevenueItem {
  id: string
  business_name: string | null
  service_type: string | null
  construction_date: string | null
  supply_amount: number | null
  vat: number | null
  payment_method: string | null
  total: number
}

interface PayrollRecord {
  id: string
  person_type: 'manager' | 'worker'
  person_id: string
  auto_amount: number
  final_amount: number | null
  is_paid: boolean
}

interface FinanceData {
  revenue: { total: number; items: RevenueItem[] }
  labor: { total: number; records: PayrollRecord[] }
  fixed: { total: number; records: { id: string; name: string; amount: number }[] }
  variable: { total: number; records: { id: string; name: string; amount: number }[] }
  net_profit: number
}

interface MonthlyTrend {
  month: string
  매출: number
  인건비: number
  고정비: number
  변동비: number
  순이익: number
}

// ─── 유틸 ────────────────────────────────────────────────

function todayMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const date = new Date(y, m - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-')
  return `${Number(y)}년 ${Number(m)}월`
}

function formatMonthShort(month: string): string {
  return `${Number(month.split('-')[1])}월`
}

function fmtKRW(n: number): string {
  return n.toLocaleString('ko-KR')
}

function fmtPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`
}

function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

const COST_COLORS = ['#6366f1', '#f59e0b', '#10b981']
const REVENUE_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#22c55e', '#f97316']

// ─── 메인 ────────────────────────────────────────────────

export default function FinanceDashboardPage() {
  const [month, setMonth] = useState<string>(todayMonth())
  const [current, setCurrent] = useState<FinanceData | null>(null)
  const [previous, setPrevious] = useState<FinanceData | null>(null)
  const [trends, setTrends] = useState<MonthlyTrend[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async (target: string) => {
    setLoading(true)
    setError(null)
    try {
      const months = Array.from({ length: 6 }, (_, i) => shiftMonth(target, -(5 - i)))
      const prevMonth = shiftMonth(target, -1)

      const results = await Promise.all(
        months.map(m => fetch(`/api/admin/finance?month=${m}`).then(r => r.json()))
      )

      const cur = results[results.length - 1] as FinanceData
      const prev = results.find((_, i) => months[i] === prevMonth) as FinanceData | undefined

      setCurrent(cur)
      setPrevious(prev ?? null)
      setTrends(months.map((m, i) => {
        const d = results[i] as FinanceData
        return {
          month: formatMonthShort(m),
          매출: d.revenue?.total ?? 0,
          인건비: d.labor?.total ?? 0,
          고정비: d.fixed?.total ?? 0,
          변동비: d.variable?.total ?? 0,
          순이익: d.net_profit ?? 0,
        }
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData(month) }, [month, loadData])

  const revenueDelta = useMemo(() => {
    if (!current || !previous) return null
    return deltaPercent(current.revenue.total, previous.revenue.total)
  }, [current, previous])

  const marginPct = useMemo(() => {
    if (!current || current.revenue.total === 0) return 0
    return (current.net_profit / current.revenue.total) * 100
  }, [current])

  const unpaidPayroll = useMemo(() => {
    if (!current) return { count: 0, total: 0 }
    const unpaid = current.labor.records.filter(r => !r.is_paid)
    const total = unpaid.reduce((s, r) => s + (r.final_amount ?? r.auto_amount), 0)
    return { count: unpaid.length, total }
  }, [current])

  const costBreakdown = useMemo(() => {
    if (!current) return []
    return [
      { name: '인건비', value: current.labor.total, color: COST_COLORS[0] },
      { name: '고정비', value: current.fixed.total, color: COST_COLORS[1] },
      { name: '변동비', value: current.variable.total, color: COST_COLORS[2] },
    ].filter(i => i.value > 0)
  }, [current])

  const revenueByService = useMemo(() => {
    if (!current) return []
    const map = new Map<string, number>()
    current.revenue.items.forEach(it => {
      const key = it.service_type ?? '미분류'
      map.set(key, (map.get(key) ?? 0) + it.total)
    })
    return Array.from(map.entries())
      .map(([name, value], i) => ({ name, value, color: REVENUE_COLORS[i % REVENUE_COLORS.length] }))
      .sort((a, b) => b.value - a.value)
  }, [current])

  return (
    <div className="min-h-screen bg-surface-sunken pb-16">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">

        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-text-primary">재무 대시보드</h1>
            <p className="text-sm text-text-secondary mt-1">{formatMonthLabel(month)} 한눈에 보기</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-surface border border-border rounded-lg overflow-hidden">
              <button onClick={() => setMonth(shiftMonth(month, -1))} className="px-2 py-2 hover:bg-surface-sunken transition" aria-label="이전 달">
                <ChevronLeft size={16} />
              </button>
              <span className="px-3 py-2 text-sm font-medium text-text-primary min-w-[110px] text-center">{formatMonthLabel(month)}</span>
              <button onClick={() => setMonth(shiftMonth(month, 1))} className="px-2 py-2 hover:bg-surface-sunken transition" aria-label="다음 달">
                <ChevronRight size={16} />
              </button>
            </div>
            <Link href="/admin/finance/details" className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg transition">
              <FileText size={14} />
              상세 내역
            </Link>
          </div>
        </header>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {loading && (
          <div className="text-center py-16 text-text-tertiary">불러오는 중...</div>
        )}

        {!loading && current && (
          <>
            <section className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
              <KpiCard
                title="매출"
                value={fmtKRW(current.revenue.total)}
                unit="원"
                icon={<TrendingUp size={18} />}
                delta={revenueDelta}
                color="blue"
              />
              <KpiCard
                title="인건비"
                value={fmtKRW(current.labor.total)}
                unit="원"
                icon={<Users size={18} />}
                color="indigo"
                subtext={unpaidPayroll.count > 0 ? `미지급 ${unpaidPayroll.count}건` : '전체 지급완료'}
                subtextColor={unpaidPayroll.count > 0 ? 'warning' : 'success'}
              />
              <KpiCard
                title="고정비"
                value={fmtKRW(current.fixed.total)}
                unit="원"
                icon={<Building2 size={18} />}
                color="amber"
              />
              <KpiCard
                title="변동비"
                value={fmtKRW(current.variable.total)}
                unit="원"
                icon={<ShoppingCart size={18} />}
                color="emerald"
              />
              <KpiCard
                title="순이익"
                value={fmtKRW(current.net_profit)}
                unit="원"
                icon={current.net_profit >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                color={current.net_profit >= 0 ? 'green' : 'red'}
                highlight
              />
              <KpiCard
                title="수익률"
                value={fmtPct(marginPct)}
                icon={<Wallet size={18} />}
                color={marginPct >= 20 ? 'green' : marginPct >= 10 ? 'amber' : 'red'}
                subtext={marginPct >= 20 ? '양호' : marginPct >= 10 ? '주의' : '개선 필요'}
                subtextColor={marginPct >= 20 ? 'success' : marginPct >= 10 ? 'warning' : 'danger'}
              />
            </section>

            {unpaidPayroll.count > 0 && (
              <Link
                href={`/admin/payroll?month=${month}`}
                className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-2xl hover:bg-amber-100 transition"
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle size={20} className="text-amber-600" />
                  <div>
                    <p className="font-semibold text-text-primary">미지급 인건비 {unpaidPayroll.count}건</p>
                    <p className="text-xs text-text-secondary mt-0.5">총 {fmtKRW(unpaidPayroll.total)}원 — 급여정산에서 처리</p>
                  </div>
                </div>
                <ArrowRight size={18} className="text-text-secondary" />
              </Link>
            )}

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="최근 6개월 추이" subtitle="매출 · 인건비 · 순이익">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={trends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" stroke="#6b7280" fontSize={12} />
                    <YAxis stroke="#6b7280" fontSize={11} tickFormatter={v => `${(v / 10000).toFixed(0)}만`} />
                    <Tooltip
                      formatter={(v) => [`${fmtKRW(Number(v))}원`]}
                      labelStyle={{ color: '#111827', fontWeight: 600 }}
                      contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="매출" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="인건비" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="순이익" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="이번 달 비용 구성" subtitle="인건비 · 고정비 · 변동비">
                {costBreakdown.length === 0 ? (
                  <EmptyChart message="비용 데이터가 없습니다" />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={costBreakdown}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        innerRadius={50}
                        label={(entry: { name?: string; percent?: number }) =>
                          `${entry.name} ${((entry.percent ?? 0) * 100).toFixed(0)}%`
                        }
                        labelLine={false}
                      >
                        {costBreakdown.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [`${fmtKRW(Number(v))}원`]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="서비스 유형별 매출" subtitle="이번 달 매출 분포" className="lg:col-span-2">
                {revenueByService.length === 0 ? (
                  <EmptyChart message="매출 데이터가 없습니다" />
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(160, revenueByService.length * 50)}>
                    <BarChart data={revenueByService} layout="vertical" margin={{ top: 10, right: 30, left: 80, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" stroke="#6b7280" fontSize={11} tickFormatter={v => `${(v / 10000).toFixed(0)}만`} />
                      <YAxis type="category" dataKey="name" stroke="#6b7280" fontSize={12} width={80} />
                      <Tooltip formatter={(v) => [`${fmtKRW(Number(v))}원`]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                        {revenueByService.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <ActionCard
                href="/admin/finance/details"
                title="매출·비용 상세 입력"
                desc="고정비/변동비 추가, 매출 항목 필터링"
                icon={<FileText size={18} />}
              />
              <ActionCard
                href={`/admin/payroll?month=${month}`}
                title="급여정산 바로가기"
                desc="이번 달 담당자/작업자 급여 확인 및 지급 처리"
                icon={<Users size={18} />}
              />
            </section>
          </>
        )}
      </div>
    </div>
  )
}

// ─── 카드 컴포넌트 ──────────────────────────────────────

const KPI_COLOR: Record<string, { bg: string; icon: string; border: string }> = {
  blue: { bg: 'bg-blue-50', icon: 'text-blue-600', border: 'border-blue-100' },
  indigo: { bg: 'bg-indigo-50', icon: 'text-indigo-600', border: 'border-indigo-100' },
  amber: { bg: 'bg-amber-50', icon: 'text-amber-600', border: 'border-amber-100' },
  emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', border: 'border-emerald-100' },
  green: { bg: 'bg-green-50', icon: 'text-green-600', border: 'border-green-100' },
  red: { bg: 'bg-red-50', icon: 'text-red-600', border: 'border-red-100' },
}

function KpiCard({
  title, value, unit, icon, delta, color = 'blue', highlight, subtext, subtextColor,
}: {
  title: string
  value: string
  unit?: string
  icon: React.ReactNode
  delta?: number | null
  color?: keyof typeof KPI_COLOR
  highlight?: boolean
  subtext?: string
  subtextColor?: 'success' | 'warning' | 'danger'
}) {
  const c = KPI_COLOR[color] ?? KPI_COLOR.blue
  const subtextClass = subtextColor === 'success'
    ? 'text-green-600'
    : subtextColor === 'warning'
      ? 'text-amber-600'
      : subtextColor === 'danger'
        ? 'text-red-600'
        : 'text-text-tertiary'

  return (
    <div className={`${c.bg} ${c.border} border rounded-2xl p-4 ${highlight ? 'md:col-span-2 lg:col-span-1 shadow-soft' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-text-secondary">{title}</span>
        <span className={c.icon}>{icon}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl md:text-2xl font-bold text-text-primary">{value}</span>
        {unit && <span className="text-xs text-text-tertiary">{unit}</span>}
      </div>
      {delta !== undefined && delta !== null && (
        <div className={`text-xs mt-1 font-medium ${delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {delta >= 0 ? '▲' : '▼'} 전월대비 {Math.abs(delta).toFixed(1)}%
        </div>
      )}
      {subtext && (
        <div className={`text-xs mt-1 font-medium ${subtextClass}`}>{subtext}</div>
      )}
    </div>
  )
}

function ChartCard({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface border border-border rounded-2xl p-4 md:p-5 shadow-soft ${className ?? ''}`}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {subtitle && <p className="text-xs text-text-tertiary mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function ActionCard({ href, title, desc, icon }: { href: string; title: string; desc: string; icon: React.ReactNode }) {
  return (
    <Link href={href} className="group flex items-center gap-3 p-4 bg-surface border border-border rounded-2xl hover:border-brand-300 hover:shadow-card transition">
      <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text-primary">{title}</p>
        <p className="text-xs text-text-tertiary mt-0.5 truncate">{desc}</p>
      </div>
      <ArrowRight size={16} className="text-text-tertiary group-hover:text-brand-600 transition" />
    </Link>
  )
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-[260px] flex items-center justify-center text-sm text-text-tertiary">
      {message}
    </div>
  )
}
