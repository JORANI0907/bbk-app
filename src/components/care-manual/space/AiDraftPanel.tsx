'use client'

/**
 * AI 초안 (2026-11-08) — 자료함의 도면·사진을 골라 "구역·품목 초안"을 받고, 관리자가 고른 구역만 매뉴얼에 추가한다.
 *   자동 저장 없음: 추가해도 [저장]을 눌러야 반영. (Human-in-the-loop)
 */

import { useEffect, useState } from 'react'
import { Check, Loader2, Sparkles, X } from 'lucide-react'
import toast from 'react-hot-toast'
import type { CareManualZoneV2, SpaceAssetV2 } from '@/types/care-manual'
import type { Draft, RubricResult } from '@/lib/ai/care-manual-draft/validate'
import { draftToZones } from '@/lib/ai/care-manual-draft/validate'
import { FREQUENCY_LABEL } from '../zone-theme'

interface Props {
  customerId: string
  assets: SpaceAssetV2[]
  existingZoneCount: number
  onApply: (zones: CareManualZoneV2[]) => void
}

interface DraftResponse {
  draft?: Draft
  rubric?: RubricResult
  meta?: { model: string; prompt_version: string; attempts: number; cost_krw: number; skipped_assets: string[] }
  error?: string
}

const inputCls = 'rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200'

export function AiDraftPanel({ customerId, assets, existingZoneCount, onApply }: Props) {
  const candidates = assets.filter(a => a.kind === 'floorplan' || a.kind === 'photo' || a.kind === 'register')
  const [selected, setSelected] = useState<string[]>(() => candidates.filter(a => a.kind === 'floorplan').map(a => a.id))
  const candidateKey = candidates.map(a => `${a.id}:${a.kind}`).join(',')
  useEffect(() => {
    setSelected(prev => {
      const ids = candidates.map(a => a.id)
      const kept = prev.filter(id => ids.includes(id))
      const added = candidates.filter(a => a.kind === 'floorplan' && !prev.includes(a.id)).map(a => a.id)
      return [...kept, ...added]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateKey])
  const [hints, setHints] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<DraftResponse | null>(null)
  const [picked, setPicked] = useState<number[]>([])

  if (candidates.length === 0) return null

  const run = async () => {
    setBusy(true); setResult(null)
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/care-manual/ai-draft`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_ids: selected, hints, assets }),
      })
      const body = await res.json().catch(() => ({})) as DraftResponse
      if (!res.ok || !body.draft) throw new Error(body.error ?? '초안 생성 실패')
      setResult(body)
      setPicked(body.draft.zones.map((_, i) => i))
      if (!body.rubric?.pass) toast('초안 품질이 기준에 못 미칩니다. 내용을 꼭 확인하세요.', { icon: '⚠️' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '초안 생성 실패')
    } finally { setBusy(false) }
  }

  const apply = () => {
    if (!result?.draft) return
    const subset: Draft = { ...result.draft, zones: result.draft.zones.filter((_, i) => picked.includes(i)) }
    const zones = draftToZones(subset, existingZoneCount)
    onApply(zones)
    toast.success(`구역 ${zones.length}개 추가됨 · 내용을 확인하고 저장을 눌러 반영하세요.`)
    setResult(null)
  }

  return (
    <section className="rounded-2xl border border-dashed border-violet-300 bg-violet-50/40 p-4">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-violet-600" />
        <p className="text-sm font-bold text-text-primary">AI 로 구역·품목 초안 뽑기</p>
        <span className="text-xs text-text-tertiary">도면을 읽어 초안을 만듭니다 · 건당 수백 원</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {candidates.map(a => {
          const on = selected.includes(a.id)
          return (
            <button key={a.id} type="button" onClick={() => setSelected(s => (on ? s.filter(x => x !== a.id) : [...s, a.id]))} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${on ? 'border-violet-600 bg-violet-600 text-white' : 'border-border bg-surface text-text-secondary'}`}>
              {on && <Check size={12} />} {a.title || a.kind}
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <input value={hints} onChange={e => setHints(e.target.value)} maxLength={500} placeholder="힌트 (선택) 예: 5층 사무실·탕비실, 7층 임원실. 화장실은 층마다 2곳" className={`${inputCls} min-w-0 flex-1`} />
        <button type="button" disabled={busy || selected.length === 0} onClick={() => void run()} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {busy ? '읽는 중… (1~3분)' : '초안 만들기'}
        </button>
      </div>

      {result?.draft && (
        <div className="mt-4 rounded-xl border border-violet-200 bg-surface p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-semibold ${result.rubric?.pass ? 'bg-state-success-bg text-green-800' : 'bg-state-warning-bg text-amber-800'}`}>
              품질 {result.rubric?.total ?? 0}점 {result.rubric?.pass ? '합격' : '확인 필요'}
            </span>
            <span className="text-text-tertiary">약 {result.meta?.cost_krw ?? 0}원 · 시도 {result.meta?.attempts ?? 1}회</span>
            {result.meta?.skipped_assets?.length ? <span className="text-text-tertiary">건너뜀: {result.meta.skipped_assets.join(', ')}</span> : null}
            <button type="button" onClick={() => setResult(null)} className="ml-auto rounded-lg p-1 text-text-tertiary hover:bg-surface-sunken" aria-label="닫기"><X size={14} /></button>
          </div>
          {result.rubric && result.rubric.issues.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">{result.rubric.issues.map((s, i) => <li key={i}>{s}</li>)}</ul>
          )}

          <ul className="mt-3 divide-y divide-border-subtle">
            {result.draft.zones.map((z, i) => (
              <li key={i} className="py-2">
                <label className="flex cursor-pointer items-start gap-2">
                  <input type="checkbox" checked={picked.includes(i)} onChange={e => setPicked(p => (e.target.checked ? [...p, i] : p.filter(x => x !== i)))} className="mt-1" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-text-primary">{z.name} <span className="font-normal text-text-tertiary">· {z.floor > 0 ? `${z.floor}층` : `지하 ${-z.floor}층`}</span></p>
                    {z.groups.map((g, gi) => (
                      <p key={gi} className="mt-0.5 text-xs text-text-secondary break-keep">
                        <span className="font-semibold">{g.title}</span>: {g.items.map(it => `${it.title}${it.frequency ? `(${FREQUENCY_LABEL[it.frequency]})` : ''}`).join(', ')}
                      </p>
                    ))}
                  </div>
                </label>
              </li>
            ))}
          </ul>
          {result.draft.notes && <p className="mt-2 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-text-secondary break-keep">📝 AI 메모: {result.draft.notes}</p>}

          <div className="mt-3 flex gap-2">
            <button type="button" disabled={picked.length === 0} onClick={apply} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
              <Check size={15} /> 고른 구역 {picked.length}개 매뉴얼에 추가
            </button>
            <button type="button" onClick={() => setResult(null)} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-sunken">버리기</button>
          </div>
          <p className="mt-2 text-[11px] text-text-tertiary">추가해도 저장 전까지는 반영되지 않습니다. 추가한 구역은 작업 목록 탭에서 자유롭게 고치세요.</p>
        </div>
      )}
    </section>
  )
}
