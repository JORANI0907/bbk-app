'use client'

/** 할증·할인 규칙 편집 — 종류별로 필요한 숫자만 보여 준다 */
import { Button, Input, Select } from '@/components/ui'
import { NumberField } from './NumberField'
import { ROW_CLASS } from './PricingSection'
import type { DiscountRule, SurchargeRule } from '@/lib/pricing/types'

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 7)}`

const SURCHARGE_KINDS: Array<{ kind: SurchargeRule['kind']; label: string }> = [
  { kind: 'distance_tiers', label: '거리 구간 정액' }, { kind: 'urgent_days', label: '긴급(N일 이내) %' }, { kind: 'fixed', label: '정액' }, { kind: 'percent', label: '비율 %' },
]
const DISCOUNT_KINDS: Array<{ kind: DiscountRule['kind']; label: string }> = [
  { kind: 'contract_months', label: '계약기간 N개월 이상 %' }, { kind: 'prepaid', label: '선납 %' }, { kind: 'renewal_year', label: '재계약 연차별 %' }, { kind: 'branch_count', label: '지점 수별 %' }, { kind: 'percent', label: '비율 %' },
]

function makeSurcharge(kind: SurchargeRule['kind']): SurchargeRule {
  const common = { id: newId('s'), name: '', enabled: false }
  switch (kind) {
    case 'distance_tiers': return { ...common, kind, tiers: [{ from_km: 30, to_km: null, amount: 30000 }] }
    case 'urgent_days': return { ...common, kind, within_days: 2, percent: 20 }
    case 'fixed': return { ...common, kind, amount: 0 }
    case 'percent': return { ...common, kind, percent: 10 }
  }
}
function makeDiscount(kind: DiscountRule['kind']): DiscountRule {
  const common = { id: newId('d'), name: '', enabled: false }
  switch (kind) {
    case 'contract_months': return { ...common, kind, min_months: 12, percent: 5 }
    case 'prepaid': return { ...common, kind, percent: 5 }
    case 'renewal_year': return { ...common, kind, tiers: [{ min_year: 2, percent: 15 }] }
    case 'branch_count': return { ...common, kind, tiers: [{ min_branches: 3, percent: 5 }] }
    case 'percent': return { ...common, kind, percent: 10 }
  }
}

type AnyRule = SurchargeRule | DiscountRule

function RuleRow<T extends AnyRule>({ rule, onChange, onRemove }: { rule: T; onChange: (r: T) => void; onRemove: () => void }) {
  const set = (patch: Partial<T>) => onChange({ ...rule, ...patch })
  return (
    <div className={`${ROW_CLASS} space-y-2`}>
      <div className="flex flex-col md:flex-row gap-2 md:items-end">
        <label className="flex items-center gap-2 text-xs font-medium shrink-0 pb-2.5">
          <input type="checkbox" checked={rule.enabled} onChange={(e) => set({ enabled: e.target.checked } as Partial<T>)} /> 사용
        </label>
        <div className="flex-1"><Input label="규칙명" size="sm" value={rule.name} onChange={(e) => set({ name: e.target.value } as Partial<T>)} fullWidth /></div>
        <span className="text-xs text-text-tertiary pb-2.5 shrink-0">{[...SURCHARGE_KINDS, ...DISCOUNT_KINDS].find((k) => k.kind === rule.kind)?.label}</span>
        <Button variant="ghost" size="sm" onClick={onRemove}>삭제</Button>
      </div>
      <RuleParams rule={rule} onChange={onChange} />
    </div>
  )
}

function RuleParams<T extends AnyRule>({ rule, onChange }: { rule: T; onChange: (r: T) => void }) {
  const r = rule as AnyRule
  const set = (patch: object) => onChange({ ...rule, ...patch })
  switch (r.kind) {
    case 'distance_tiers':
      return (
        <div className="space-y-1">
          {r.tiers.map((t, i) => (
            <div key={i} className="grid grid-cols-3 gap-2 items-end">
              <NumberField label="시작 km" size="sm" value={t.from_km} onChange={(v) => set({ tiers: r.tiers.map((x, k) => (k === i ? { ...x, from_km: v ?? 0 } : x)) })} />
              <NumberField label="끝 km(미만)" size="sm" nullable placeholder="없음" value={t.to_km} onChange={(v) => set({ tiers: r.tiers.map((x, k) => (k === i ? { ...x, to_km: v } : x)) })} />
              <NumberField label="할증액" size="sm" step={5000} value={t.amount} onChange={(v) => set({ tiers: r.tiers.map((x, k) => (k === i ? { ...x, amount: v ?? 0 } : x)) })} />
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => set({ tiers: [...r.tiers, { from_km: r.tiers[r.tiers.length - 1]?.to_km ?? 0, to_km: null, amount: 0 }] })}>구간 추가</Button>
        </div>
      )
    case 'urgent_days':
      return <div className="grid grid-cols-2 gap-2"><NumberField label="시공일까지 N일 이내" size="sm" value={r.within_days} onChange={(v) => set({ within_days: v ?? 0 })} /><NumberField label="할증 %" size="sm" value={r.percent} onChange={(v) => set({ percent: v ?? 0 })} /></div>
    case 'fixed':
      return <NumberField label="금액(원)" size="sm" step={10000} value={r.amount} onChange={(v) => set({ amount: v ?? 0 })} />
    case 'percent':
      return <NumberField label="비율 %" size="sm" value={r.percent} onChange={(v) => set({ percent: v ?? 0 })} />
    case 'contract_months':
      return <div className="grid grid-cols-2 gap-2"><NumberField label="최소 계약 개월" size="sm" value={r.min_months} onChange={(v) => set({ min_months: v ?? 0 })} /><NumberField label="할인 %" size="sm" value={r.percent} onChange={(v) => set({ percent: v ?? 0 })} /></div>
    case 'prepaid':
      return <NumberField label="할인 %" size="sm" value={r.percent} onChange={(v) => set({ percent: v ?? 0 })} />
    case 'renewal_year':
      return <TierPairs label1="N년차 이상" label2="할인 %" rows={r.tiers.map((t) => [t.min_year, t.percent])} onChange={(rows) => set({ tiers: rows.map(([a, b]) => ({ min_year: a, percent: b })) })} />
    case 'branch_count':
      return <TierPairs label1="지점 N개 이상" label2="할인 %" rows={r.tiers.map((t) => [t.min_branches, t.percent])} onChange={(rows) => set({ tiers: rows.map(([a, b]) => ({ min_branches: a, percent: b })) })} />
  }
}

function TierPairs({ label1, label2, rows, onChange }: { label1: string; label2: string; rows: Array<[number, number]>; onChange: (rows: Array<[number, number]>) => void }) {
  return (
    <div className="space-y-1">
      {rows.map(([a, b], i) => (
        <div key={i} className="grid grid-cols-2 gap-2">
          <NumberField label={label1} size="sm" value={a} onChange={(v) => onChange(rows.map((x, k) => (k === i ? [v ?? 0, x[1]] : x)))} />
          <NumberField label={label2} size="sm" value={b} onChange={(v) => onChange(rows.map((x, k) => (k === i ? [x[0], v ?? 0] : x)))} />
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={() => onChange([...rows, [(rows[rows.length - 1]?.[0] ?? 0) + 1, 0]])}>단계 추가</Button>
    </div>
  )
}

export function SurchargeEditor({ rules, onChange }: { rules: SurchargeRule[]; onChange: (r: SurchargeRule[]) => void }) {
  return (
    <div className="space-y-2">
      {rules.map((r, i) => <RuleRow key={r.id} rule={r} onChange={(n) => onChange(rules.map((x, k) => (k === i ? n : x)))} onRemove={() => onChange(rules.filter((_, k) => k !== i))} />)}
      <AddRule kinds={SURCHARGE_KINDS} onAdd={(k) => onChange([...rules, makeSurcharge(k as SurchargeRule['kind'])])} />
    </div>
  )
}

export function DiscountEditor({ rules, onChange }: { rules: DiscountRule[]; onChange: (r: DiscountRule[]) => void }) {
  return (
    <div className="space-y-2">
      {rules.map((r, i) => <RuleRow key={r.id} rule={r} onChange={(n) => onChange(rules.map((x, k) => (k === i ? n : x)))} onRemove={() => onChange(rules.filter((_, k) => k !== i))} />)}
      <AddRule kinds={DISCOUNT_KINDS} onAdd={(k) => onChange([...rules, makeDiscount(k as DiscountRule['kind'])])} />
    </div>
  )
}

function AddRule({ kinds, onAdd }: { kinds: Array<{ kind: string; label: string }>; onAdd: (kind: string) => void }) {
  return (
    <div className="flex items-end gap-2">
      <Select label="규칙 추가" size="sm" defaultValue="" onChange={(e) => { if (e.target.value) { onAdd(e.target.value); e.target.value = '' } }}>
        <option value="">종류 선택</option>
        {kinds.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
      </Select>
    </div>
  )
}
