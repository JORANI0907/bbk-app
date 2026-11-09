'use client'

/**
 * 도면 분석 → 3D·평면 만들기 (관리자, 2026-11-08)
 *   ① 도면 고르기(+건축물대장 참고) 또는 글로 배치 설명 → ② AI 분석 → ③ 미리보기(도면 위에 방 윤곽 겹쳐 보기) + 방 ↔ 구역 연결 확인
 *   → ④ 적용: 층별 평면 저장 + 연결 안 된 방은 새 구역으로 만들 수 있음. [저장] 전까지 반영 안 됨.
 */

import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Ruler, X } from 'lucide-react'
import toast from 'react-hot-toast'
import type { CareManualZoneV2, FloorPlanV2, RoomV2, SpaceAssetV2 } from '@/types/care-manual'
import { ZONE_COLORS, emptyZone } from '@/types/care-manual'
import type { PlanDraft, PlanRubric } from '@/lib/ai/floor-plan/validate'
import { planDraftToFloorPlans } from '@/lib/ai/floor-plan/validate'
import { FloorPlanSvg } from './FloorPlanSvg'
import { floorLabel } from './space-layout'

interface Props {
  customerId: string
  assets: SpaceAssetV2[]
  zones: CareManualZoneV2[]
  existingPlans: FloorPlanV2[]
  onApply: (plans: FloorPlanV2[], newZones: CareManualZoneV2[]) => void
}

interface LayoutResponse {
  draft?: PlanDraft
  rubric?: PlanRubric
  meta?: { attempts: number; cost_krw: number; skipped_assets: string[]; plan_asset_ids: string[] }
  error?: string
}

const inputCls = 'rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200'

