'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  GOALS, TIPS, SAMPLE_DATA,
  won, pct,
  defaultMonthData, calcTotals, calcChannel, achievementRate, rateColors,
  type AllData, type MonthData,
} from './_roi-utils'
import { ChannelTab } from './_channel-tab'
import { TrendTab } from './_trend-tab'
import { CalculatorTab } from './_calculator-tab'

const STORAGE_KEY = 'bbk_roi_data'

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function Tip({ content }: { content: string }) {
  return (
    <div className="relative group inline-flex">
      <span className="text-gray-400 cursor-help text-xs ml-0.5">❓</span>
      <div className="hidden group-hover:block absolute z-50 bottom-full left-0 mb-2 w-64 bg-gray-900 text-white text-xs p-3 rounded-lg shadow-xl whitespace-pre-line leading-relaxed pointer-events-none">
        {content}
        <div className="absolute top-full left-3 border-4 border-transparent border-t-gray-900" />
      </div>
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, goalKey, rawValue }: {
  label: string; value: string; goalKey: string; rawValue: number
}) {
  const rate = achievementRate(rawValue, goalKey)
  const g = GOALS[goalKey]
  const c = rateColors(rate)

  return (
    <div className={`rounded-2xl border shadow-sm p-4 ${c.bg} ${c.border}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1 text-xs font-medium text-gray-600">
          {label}
          <Tip content={TIPS[goalKey] ?? ''} />
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${rate >= 100 ? 'bg-emerald-100 text-emerald-700' : rate >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
          {rawValue > 0 ? `${Math.round(rate)}%` : '-'}
        </span>
      </div>
      <p className={`text-2xl font-bold ${c.text}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-1">{g?.label}</p>
      <div className="mt-3 h-1.5 bg-white/60 rounded-full overflow-hidden">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${c.bar}`}
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
      </div>
    </div>
  )
}

// ─── Report Tab ───────────────────────────────────────────────────────────────

function ReportTab({ data, year, month }: { data: MonthData; year: number; month: number }) {
  const [report, setReport] = useState('')
  const [loading, setLoading] = useState(false)

  const totals = calcTotals(data)
  const channelMetrics = Object.fromEntries(
    Object.entries(data.channels).map(([ch, c]) => [ch, { ...calcChannel(c), cost: c.cost, contracts: c.contracts }])
  )

  async function generate() {
    if (totals.totalCost === 0) {
      toast.error('채널별 입력 탭에서 데이터를 먼저 입력해주세요.')
      return
    }
    setLoading(true)
    setReport('')
    try {
      const res = await fetch('/api/marketing/roi-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, totals, channels: channelMetrics }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? '보고서 생성 실패')
      }
      const { report: text } = await res.json()
      setReport(text)
      toast.success('보고서가 생성됐어요!')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '오류가 발생했어요.')
    } finally {
      setLoading(false)
    }
  }

  // Simple markdown renderer
  function renderReport(text: string) {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('### ')) return <h3 key={i} className="font-bold text-gray-800 text-sm mt-4 mb-1">{line.slice(4)}</h3>
      if (line.startsWith('## '))  return <h2 key={i} className="font-bold text-gray-900 text-base mt-5 mb-2">{line.slice(3)}</h2>
      if (line.startsWith('- '))   return <li key={i} className="text-sm text-gray-700 ml-4 list-disc">{line.slice(2)}</li>
      if (/^\d+\./.test(line))     return <li key={i} className="text-sm text-gray-700 ml-4 list-decimal">{line.replace(/^\d+\.\s*/, '')}</li>
      if (line.trim() === '')      return <div key={i} className="h-2" />
      return <p key={i} className="text-sm text-gray-700 leading-relaxed">{line.replace(/\*\*(.*?)\*\*/g, '$1')}</p>
    })
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">AI 월간 보고서</h2>
            <p className="text-xs text-gray-400 mt-0.5">Claude가 {year}년 {month}월 데이터를 분석해 보고서를 작성합니다</p>
          </div>
          <button
            onClick={generate}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                분석 중...
              </>
            ) : '📊 보고서 생성'}
          </button>
        </div>

        {totals.totalCost === 0 && (
          <div className="mt-4 p-3 bg-amber-50 rounded-xl text-xs text-amber-700">
            ⚠️ 채널별 입력 탭에서 이번 달 데이터를 먼저 입력해주세요.
          </div>
        )}
      </div>

      {report && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">{year}년 {month}월 마케팅 성과 보고서</h3>
            <button
              onClick={() => { navigator.clipboard.writeText(report); toast.success('복사됐어요!') }}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-50"
            >
              복사
            </button>
          </div>
          <div className="prose prose-sm max-w-none">
            {renderReport(report)}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'dashboard', label: '대시보드' },
  { key: 'channels',  label: '채널별 입력' },
  { key: 'trends',    label: '월간 추이' },
  { key: 'calc',      label: 'LTV 계산기' },
  { key: 'report',    label: 'AI 보고서' },
]

export default function MarketingROIPage() {
  const now = new Date()
  const [year, setYear]         = useState(now.getFullYear())
  const [month, setMonth]       = useState(now.getMonth() + 1)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [allData, setAllData]   = useState<AllData>({})
  const [loaded, setLoaded]     = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      setAllData(raw ? JSON.parse(raw) : SAMPLE_DATA)
    } catch {
      setAllData(SAMPLE_DATA)
    }
    setLoaded(true)
  }, [])

  const key = `${year}-${month}`
  const data: MonthData = allData[key] ?? defaultMonthData()
  const totals = calcTotals(data)

  const update = useCallback((newData: MonthData) => {
    setAllData(prev => {
      const next = { ...prev, [key]: newData }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* quota */ }
      return next
    })
  }, [key])

  if (!loaded) {
    return <div className="flex justify-center py-12"><div className="w-7 h-7 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
  }

  const kpiCards = [
    { label: 'CAC',       goalKey: 'cac',        value: won(totals.cac),              rawValue: totals.cac },
    { label: 'LTV/CAC',   goalKey: 'ltv_cac',    value: totals.ltv_cac > 0 ? `${totals.ltv_cac.toFixed(1)}x` : '-', rawValue: totals.ltv_cac },
    { label: 'ROAS',      goalKey: 'roas',        value: pct(totals.roas),             rawValue: totals.roas },
    { label: 'CPL',       goalKey: 'cpl',         value: won(totals.cpl),              rawValue: totals.cpl },
    { label: '전환율',    goalKey: 'conversion',  value: pct(totals.conversion),       rawValue: totals.conversion },
    { label: 'MRR',       goalKey: 'mrr',         value: won(totals.mrr),              rawValue: totals.mrr },
    { label: '이탈율',    goalKey: 'churn',       value: pct(totals.churn),            rawValue: totals.churn },
    { label: '회수 기간', goalKey: 'payback',     value: totals.payback > 0 ? `${totals.payback.toFixed(1)}개월` : '-', rawValue: totals.payback },
  ]

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">마케팅 ROI 성과</h1>
          <p className="text-sm text-gray-500 mt-0.5">채널별 비용 효율 및 핵심 지표 추적</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={e => setYear(+e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select
            value={month}
            onChange={e => setMonth(+e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m =>
              <option key={m} value={m}>{m}월</option>
            )}
          </select>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 대시보드 탭 */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* 요약 배너 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4 text-center">
              <div>
                <p className="text-xs text-gray-400">총 마케팅 비용</p>
                <p className="font-bold text-gray-900">{totals.totalCost > 0 ? `₩${totals.totalCost.toLocaleString()}` : '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">총 문의</p>
                <p className="font-bold text-gray-900">{totals.totalInq || '-'}건</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">신규 계약</p>
                <p className="font-bold text-gray-900">{totals.totalContracts || '-'}건</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">구독 고객</p>
                <p className="font-bold text-gray-900">{data.subscribers || '-'}개 업체</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">LTV (1년)</p>
                <p className="font-bold text-gray-900">{won(totals.ltv12)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">해지 건수</p>
                <p className={`font-bold ${data.churnCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>{data.churnCount}건</p>
              </div>
            </div>
          </div>

          {/* KPI 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {kpiCards.map(card => <KpiCard key={card.goalKey} {...card} />)}
          </div>

          {/* 채널별 비교 */}
          {totals.totalCost > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">채널별 효율 비교</h2>
                <p className="text-xs text-gray-400 mt-0.5">CPL 낮고 전환율 높은 채널에 집중하세요</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500">
                      <th className="text-left px-5 py-3 font-medium">채널</th>
                      <th className="text-right px-4 py-3 font-medium">비용</th>
                      <th className="text-right px-4 py-3 font-medium">CPL</th>
                      <th className="text-right px-4 py-3 font-medium">CAC</th>
                      <th className="text-right px-4 py-3 font-medium">전환율</th>
                      <th className="text-right px-4 py-3 font-medium">ROAS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {Object.entries(data.channels)
                      .filter(([, c]) => c.cost > 0)
                      .map(([ch, c]) => {
                        const m = calcChannel(c)
                        const convColor = m.conversion >= 30 ? 'text-emerald-600 font-semibold' : m.conversion >= 20 ? 'text-amber-600' : 'text-red-600'
                        return (
                          <tr key={ch} className="hover:bg-gray-50/50">
                            <td className="px-5 py-3 font-medium text-gray-700">{ch}</td>
                            <td className="px-4 py-3 text-right text-gray-600">{won(c.cost)}</td>
                            <td className="px-4 py-3 text-right text-gray-600">{won(m.cpl)}</td>
                            <td className="px-4 py-3 text-right text-gray-600">{won(m.cac)}</td>
                            <td className={`px-4 py-3 text-right ${convColor}`}>{pct(m.conversion)}</td>
                            <td className="px-4 py-3 text-right text-gray-600">{pct(m.roas)}</td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {totals.totalCost === 0 && (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
              <p className="text-gray-400 text-sm">채널별 입력 탭에서 이번 달 데이터를 입력하면 KPI가 표시됩니다.</p>
              <button
                onClick={() => setActiveTab('channels')}
                className="mt-3 text-sm text-brand-600 font-semibold hover:underline"
              >
                데이터 입력하러 가기 →
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'channels' && <ChannelTab data={data} onChange={update} />}
      {activeTab === 'trends'   && <TrendTab allData={allData} year={year} />}
      {activeTab === 'calc'     && <CalculatorTab />}
      {activeTab === 'report'   && <ReportTab data={data} year={year} month={month} />}
    </div>
  )
}
