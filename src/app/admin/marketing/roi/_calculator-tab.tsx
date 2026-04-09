'use client'

import { useState } from 'react'
import { won } from './_roi-utils'

interface CalcState {
  monthlyFee: number
  contractMonths: number
  year2Discount: number
  year3Discount: number
  monthlyMarketingCost: number
  newContracts: number
}

const DEFAULTS: CalcState = {
  monthlyFee: 99000,
  contractMonths: 36,
  year2Discount: 15,
  year3Discount: 25,
  monthlyMarketingCost: 1000000,
  newContracts: 5,
}

function Row({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-3 border-b border-gray-50 ${highlight ? 'bg-blue-50 -mx-5 px-5 rounded' : ''}`}>
      <span className="text-sm text-gray-600">{label}</span>
      <div className="text-right">
        <span className={`font-bold ${highlight ? 'text-blue-700 text-lg' : 'text-gray-800'}`}>{value}</span>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  )
}

function InputField({ label, value, onChange, unit, hint }: {
  label: string; value: number; onChange: (v: number) => void; unit?: string; hint?: string
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1.5">{label}</label>
      <div className="relative">
        <input
          type="number" value={value}
          onChange={e => onChange(+e.target.value || 0)}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-blue-50 focus:outline-none focus:ring-2 focus:ring-brand-300 pr-10"
        />
        {unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{unit}</span>}
      </div>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

export function CalculatorTab() {
  const [calc, setCalc] = useState<CalcState>(DEFAULTS)

  const upd = (field: keyof CalcState) => (v: number) => setCalc(c => ({ ...c, [field]: v }))

  const ltv1 = calc.monthlyFee * 12
  const ltv2 = ltv1 + calc.monthlyFee * 12 * (1 - calc.year2Discount / 100)
  const ltv3 = ltv2 + calc.monthlyFee * 12 * (1 - calc.year3Discount / 100)
  const cac = calc.newContracts > 0 ? calc.monthlyMarketingCost / calc.newContracts : 0
  const ltvCac1 = cac > 0 ? ltv1 / cac : 0
  const ltvCac3 = cac > 0 ? ltv3 / cac : 0
  const payback = calc.monthlyFee > 0 ? cac / calc.monthlyFee : 0
  const targetSubscribers = 25
  const targetMRR = targetSubscribers * calc.monthlyFee

  function ltvRating(ratio: number) {
    if (ratio >= 5) return { label: '매우 우수', color: 'text-emerald-600' }
    if (ratio >= 3) return { label: '우수', color: 'text-green-600' }
    if (ratio >= 1) return { label: '보통', color: 'text-amber-600' }
    return { label: '주의 (손해)', color: 'text-red-600' }
  }

  const rating = ltvRating(ltvCac3)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* 입력 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 mb-4">구독 플랜 설정</h2>
        <div className="space-y-4">
          <InputField label="월 계약금 (원)" value={calc.monthlyFee} onChange={upd('monthlyFee')} unit="원"
            hint="기본: 99,000원 / 딥케어: 124,000원" />
          <InputField label="예상 계약 유지 개월" value={calc.contractMonths} onChange={upd('contractMonths')} unit="개월"
            hint="평균 유지: 36개월 (3년)" />
          <InputField label="2년차 할인율" value={calc.year2Discount} onChange={upd('year2Discount')} unit="%"
            hint="기본: 15% 할인" />
          <InputField label="3년차 할인율" value={calc.year3Discount} onChange={upd('year3Discount')} unit="%"
            hint="기본: 25% 할인" />
        </div>

        <h2 className="font-semibold text-gray-800 mt-6 mb-4">마케팅 비용 설정</h2>
        <div className="space-y-4">
          <InputField label="월 총 마케팅 비용 (원)" value={calc.monthlyMarketingCost} onChange={upd('monthlyMarketingCost')} unit="원"
            hint="모든 채널 합산 비용" />
          <InputField label="월 신규 계약 건수" value={calc.newContracts} onChange={upd('newContracts')} unit="건"
            hint="이 비용으로 획득한 신규 계약 수" />
        </div>
      </div>

      {/* 결과 */}
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-2">LTV 계산 결과</h2>
          <p className="text-xs text-gray-400 mb-4">고객 1명이 기간 동안 가져다주는 총 가치</p>
          <Row label="LTV 1년" value={won(ltv1)} sub={`${calc.monthlyFee.toLocaleString()}원 × 12개월`} />
          <Row label="LTV 2년 누적" value={won(ltv2)} sub={`2년차 ${calc.year2Discount}% 할인 적용`} />
          <Row label="LTV 3년 누적" value={won(ltv3)} sub={`3년차 ${calc.year3Discount}% 할인 적용`} highlight />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-2">수익성 분석</h2>
          <Row label="CAC" value={won(cac)} sub={`${won(calc.monthlyMarketingCost)} ÷ ${calc.newContracts}건`} />
          <Row label="LTV/CAC (1년)" value={ltvCac1 > 0 ? `${ltvCac1.toFixed(1)}x` : '-'} />
          <Row label="LTV/CAC (3년)" value={ltvCac3 > 0 ? `${ltvCac3.toFixed(1)}x` : '-'} highlight />
          <Row label="CAC 회수 기간" value={payback > 0 ? `${payback.toFixed(1)}개월` : '-'} />

          {ltvCac3 > 0 && (
            <div className={`mt-4 p-3 rounded-lg ${rating.color.includes('emerald') || rating.color.includes('green') ? 'bg-emerald-50' : rating.color.includes('amber') ? 'bg-amber-50' : 'bg-red-50'}`}>
              <p className={`font-bold ${rating.color}`}>종합 평가: {rating.label}</p>
              <p className="text-xs text-gray-500 mt-1">
                {ltvCac3 >= 5 ? '마케팅 투자를 늘려도 좋습니다. 채널 확장을 검토하세요.' :
                 ltvCac3 >= 3 ? '양호한 수준입니다. CPL 낮추기와 전환율 개선에 집중하세요.' :
                 ltvCac3 >= 1 ? '개선이 필요합니다. 비효율 채널을 줄이고 전환율을 높이세요.' :
                 '마케팅 비용 대비 수익이 부족합니다. 즉시 채널 전략을 재검토하세요.'}
              </p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-2">목표 달성 시뮬레이션</h2>
          <Row label="목표 구독 고객" value="25개 업체" />
          <Row label="목표 MRR" value={won(targetMRR)} sub={`25 × ${won(calc.monthlyFee)}`} highlight />
          <Row label="필요 신규 계약 (현재 이탈 0 가정)" value={`${targetSubscribers}건`} />
          <Row label="총 필요 마케팅 비용 추정" value={won(cac * targetSubscribers)} sub={`CAC ${won(cac)} × 25`} />
        </div>
      </div>
    </div>
  )
}