export function FloorPlanAnalyzePanel({ customerId, assets, zones, existingPlans, onApply }: Props) {
  const planAssets = assets.filter(a => a.kind === 'floorplan')
  const refAssets = assets.filter(a => a.kind === 'register')
  const [selected, setSelected] = useState<string[]>(() => planAssets.map(a => a.id))
  // 새로 올린 도면은 자동 선택, 지운 도면은 선택에서 제거 (옛 id 가 남아 "도면을 찾지 못함"이 되던 문제)
  const planIdsKey = planAssets.map(a => a.id).join(',')
  useEffect(() => {
    setSelected(prev => {
      const ids = planAssets.map(a => a.id)
      const kept = prev.filter(id => ids.includes(id))
      const added = ids.filter(id => !prev.includes(id))
      return [...kept, ...added]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planIdsKey])
  const [useRefs, setUseRefs] = useState(true)
  const [hints, setHints] = useState('')
  /** 도면이 없으면 글로 설명하는 모드가 기본 */
  const [mode, setMode] = useState<'assets' | 'text'>(planAssets.length > 0 ? 'assets' : 'text')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<LayoutResponse | null>(null)
  const [plans, setPlans] = useState<FloorPlanV2[]>([])
  const [createZones, setCreateZones] = useState(true)
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)

  const unlinked = useMemo(() => plans.flatMap(p => p.rooms.filter(r => !r.zone_id && (r.kind === 'room' || r.kind === 'corridor')).map(r => ({ plan: p, room: r }))), [plans])

  const run = async () => {
    setBusy(true); setResult(null); setPlans([])
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/care-manual/ai-layout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // assets: 아직 저장 안 한 자료도 서버가 읽을 수 있도록 함께 보낸다
        body: JSON.stringify(mode === 'text'
          ? { plan_asset_ids: [], reference_asset_ids: useRefs ? refAssets.map(a => a.id) : [], hints, description, assets }
          : { plan_asset_ids: selected, reference_asset_ids: useRefs ? refAssets.map(a => a.id) : [], hints, assets }),
      })
      const body = await res.json().catch(() => ({})) as LayoutResponse
      if (!res.ok || !body.draft) throw new Error(body.error ?? '도면 분석 실패')
      // 미리보기 배경: 도면이 이미지면 층 순서대로 매칭 (PDF 는 배경 없음)
      const imgByFloor: Record<number, string> = {}
      body.draft.floors.forEach((f, i) => {
        const a = planAssets.find(x => x.id === body.meta?.plan_asset_ids[i])
        if (a && a.mime.startsWith('image/')) imgByFloor[f.floor] = a.url
      })
      setResult(body)
      setPlans(planDraftToFloorPlans(body.draft, zones, body.meta?.plan_asset_ids[0], imgByFloor))
      if (!body.rubric?.pass) toast('분석 품질이 기준에 못 미칩니다. 미리보기를 꼭 확인하세요.', { icon: '⚠️' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '도면 분석 실패')
    } finally { setBusy(false) }
  }

  const unlink = (r: RoomV2): RoomV2 => ({ id: r.id, name: r.name, kind: r.kind, polygon: r.polygon })
  const linkRoom = (planId: string, roomId: string, zoneId: string) =>
    setPlans(ps => ps.map(p => (p.id !== planId ? p : { ...p, rooms: p.rooms.map(r => (r.id !== roomId ? r : zoneId ? { ...r, zone_id: zoneId } : unlink(r))) })))

  const apply = () => {
    const newZones: CareManualZoneV2[] = []
    const finalPlans = plans.map(p => ({
      ...p,
      rooms: p.rooms.map(r => {
        if (r.zone_id || !createZones || (r.kind !== 'room' && r.kind !== 'corridor')) return r
        const z = { ...emptyZone(r.name || '이름 없는 구역', zones.length + newZones.length), color: ZONE_COLORS[(zones.length + newZones.length) % ZONE_COLORS.length], space: { floor: p.floor } }
        newZones.push(z)
        return { ...r, zone_id: z.id }
      }),
    }))
    onApply(finalPlans, newZones)
    const replaced = finalPlans.filter(p => existingPlans.some(e => e.floor === p.floor)).length
    toast.success(`평면 ${finalPlans.length}개 층 적용${replaced ? ` (기존 ${replaced}개 층 교체)` : ''}${newZones.length ? ` · 새 구역 ${newZones.length}개` : ''} · 저장을 눌러 반영하세요.`)
    setResult(null); setPlans([])
  }

  return (
    <section className="rounded-2xl border border-dashed border-sky-300 bg-sky-50/40 p-4">
      <div className="flex items-center gap-2">
        <Ruler size={16} className="text-sky-700" />
        <p className="shrink-0 whitespace-nowrap text-sm font-bold text-text-primary">도면 분석</p>
        <span className="min-w-0 truncate text-xs text-text-tertiary" title="도면 사진이나 글 설명으로 평면·3D 모형을 만듭니다. 건당 수백 원. 결과는 아래 평면 그리기·수정에서 다듬을 수 있습니다.">도면·글 설명 → 평면·3D · 건당 수백 원 · 아래에서 다듬기 가능</span>
      </div>

      <div className="mt-3 inline-flex rounded-lg bg-surface p-0.5 text-xs ring-1 ring-border">
        <button type="button" onClick={() => setMode('assets')} disabled={planAssets.length === 0} className={`rounded-md px-3 py-1.5 font-semibold disabled:opacity-40 ${mode === 'assets' ? 'bg-sky-700 text-white' : 'text-text-secondary'}`}>도면 사진으로</button>
        <button type="button" onClick={() => setMode('text')} className={`rounded-md px-3 py-1.5 font-semibold ${mode === 'text' ? 'bg-sky-700 text-white' : 'text-text-secondary'}`}>글로 설명하기</button>
      </div>
      {mode === 'text' && (
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={4}
          maxLength={3000}
          placeholder={'머릿속 배치를 글로 적어주세요. 예)\n1층: 들어가면 왼쪽이 주방, 오른쪽이 홀. 홀 안쪽 끝에 화장실 남·여 하나씩. 주방 뒤에 창고.\n2층: 전체가 좌석. 계단 옆에 창고.'}
          className={`${inputCls} mt-2 w-full resize-y`}
        />
      )}
      <div className={`mt-3 flex flex-wrap gap-1.5 ${mode === 'text' ? 'hidden' : ''}`}>
        {planAssets.map(a => {
          const on = selected.includes(a.id)
          return (
            <button key={a.id} type="button" onClick={() => setSelected(s => (on ? s.filter(x => x !== a.id) : [...s, a.id]))} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${on ? 'border-sky-700 bg-sky-700 text-white' : 'border-border bg-surface text-text-secondary'}`}>
              {on && <Check size={12} />} {a.title || '도면'}
            </button>
          )
        })}
        {refAssets.length > 0 && (
          <label className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-text-secondary">
            <input type="checkbox" checked={useRefs} onChange={e => setUseRefs(e.target.checked)} /> 건축물대장 참고 ({refAssets.length})
          </label>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <input value={hints} onChange={e => setHints(e.target.value)} maxLength={500} placeholder="힌트 (선택) 예: 첫 번째 도면이 5층, 두 번째가 7층. 북쪽이 위" className={`${inputCls} min-w-0 flex-1`} />
        <button type="button" disabled={busy || (mode === 'assets' ? selected.length === 0 : description.trim().length < 10)} onClick={() => void run()} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Ruler size={15} />} {busy ? (mode === 'text' ? '배치 만드는 중… (1~2분)' : '도면 읽는 중… (1~3분)') : mode === 'text' ? '설명으로 평면 만들기' : '도면 분석'}
        </button>
      </div>

      {result?.draft && plans.length > 0 && (
        <div className="mt-4 rounded-xl border border-sky-200 bg-surface p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-semibold ${result.rubric?.pass ? 'bg-state-success-bg text-green-800' : 'bg-state-warning-bg text-amber-800'}`}>
              품질 {result.rubric?.total ?? 0}점 {result.rubric?.pass ? '합격' : '확인 필요'}
            </span>
            <span className="text-text-tertiary">약 {result.meta?.cost_krw ?? 0}원 · 시도 {result.meta?.attempts ?? 1}회</span>
            <button type="button" onClick={() => { setResult(null); setPlans([]) }} className="ml-auto rounded-lg p-1 text-text-tertiary hover:bg-surface-sunken" aria-label="닫기"><X size={14} /></button>
          </div>
          {result.rubric && result.rubric.issues.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">{result.rubric.issues.map((s, i) => <li key={i}>{s}</li>)}</ul>
          )}

          {plans.map(p => (
            <div key={p.id} className="mt-3">
              <p className="text-xs font-bold text-text-secondary">{floorLabel(p.floor)} · 방 {p.rooms.length}개{p.image_url ? ' · 도면 위에 겹쳐 보기' : ''}</p>
              <div className="mt-1 h-56 overflow-hidden rounded-lg border border-border-subtle">
                <FloorPlanSvg plan={p} zones={zones} zoneStatuses={{}} selectedZoneId={null} showImage={!!p.image_url} onSelectRoom={r => setSelectedRoomId(r.id)} selectedRoomId={selectedRoomId} />
              </div>
              <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                {p.rooms.filter(r => r.kind === 'room' || r.kind === 'corridor').map(r => (
                  <RoomLinkRow key={r.id} room={r} zones={zones} highlighted={r.id === selectedRoomId} onLink={zoneId => linkRoom(p.id, r.id, zoneId)} />
                ))}
              </ul>
            </div>
          ))}
          {result.draft.notes && <p className="mt-3 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-text-secondary break-keep">📝 AI 메모: {result.draft.notes}</p>}

          <label className="mt-3 flex items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" checked={createZones} onChange={e => setCreateZones(e.target.checked)} />
            연결 안 된 방 {unlinked.length}개는 새 구역으로 만들기
          </label>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={apply} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              <Check size={15} /> 3D·평면에 적용
            </button>
            <button type="button" onClick={() => { setResult(null); setPlans([]) }} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-sunken">버리기</button>
          </div>
          <p className="mt-2 text-[11px] text-text-tertiary">같은 층에 이미 평면이 있으면 바꿔 끼웁니다. 저장을 눌러야 반영됩니다.</p>
        </div>
      )}
    </section>
  )
}

