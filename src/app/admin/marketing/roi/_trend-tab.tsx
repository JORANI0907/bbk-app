'use client'

import { calcTotals, won, pct, type AllData } from './_roi-utils'

interface Props {
  allData: AllData
  year: number
}

const MONTH_LABELS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

function MiniLineChart({ values, color, goal }: { values: (number | null)[]; color: string; goal?: number }) {
  const valid = values.filter((v): v is number => v !== null && v > 0)
  if (valid.length < 2) {
    return <div className="h-20 flex items-center justify-center text-xs text-gray-300">데이터 부족</div>
  }
  const max = Math.max(...valid, goal ?? 0) * 1.15
  const w = 280, h = 64
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = v !== null && v > 0 ? h - (v / max) * h : null
    return { x, y }
  })
  const linePts = pts.filter(p => p.y !== null).map(p => `${p.x},${p.y}`).join(' ')

  return (
    <svg viewBox={`0 0 ${w} ${h + 4}`} className="w-full" style={{ height: 72 }}>
      {goal && (
        <line x1="0" y1={h - (goal / max) * h} x2={w} y2={h - (goal / max) * h}
          stroke="#d1d5db" strokeWidth="1" strokeDasharray="4,3" />
      )}
      <polyline points={linePts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => p.y !== null && (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />
      ))}
    </svg>
  )
}

function BarChart({ values, labels, color, goal, formatFn }: {
  values: (number | null)[]
  labels: string[]
  color: string
  goal?: number
  formatFn: (n: number) => string
}) {
  const valid = values.filter((v): v is number => v !== null && v > 0)
  if (valid.length === 0) return <div className="h-32 flex items-center justify-center text-xs text-gray-300">데이터 없음</div>
  const max = Math.max(...valid, goal ?? 0) * 1.2

  return (
    <div className="space-y-2">
      {values.map((v, i) => {
        if (v === null || v === 0) return null
        const w = Math.min((v / max) * 100, 100)
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-6 text-right">{labels[i]}</span>
            <div className="flex-1 h-5 bg-gray-100 rounded-full relative">
              <div className="h-5 rounded-full transition-all" style={{ width: `${w}%`, backgroundColor: color }} />
              {goal && (
                <div className="absolute top-0 h-5 border-r-2 border-dashed border-gray-400"
                  style={{ left: `${Math.min((goal / max) * 100, 100)}%` }} />
              )}
            </div>
            <span className="text-xs text-gray-600 w-20 text-right">{formatFn(v)}</span>
          </div>
        )
      })}
    </div>
  )
}

export function TrendTab({ allData, year }: Props) {
  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const keys = months.map(m => `${year}-${m}`)
  const metricsArr = keys.map(k => allData[k] ? calcTotals(allData[k]) : null)

  const mrrs   = metricsArr.map(m => m?.mrr ?? null)
  const cpls   = metricsArr.map(m => m?.cpl ?? null)
  const cacs   = metricsArr.map(m => m?.cac ?? null)
  const convs  = metricsArr.map(m => m?.conversion ?? null)
  const subs   = keys.map(k => allData[k]?.subscribers ?? null)

  // Only show months with data
  const dataMonths = months.filter(m => allData[`${year}-${m}`])
  const labels = dataMonths.map(m => `${m}월`)

  const mrrVals  = dataMonths.map(m => allData[`${year}-${m}`] ? calcTotals(allData[`${year}-${m}`]).mrr : null)
  const cplVals  = dataMonths.map(m => allData[`${year}-${m}`] ? calcTotals(allData[`${year}-${m}`]).cpl : null)
  const cacVals  = dataMonths.map(m => allData[`${year}-${m}`] ? calcTotals(allData[`${year}-${m}`]).cac : null)
  const convVals = dataMonths.map(m => allData[`${year}-${m}`] ? calcTotals(allData[`${year}-${m}`]).conversion : null)
  const subVals  = dataMonths.map(m => allData[`${year}-${m}`]?.subscribers ?? null)

  if (dataMonths.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
        <p className="text-gray-400">채널별 입력 탭에서 데이터를 입력하면 추이 차트가 나타납니다.</p>
      </div>
    )
  }

  const charts = [
    { title: 'MRR (월 고정 수익)', subtitle: '목표: ₩3,750,000', values: mrrVals, color: '#2563eb', goal: 3750000, fmt: won },
    { title: '구독 고객 수',       subtitle: '목표: 25개 업체',   values: subVals, color: '#7c3aed', goal: 25,      fmt: (n: number) => `${n}개` },
    { title: 'CPL (리드 비용)',    subtitle: '목표: ₩30,000 이하', values: cplVals, color: '#059669', goal: 30000,   fmt: won },
    { title: 'CAC (고객 획득 비용)', subtitle: '목표: ₩200,000 이하', values: cacVals, color: '#d97706', goal: 200000, fmt: won },
    { title: '전환율',             subtitle: '목표: 30% 이상',    values: convVals, color: '#dc2626', goal: 30,      fmt: pct },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {charts.map(chart => (
          <div key={chart.title} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="mb-3">
              <h3 className="font-semibold text-gray-800 text-sm">{chart.title}</h3>
              <p className="text-xs text-gray-400">{chart.subtitle}</p>
            </div>
            <MiniLineChart
              values={chart.values as (number | null)[]}
              color={chart.color}
              goal={chart.goal}
            />
            <div className="mt-3 border-t border-gray-50 pt-3">
              <BarChart
                values={chart.values as (number | null)[]}
                labels={labels}
                color={chart.color}
                goal={chart.goal}
                formatFn={chart.fmt}
              />
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
              <div className="flex items-center gap-1">
                <div className="w-6 h-0 border-t-2 border-dashed border-gray-400" />
                <span>목표</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
