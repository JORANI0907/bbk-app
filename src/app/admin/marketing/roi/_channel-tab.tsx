'use client'

import { CHANNELS, TIPS, won, pct, calcChannel, calcTotals, type MonthData, type ChannelData } from './_roi-utils'

function Tip({ content }: { content: string }) {
  return (
    <div className="relative group inline-flex">
      <span className="text-gray-400 cursor-help text-xs">❓</span>
      <div className="hidden group-hover:block absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 bg-gray-900 text-white text-xs p-3 rounded-lg shadow-xl whitespace-pre-line leading-relaxed pointer-events-none">
        {content}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
      </div>
    </div>
  )
}

interface Props {
  data: MonthData
  onChange: (data: MonthData) => void
}

export function ChannelTab({ data, onChange }: Props) {
  function updateChannel(ch: string, field: keyof ChannelData, val: number) {
    onChange({
      ...data,
      channels: {
        ...data.channels,
        [ch]: { ...data.channels[ch], [field]: val },
      },
    })
  }

  const totals = calcTotals(data)

  const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-right focus:outline-none focus:ring-2 focus:ring-brand-300 bg-blue-50'
  const autoCls = 'w-full text-sm text-gray-600 text-right py-1.5 px-2 bg-gray-50 rounded-lg'

  return (
    <div className="space-y-6">
      {/* 채널별 입력 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">채널별 성과 입력</h2>
          <p className="text-xs text-gray-400 mt-0.5">파란 셀에 수치 입력 → CPL·CAC·전환율·ROAS 자동 계산</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500">
                <th className="text-left px-4 py-3 font-medium w-36">채널</th>
                <th className="px-3 py-3 font-medium text-right">
                  <div className="flex items-center justify-end gap-1">월 비용 (원) <Tip content="해당 채널에 지출한 총 비용\n현금 비용 + 시간 비용 포함\n블로그: 작성 시간 × 5만원" /></div>
                </th>
                <th className="px-3 py-3 font-medium text-right">
                  <div className="flex items-center justify-end gap-1">문의 건수 <Tip content="해당 채널에서 온 문의/견적 요청 수\n'어디서 알고 오셨어요?' 필수 확인" /></div>
                </th>
                <th className="px-3 py-3 font-medium text-right">
                  <div className="flex items-center justify-end gap-1">계약 건수 <Tip content="해당 채널 문의 중 실제 계약 성사 건수" /></div>
                </th>
                <th className="px-3 py-3 font-medium text-right">
                  <div className="flex items-center justify-end gap-1">평균 월 계약금 <Tip content="이 채널에서 계약된 건들의 평균 월 계약금\n기본: 9.9만원 / 딥케어: 12.4만원" /></div>
                </th>
                <th className="px-3 py-3 font-medium text-right text-emerald-600">
                  <div className="flex items-center justify-end gap-1">CPL <Tip content={TIPS.cpl} /></div>
                </th>
                <th className="px-3 py-3 font-medium text-right text-emerald-600">
                  <div className="flex items-center justify-end gap-1">CAC <Tip content={TIPS.cac} /></div>
                </th>
                <th className="px-3 py-3 font-medium text-right text-emerald-600">
                  <div className="flex items-center justify-end gap-1">전환율 <Tip content={TIPS.conversion} /></div>
                </th>
                <th className="px-3 py-3 font-medium text-right text-emerald-600">
                  <div className="flex items-center justify-end gap-1">ROAS <Tip content={TIPS.roas} /></div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {CHANNELS.map(ch => {
                const c = data.channels[ch] ?? { cost: 0, inquiries: 0, contracts: 0, avgFee: 99000 }
                const m = calcChannel(c)
                return (
                  <tr key={ch} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-700">{ch}</td>
                    <td className="px-3 py-2">
                      <input type="number" value={c.cost || ''} placeholder="0"
                        onChange={e => updateChannel(ch, 'cost', +e.target.value || 0)}
                        className={inputCls} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" value={c.inquiries || ''} placeholder="0"
                        onChange={e => updateChannel(ch, 'inquiries', +e.target.value || 0)}
                        className={inputCls} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" value={c.contracts || ''} placeholder="0"
                        onChange={e => updateChannel(ch, 'contracts', +e.target.value || 0)}
                        className={inputCls} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" value={c.avgFee || ''} placeholder="99000"
                        onChange={e => updateChannel(ch, 'avgFee', +e.target.value || 99000)}
                        className={inputCls} />
                    </td>
                    <td className="px-3 py-2"><div className={autoCls}>{won(m.cpl)}</div></td>
                    <td className="px-3 py-2"><div className={autoCls}>{won(m.cac)}</div></td>
                    <td className="px-3 py-2"><div className={autoCls}>{pct(m.conversion)}</div></td>
                    <td className="px-3 py-2"><div className={autoCls}>{pct(m.roas)}</div></td>
                  </tr>
                )
              })}

              {/* 합계 행 */}
              <tr className="bg-blue-50 font-semibold text-sm">
                <td className="px-4 py-3 text-blue-800">합계 / 평균</td>
                <td className="px-3 py-3 text-right text-blue-800">{totals.totalCost > 0 ? `₩${totals.totalCost.toLocaleString()}` : '-'}</td>
                <td className="px-3 py-3 text-right text-blue-800">{totals.totalInq || '-'}</td>
                <td className="px-3 py-3 text-right text-blue-800">{totals.totalContracts || '-'}</td>
                <td className="px-3 py-3 text-right text-gray-500 font-normal text-xs">-</td>
                <td className="px-3 py-3 text-right text-emerald-700">{won(totals.cpl)}</td>
                <td className="px-3 py-3 text-right text-emerald-700">{won(totals.cac)}</td>
                <td className="px-3 py-3 text-right text-emerald-700">{pct(totals.conversion)}</td>
                <td className="px-3 py-3 text-right text-emerald-700">{pct(totals.roas)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 구독·이탈 입력 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 mb-4">구독 현황 입력</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1.5">
              <div className="flex items-center gap-1">구독 고객 수 (업체) <Tip content={TIPS.mrr} /></div>
            </label>
            <input type="number" value={data.subscribers || ''} placeholder="0"
              onChange={e => onChange({ ...data, subscribers: +e.target.value || 0 })}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-blue-50 focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1.5">
              <div className="flex items-center gap-1">이번 달 해지 건수 <Tip content={TIPS.churn} /></div>
            </label>
            <input type="number" value={data.churnCount || ''} placeholder="0"
              onChange={e => onChange({ ...data, churnCount: +e.target.value || 0 })}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-blue-50 focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1.5">
              <div className="flex items-center gap-1">MRR (월 고정 수익) <Tip content={TIPS.mrr} /></div>
            </label>
            <input type="number" value={data.mrr || ''} placeholder="0"
              onChange={e => onChange({ ...data, mrr: +e.target.value || 0 })}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-blue-50 focus:outline-none focus:ring-2 focus:ring-brand-300" />
            <p className="text-xs text-gray-400 mt-1">직접 입력하거나 자동 계산 참고</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-1">MRR 자동 추정</p>
            <p className="text-lg font-bold text-gray-800">
              {totals.totalContracts > 0
                ? `₩${Math.round(totals.avgFee * data.subscribers).toLocaleString()}`
                : '-'}
            </p>
            <p className="text-xs text-gray-400">{data.subscribers}개 × ₩{Math.round(totals.avgFee).toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* 범례 */}
      <div className="flex gap-4 text-xs text-gray-400">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-blue-100 rounded border border-blue-200" /><span>직접 입력</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-gray-100 rounded" /><span>자동 계산</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-blue-50 rounded border border-blue-300" /><span>합계</span></div>
      </div>
    </div>
  )
}
