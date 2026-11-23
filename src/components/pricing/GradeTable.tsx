'use client'

/** 난이도 등급표 — 행 추가·삭제·수정 */
import { Button, Input } from '@/components/ui'
import { NumberField } from './NumberField'
import { ROW_CLASS } from './PricingSection'
import type { DifficultyGrade } from '@/lib/pricing/types'

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 7)}`

interface GradeProps { grades: DifficultyGrade[]; onChange: (g: DifficultyGrade[]) => void }

export function GradeTable({ grades, onChange }: GradeProps) {
  const update = (i: number, patch: Partial<DifficultyGrade>) => onChange(grades.map((g, k) => (k === i ? { ...g, ...patch } : g)))
  const remove = (i: number) => onChange(grades.filter((_, k) => k !== i))
  const add = () => onChange([...grades, { id: newId('g'), name: '', criteria: '', time_factor: 1, price_factor: 1 }])

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {grades.map((g, i) => (
          <div key={g.id} className={`grid grid-cols-1 md:grid-cols-12 gap-2 items-end ${ROW_CLASS}`}>
            <div className="md:col-span-2"><Input label="등급명" size="sm" value={g.name} onChange={(e) => update(i, { name: e.target.value })} fullWidth /></div>
            <div className="md:col-span-6"><Input label="판단 기준" size="sm" value={g.criteria} onChange={(e) => update(i, { criteria: e.target.value })} fullWidth /></div>
            <div className="md:col-span-1"><NumberField label="시간 계수" size="sm" step={0.1} min={0.1} value={g.time_factor} onChange={(v) => update(i, { time_factor: v ?? 1 })} /></div>
            <div className="md:col-span-1"><NumberField label="단가 계수" size="sm" step={0.1} min={0.1} value={g.price_factor} onChange={(v) => update(i, { price_factor: v ?? 1 })} /></div>
            <div className="md:col-span-2 flex justify-end"><Button variant="ghost" size="sm" onClick={() => remove(i)} disabled={grades.length <= 1}>삭제</Button></div>
          </div>
        ))}
      </div>
      <Button variant="secondary" size="sm" onClick={add}>등급 추가</Button>
    </div>
  )
}
