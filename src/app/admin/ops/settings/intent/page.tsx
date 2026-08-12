'use client'

/**
 * 대표 의도 편집 페이지
 * PLAN v2 §3.6
 *
 * 단일 행 upsert (id=1 CHECK).
 * 저장 성공 시 toast + /admin 홈으로 반영됨.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Compass, Save, ArrowLeft, ShieldOff, CheckSquare } from 'lucide-react'

interface IntentForm {
  purpose: string
  intent_1: string; intent_2: string; intent_3: string
  intent_1_tradeoff: string; intent_2_tradeoff: string; intent_3_tradeoff: string
  never_1: string; never_2: string; never_3: string
  always_1: string; always_2: string; always_3: string
  year: number
  safe_days_start_date: string
}

const EMPTY: IntentForm = {
  purpose: '',
  intent_1: '', intent_2: '', intent_3: '',
  intent_1_tradeoff: '', intent_2_tradeoff: '', intent_3_tradeoff: '',
  never_1: '', never_2: '', never_3: '',
  always_1: '', always_2: '', always_3: '',
  year: new Date().getFullYear(),
  safe_days_start_date: new Date().toISOString().slice(0, 10),
}

const LABEL = 'block text-xs font-medium text-text-secondary mb-1'
const INPUT = 'input-toss w-full px-3 py-2 rounded-md border border-border bg-surface text-sm focus:border-brand-500 focus:shadow-focus'
const TEXTAREA = 'input-toss w-full px-3 py-2 rounded-md border border-border bg-surface text-sm focus:border-brand-500 focus:shadow-focus resize-none'

export default function IntentEditPage() {
  const [form, setForm] = useState<IntentForm>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/ops/settings/intent')
      .then(r => r.json())
      .then(json => {
        if (json.ok && json.intent) {
          const s: IntentForm = { ...EMPTY }
          for (const k of Object.keys(EMPTY) as Array<keyof IntentForm>) {
            const v = json.intent[k]
            if (v !== null && v !== undefined) (s as Record<keyof IntentForm, unknown>)[k] = v
          }
          setForm(s)
        }
      })
      .catch(() => toast.error('불러오기 실패'))
      .finally(() => setLoading(false))
  }, [])

  const update = <K extends keyof IntentForm>(k: K, v: IntentForm[K]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const submit = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/ops/settings/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? '저장 실패')
      toast.success('저장되었습니다.')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-6 text-center text-text-tertiary text-sm">불러오는 중…</div>

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Link href="/admin" className="text-text-tertiary hover:text-brand-600"><ArrowLeft size={18} /></Link>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2"><Compass size={20} /> 대표 의도</h1>
        </div>
        <button
          onClick={submit}
          disabled={saving}
          className="btn-toss-primary inline-flex items-center gap-1.5 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          <Save size={14} /> {saving ? '저장 중…' : '저장'}
        </button>
      </div>

      {/* Phase 27-BE: 연도·날짜 인풋이 모바일에서 좁아지지 않도록 1단으로 시작 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>연도</label>
          <input type="number" className={INPUT} value={form.year} onChange={e => update('year', Number(e.target.value))} />
        </div>
        <div>
          <label className={LABEL}>무사고 시작일</label>
          <input type="date" className={INPUT} value={form.safe_days_start_date} onChange={e => update('safe_days_start_date', e.target.value)} />
        </div>
      </div>

      <div>
        <label className={LABEL}>올해의 목적 (1문장)</label>
        <textarea className={TEXTAREA} rows={2} maxLength={200} value={form.purpose} onChange={e => update('purpose', e.target.value)} placeholder="예: 청소로 상업공간의 시간과 안전을 되찾아드립니다." />
      </div>

      <div>
        <p className="text-sm font-bold text-text-primary mb-2">3가지 의도</p>
        <div className="space-y-2.5">
          {([1, 2, 3] as const).map(i => {
            const key = `intent_${i}` as const
            const tradeKey = `intent_${i}_tradeoff` as const
            return (
              <div key={i} className="bg-surface-sunken p-3 rounded-xl space-y-2">
                <div>
                  <label className={LABEL}>의도 {i}</label>
                  <input className={INPUT} maxLength={200} value={form[key]} onChange={e => update(key, e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>대가 / 트레이드오프</label>
                  <input className={INPUT} maxLength={200} value={form[tradeKey]} onChange={e => update(tradeKey, e.target.value)} placeholder="이 의도 때문에 포기해야 하는 것" />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-bold text-text-primary mb-2 flex items-center gap-1"><ShieldOff size={14} className="text-state-danger" /> 절대 하지 않을 것 (Never)</p>
          <div className="space-y-2">
            {([1, 2, 3] as const).map(i => {
              const key = `never_${i}` as const
              return <input key={i} className={INPUT} maxLength={200} value={form[key]} onChange={e => update(key, e.target.value)} placeholder={`Never ${i}`} />
            })}
          </div>
        </div>
        <div>
          <p className="text-sm font-bold text-text-primary mb-2 flex items-center gap-1"><CheckSquare size={14} className="text-state-success" /> 반드시 지킬 것 (Always)</p>
          <div className="space-y-2">
            {([1, 2, 3] as const).map(i => {
              const key = `always_${i}` as const
              return <input key={i} className={INPUT} maxLength={200} value={form[key]} onChange={e => update(key, e.target.value)} placeholder={`Always ${i}`} />
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
