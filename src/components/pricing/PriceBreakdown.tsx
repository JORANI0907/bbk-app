'use client'

/**
 * 계산 결과 — 산출 근거를 한 줄씩 보여 준다 (내부 원가는 접어 둠).
 * 입력을 바꾸면 달라진 줄에 색을 입히고 증감액을 붙인다. 다음 변경 때까지 유지.
 */
import { useEffect, useRef, useState } from 'react'
import type { CalcResult } from '@/lib/pricing/types'

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`
const signed = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(Math.round(n)).toLocaleString('ko-KR')}`

interface Line { key: string; label: string; value: string; num: number | null; strong?: boolean; muted?: boolean }

function buildLines(r: CalcResult, regular: boolean): Line[] {
  const lines: Line[] = [
    { key: 'hpw', label: `1명당 시간 (규모 ${r.base_hours_per_worker}시/1인 × 난이도 ${r.time_factor})`, value: `${r.hours_per_worker}시/1인`, num: r.hours_per_worker },
    { key: 'workers', label: '투입 인원', value: `${r.workers}명${r.workers_increased ? ' (자동 증원)' : ''}`, num: r.workers },
    { key: 'hours', label: '총 작업시간 (인원 × 시/1인)', value: `${r.total_hours}시간`, num: r.total_hours },
    { key: 'gross', label: '총 작업시간 × 시간당 단가', value: won(r.gross), num: r.gross },
  ]
  if (r.extra_worker_discount > 0) lines.push({ key: 'extra', label: '추가 인원 할인', value: `− ${won(r.extra_worker_discount)}`, num: -r.extra_worker_discount })
  if (r.capped_by_max_revenue) lines.push({ key: 'cap', label: '1인 상한 적용', value: won(r.onetime_amount), num: r.onetime_amount, muted: true })
  lines.push({ key: 'onetime', label: '1회성 산출 금액', value: won(r.onetime_amount), num: r.onetime_amount, strong: true })
  if (regular) lines.push({ key: 'regular', label: `정기 계수 × ${r.regular_factor}`, value: won(r.per_visit_amount), num: r.per_visit_amount })
  r.surcharges.forEach((l) => lines.push({ key: `s:${l.label}`, label: `할증 · ${l.label}`, value: `+ ${won(l.amount)}`, num: l.amount }))
  r.discounts.forEach((l) => lines.push({ key: `d:${l.label}`, label: `할인 · ${l.label}`, value: `− ${won(l.amount)}`, num: -l.amount }))
  if (r.rounding_discount > 0) lines.push({ key: 'round', label: '잔돈 할인', value: `− ${won(r.rounding_discount)}`, num: -r.rounding_discount, muted: true })
  lines.push({ key: 'supply', label: '공급가액', value: won(r.supply_amount), num: r.supply_amount, strong: true })
  lines.push({ key: 'vat', label: '부가세 10%', value: won(r.vat_amount), num: r.vat_amount })
  lines.push({ key: 'total', label: regular ? '회당 총액' : '총액', value: won(r.total_amount), num: r.total_amount, strong: true })
  if (regular && r.monthly_amount != null) lines.push({ key: 'monthly', label: '월 금액', value: won(r.monthly_amount), num: r.monthly_amount })
  if (regular && r.annual_amount != null) lines.push({ key: 'annual', label: '계약기간 합계', value: won(r.annual_amount), num: r.annual_amount })
  return lines
}

type Change = { delta: number; kind: 'up' | 'down' | 'new' }

function diffLines(prev: Line[] | null, next: Line[]): Record<string, Change> {
  if (!prev) return {}
  const before = new Map(prev.map((l) => [l.key, l.num]))
  const out: Record<string, Change> = {}
  for (const l of next) {
    if (!before.has(l.key)) { out[l.key] = { delta: l.num ?? 0, kind: 'new' }; continue }
    const b = before.get(l.key)
    if (b != null && l.num != null && b !== l.num) out[l.key] = { delta: l.num - b, kind: l.num > b ? 'up' : 'down' }
  }
  return out
}

const CHANGE_CLASS: Record<Change['kind'], string> = {
  up: 'bg-state-warning-bg',
  down: 'bg-state-success-bg',
  new: 'bg-state-info-bg',
}

export function PriceBreakdown({ result, regular }: { result: CalcResult; regular: boolean }) {
  const lines = buildLines(result, regular)
  const prevRef = useRef<Line[] | null>(null)
  const [changes, setChanges] = useState<Record<string, Change>>({})

  useEffect(() => {
    setChanges(diffLines(prevRef.current, lines))
    prevRef.current = lines
    // lines 는 result 에서만 파생되므로 result 기준으로만 비교한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  return (
    <div className="space-y-4">
      {result.warnings.length > 0 && (
        <ul className="bg-state-warning-bg rounded-xl p-3 text-xs text-state-warning space-y-1">
          {result.warnings.map((w) => <li key={w}>⚠ {w}</li>)}
        </ul>
      )}

      <div className="bg-surface-sunken rounded-xl p-2 space-y-0.5">
        {lines.map((l) => {
          const c = changes[l.key]
          return (
            <div
              key={l.key}
              className={`flex justify-between gap-4 px-2 py-1.5 rounded-lg text-sm transition-colors duration-200 ${c ? CHANGE_CLASS[c.kind] : ''} ${l.strong ? 'font-bold text-text-primary' : l.muted ? 'text-text-tertiary' : 'text-text-secondary'}`}
            >
              <span className="break-keep">{l.label}</span>
              <span className="tabular-nums shrink-0 text-right">
                {l.value}
                {c && c.kind !== 'new' && l.num != null && (
                  <span className={`block text-xs font-normal ${c.kind === 'up' ? 'text-state-warning' : 'text-state-success'}`}>{signed(c.delta)}</span>
                )}
              </span>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-text-tertiary">바뀐 줄에 색이 칠해집니다. 노랑은 올라감, 초록은 내려감, 파랑은 새로 생긴 줄입니다.</p>

      <details className="text-xs text-text-tertiary">
        <summary className="cursor-pointer">내부 원가·마진 (고객에게 보이지 않음)</summary>
        <div className="mt-2 bg-surface-sunken rounded-xl p-3 space-y-1">
          <div className="flex justify-between"><span>인건비 (총 작업시간 × 시간당 인건비)</span><span>{won(result.labor_cost)}</span></div>
          <div className="flex justify-between"><span>마진 (공급가 − 인건비)</span><span>{won(result.margin)} ({result.margin_rate}%)</span></div>
        </div>
      </details>
    </div>
  )
}