function RoomLinkRow({ room, zones, highlighted, onLink }: { room: RoomV2; zones: CareManualZoneV2[]; highlighted: boolean; onLink: (zoneId: string) => void }) {
  return (
    <li className={`flex items-center gap-2 rounded-lg px-2 py-1 ${highlighted ? 'bg-sky-100' : ''}`}>
      <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{room.name || '(이름 없음)'}<span className="text-xs text-text-tertiary"> · {room.kind === 'corridor' ? '복도' : '실'}</span></span>
      <select value={room.zone_id ?? ''} onChange={e => onLink(e.target.value)} className={`${inputCls} w-36 py-1 text-xs`} aria-label="연결할 구역">
        <option value="">연결 안 함</option>
        {zones.map(z => <option key={z.id} value={z.id}>{z.name || '이름 없는 구역'}</option>)}
      </select>
    </li>
  )
}

/** 같은 층은 새 평면으로 바꿔 끼우고 나머지는 유지 */
export function mergeFloorPlans(existing: FloorPlanV2[], incoming: FloorPlanV2[]): FloorPlanV2[] {
  const floors = new Set(incoming.map(p => p.floor))
  return [...existing.filter(p => !floors.has(p.floor)), ...incoming].sort((a, b) => a.floor - b.floor)
}
