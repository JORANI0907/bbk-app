'use client'

/** 난이도 등급표와 규모 구간표 — 행 추가·삭제·수정 */
import { Button, Input } from '@/components/ui'
import { NumberField } from './NumberField'
import type { DifficultyGrade, SizeTier } from '@/lib/pricing/types'

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 7)}`

interface GradeProps { grades: DifficultyGrade[]; onChange: (g: DifficultyGrade[]) => void }

export function GradeTable({ grades, onChange }: GradeProps) {
  const update = (i: number, patch: Partial<DifficultyGrade>) => onChange(grades.map((g, k) => (k === i ? { ...g, ...patch } : g)))
  const remove = (i: number) => onChange(grades.filter((_, k) => k !== i))
  const add = () => onChange([...grades, { id: newId('g'), name: '', criteria: '', time_factor: 1, price_factor: 1 }])

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-secondary break-keep">견적자가 현장을 보고 고르는 등급입니다. 시간 계수는 규모 기준 1명당 시간(시/1인)에 곱하고, 단가 계수는 시간당 단가에 곱합니다(대부분 1.0).</p>
      <div className="space-y-2">
        {grades.map((g, i) => (
          <div key={g.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end bg-surface-sunken rounded-xl p-3">
            <div className="md:col-span-2"><Input label="등급명" size="sm" value={g.name} onChange={(e) => update(i, { name: e.target.value })} fullWidth /></div>
            <div className="md:col-span-6"><Input label="판단 기준" size="sm" value={g.criteria} onChange={(e) => update(i, { criteria: e.target.value })} fullWidth /></div>
            <div className="md:col-span-1"><NumberField label="시간" size="sm" step={0.1} min={0.1} value={g.time_factor} onChange={(v) => update(i, { time_factor: v ?? 1 })} /></div>
            <div className="md:col-span-1"><NumberField label="단가" size="sm" step={0.1} min={0.1} value={g.price_factor} onChange={(v) => update(i, { price_factor: v ?? 1 })} /></div>
            <div className="md:col-span-2 flex justify-end"><Button variant="ghost" size="sm" onClick={() => remove(i)} disabled={grades.length <= 1}>삭제</Button></div>
          </div>
        ))}
      </div>
      <Button variant="secondary" size="sm" onClick={add}>등급 추가</Button>
    </div>
  )
}

interface TierProps { tiers: SizeTier[]; onChange: (t: SizeTier[]) => void }

export function TierTable({ tiers, onChange }: TierProps) {
  const update = (i: number, patch: Partial<SizeTier>) => onChange(tiers.map((t, k) => (k === i ? { ...t, ...patch } : t)))
  const remove = (i: number) => onChange(tiers.filter((_, k) => k !== i))
  const add = () => {
    const last = tiers[tiers.length - 1]
    onChange([...tiers, { id: newId('t'), name: '', min_pyeong: last?.max_pyeong ?? 0, max_pyeong: null, workers: 1, hours_per_worker: 0 }])
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-secondary break-keep">규모 구간마다 난이도 &lsquo;보통&rsquo;일 때 보통 몇 명이 각각 몇 시간 일하는지 적습니다. 총 작업시간 = 인원 × 시/1인. 계산기에서 전문가가 언제든 덮어쓸 수 있으니 평균값으로 두세요.</p>
      <div className="space-y-2">
        {tiers.map((t, i) => (
          <div key={t.id} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-start bg-surface-sunken rounded-xl p-3">
            <div className="md:col-span-3"><Input label="구간명" size="sm" value={t.name} onChange={(e) => update(i, { name: e.target.value })} fullWidth /></div>
            <div className="md:col-span-2"><NumberField label="최소 평수" size="sm" value={t.min_pyeong} onChange={(v) => update(i, { min_pyeong: v ?? 0 })} /></div>
            <div className="md:col-span-2"><NumberField label="최대 평수" size="sm" nullable placeholder="없음" value={t.max_pyeong} onChange={(v) => update(i, { max_pyeong: v })} /></div>
            <div className="md:col-span-1"><NumberField label="인원" size="sm" min={1} value={t.workers} onChange={(v) => update(i, { workers: v ?? 1 })} /></div>
            <div className="md:col-span-1"><NumberField label="시/1인" size="sm" step={0.5} value={t.hours_per_worker} onChange={(v) => update(i, { hours_per_worker: v ?? 0 })} /></div>
            <div className="md:col-span-2">
              <p className="text-sm font-medium text-text-primary mb-1.5">총 작업시간</p>
              <p className="h-9 flex items-center text-sm tabular-nums text-text-primary">{(t.workers * t.hours_per_worker) || 0}시간</p>
            </div>
            <div className="md:col-span-1 flex justify-end md:pt-6"><Button variant="ghost" size="sm" onClick={() => remove(i)} disabled={tiers.length <= 1}>삭제</Button></div>
          </div>
        ))}
      </div>
      <Button variant="secondary" size="sm" onClick={add}>구간 추가</Button>
    </div>
  )
}
