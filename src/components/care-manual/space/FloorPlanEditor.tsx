'use client'

/**
 * 평면 그리기·수정 도구 (관리자, 2026-11-08)
 *   도면이 없어도 머릿속 배치를 직접 그린다. AI 가 만든 평면도 여기서 고친다.
 *   - 층 탭 · [층 추가] · 층 삭제 · 가로세로 비율
 *   - [네모 그리기] 끌어서 방 만들기 → 이름·종류·구역 연결
 *   - [선택] 방 끌어 옮기기, 모서리 끌어 크기 조절(네모), 꼭짓점 옮기기(다각형), 삭제
 *   - 밑그림: 자료함의 도면 사진을 반투명으로 깔고 따라 그리기
 *   바뀐 내용은 즉시 3D·평면도에 반영되고, [저장]을 눌러야 DB 에 남는다.
 */

import { useMemo, useRef, useState } from 'react'
import { Layers, MousePointer2, Plus, Square, Trash2 } from 'lucide-react'
import type { CareManualZoneV2, FloorPlanV2, RoomKind, RoomV2, SpaceAssetV2 } from '@/types/care-manual'
import { ROOM_KINDS, newManualId } from '@/types/care-manual'
import { ZONE_HEX } from '../zone-theme'
import { floorLabel } from './space-layout'
import { centroid, fitLabel } from './plan-geometry'
import { dragVertex, isAxisRect, newRoom, nextRoomName, rectFromDrag, translatePoly, type Pt } from './plan-edit-utils'

interface Props {
  plans: FloorPlanV2[]
  zones: CareManualZoneV2[]
  assets: SpaceAssetV2[]
  onChange: (plans: FloorPlanV2[]) => void
  /** 방 이름으로 새 구역을 만들고 id 를 돌려준다 */
  onCreateZone: (name: string, floor: number) => string
}

type Tool = 'select' | 'rect'
const KIND_LABEL: Record<RoomKind, string> = { room: '호실', corridor: '복도·홀', core: '계단·공용부', outdoor: '외부' }
const KIND_FILL: Record<RoomKind, string> = { room: '#cbd5e1', corridor: '#e2e8f0', core: '#94a3b8', outdoor: '#f1f5f9' }
const ASPECTS = [{ v: 1, l: '정사각형' }, { v: 1.3, l: '가로 1.3배' }, { v: 1.6, l: '가로 1.6배' }, { v: 2, l: '가로 2배' }, { v: 0.7, l: '세로가 긴' }]
const VB = 1000
const NEW_ZONE = '__new__'
const inputCls = 'rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200'

export function FloorPlanEditor({ plans, zones, assets, onChange, onCreateZone }: Props) {
  const sorted = useMemo(() => [...plans].sort((a, b) => a.floor - b.floor), [plans])
  const [planId, setPlanId] = useState<string | null>(sorted[0]?.id ?? null)
  const plan = sorted.find(p => p.id === planId) ?? sorted[0] ?? null
  const [tool, setTool] = useState<Tool>('select')
  const [roomId, setRoomId] = useState<string | null>(null)
  const [open, setOpen] = useState(plans.length > 0)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ kind: 'draw' | 'move' | 'vertex'; start: Pt; roomId?: string; index?: number; orig?: Pt[]; moved: boolean } | null>(null)
  const [preview, setPreview] = useState<Pt[] | null>(null)
  /** 이름 표시: auto = 방 크기에 맞으면, all = 전부(작게라도), none = 숨김 */
  const [labels, setLabels] = useState<'auto' | 'all' | 'none'>('auto')

  const vbH = plan ? VB / Math.min(4, Math.max(0.25, plan.aspect)) : VB
  const room = plan?.rooms.find(r => r.id === roomId) ?? null
  const planAssets = assets.filter(a => a.kind === 'floorplan' && a.mime.startsWith('image/'))

  const patchPlan = (id: string, fn: (p: FloorPlanV2) => FloorPlanV2) => onChange(plans.map(p => (p.id === id ? fn(p) : p)))
  const patchRoom = (rid: string, patch: Partial<RoomV2>) => plan && patchPlan(plan.id, p => ({ ...p, rooms: p.rooms.map(r => (r.id === rid ? { ...r, ...patch } : r)) }))

  // ─── 층 ───────────────────────────────────────────────────────
  const addFloor = () => {
    const used = new Set(plans.map(p => p.floor))
    let f = (sorted[sorted.length - 1]?.floor ?? 0) + 1
    while (used.has(f)) f += 1
    const input = prompt('몇 층인가요? (지하는 음수, 예: -1)', String(f))
    if (input === null) return
    const floor = Math.trunc(Number(input))
    if (!Number.isFinite(floor)) return
    if (used.has(floor)) { alert('이미 있는 층입니다.'); return }
    const np: FloorPlanV2 = { id: newManualId(), floor, aspect: 1.6, rooms: [] }
    onChange([...plans, np]); setPlanId(np.id); setRoomId(null); setOpen(true)
  }
  const removeFloor = () => {
    if (!plan || !confirm(`${floorLabel(plan.floor)} 평면과 방 ${plan.rooms.length}개를 삭제할까요? (구역·품목은 남습니다)`)) return
    const rest = plans.filter(p => p.id !== plan.id)
    onChange(rest); setPlanId(rest[0]?.id ?? null); setRoomId(null)
  }

  // ─── 좌표 ────────────────────────────────────────────────────
  const toUnit = (e: React.PointerEvent): Pt | null => {
    const svg = svgRef.current
    if (!svg) return null
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return [pt.x / VB, pt.y / vbH]
  }

  // ─── 포인터 ───────────────────────────────────────────────────
  const onDown = (e: React.PointerEvent) => {
    if (!plan) return
    const p = toUnit(e)
    if (!p) return
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    if (tool === 'rect') { drag.current = { kind: 'draw', start: p, moved: false }; setPreview(null); return }
    // 빈 곳 클릭 → 선택 해제
    drag.current = null
    setRoomId(null)
  }
  const startMove = (e: React.PointerEvent, r: RoomV2) => {
    if (tool !== 'select') return
    e.stopPropagation()
    const p = toUnit(e)
    if (!p) return
    ;(svgRef.current as unknown as Element)?.setPointerCapture(e.pointerId)
    setRoomId(r.id)
    drag.current = { kind: 'move', start: p, roomId: r.id, orig: r.polygon, moved: false }
  }
  const startVertex = (e: React.PointerEvent, r: RoomV2, index: number) => {
    e.stopPropagation()
    const p = toUnit(e)
    if (!p) return
    ;(svgRef.current as unknown as Element)?.setPointerCapture(e.pointerId)
    drag.current = { kind: 'vertex', start: p, roomId: r.id, index, orig: r.polygon, moved: false }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !plan) return
    const p = toUnit(e)
    if (!p) return
    d.moved = true
    if (d.kind === 'draw') { setPreview(rectFromDrag(d.start, p)); return }
    const r = plan.rooms.find(x => x.id === d.roomId)
    if (!r || !d.orig) return
    if (d.kind === 'move') patchRoom(r.id, { polygon: translatePoly(d.orig, p[0] - d.start[0], p[1] - d.start[1]) })
    else if (d.kind === 'vertex' && d.index !== undefined) patchRoom(r.id, { polygon: dragVertex(d.orig, d.index, p) })
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!d || !plan) return
    if (d.kind === 'draw') {
      if (preview) {
        const nr = newRoom(newManualId(), preview, nextRoomName(plan.rooms))
        patchPlan(plan.id, p => ({ ...p, rooms: [...p.rooms, nr] }))
        setRoomId(nr.id)
        setTool('select')
      }
      setPreview(null)
    }
  }

  // ─── 방 속성 ──────────────────────────────────────────────────
  const linkZone = (r: RoomV2, value: string) => {
    if (!plan) return
    if (value === NEW_ZONE) {
      const id = onCreateZone(r.name || '이름 없는 구역', plan.floor)
      patchRoom(r.id, { zone_id: id })
      return
    }
    if (!value) { const { zone_id: _z, ...rest } = r; void _z; patchPlan(plan.id, p => ({ ...p, rooms: p.rooms.map(x => (x.id === r.id ? rest : x)) })); return }
    patchRoom(r.id, { zone_id: value })
  }
  const removeRoom = (r: RoomV2) => {
    if (!plan || !confirm(`"${r.name || '이름 없는 방'}" 을 지울까요?`)) return
    patchPlan(plan.id, p => ({ ...p, rooms: p.rooms.filter(x => x.id !== r.id) }))
    setRoomId(null)
  }

  const pt = (p: Pt) => `${(p[0] * VB).toFixed(1)},${(p[1] * vbH).toFixed(1)}`

  return (
    <section className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/40 p-4">
      <button type="button" onClick={() => setOpen(v => !v)} className="flex w-full items-center gap-2 text-left">
        <Layers size={16} className="text-emerald-700" />
        <p className="text-sm font-bold text-text-primary">평면 그리기·수정</p>
        <span className="text-xs text-text-tertiary">도면이 없어도 직접 그립니다 · AI 결과도 여기서 고칩니다 ({plans.length}개 층)</span>
        <span className="ml-auto text-xs text-text-tertiary">{open ? '접기' : '펼치기'}</span>
      </button>
      {!open ? null : (
        <div className="mt-3 flex flex-col gap-3">
          {/* 층 탭 */}
          <div className="flex flex-wrap items-center gap-1.5">
            {sorted.map(p => (
              <button key={p.id} type="button" onClick={() => { setPlanId(p.id); setRoomId(null) }} className={`rounded-full px-3 py-1 text-xs font-semibold ${p.id === plan?.id ? 'bg-text-primary text-white' : 'bg-surface text-text-secondary ring-1 ring-border'}`}>
                {floorLabel(p.floor)} <span className="font-normal opacity-70">· {p.rooms.length}</span>
              </button>
            ))}
            <button type="button" onClick={addFloor} className="inline-flex items-center gap-1 rounded-full border border-dashed border-emerald-400 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"><Plus size={12} /> 층 추가</button>
            {plan && <button type="button" onClick={removeFloor} className="ml-auto rounded-lg p-1.5 text-text-tertiary hover:bg-rose-50 hover:text-rose-600" title="이 층 삭제"><Trash2 size={14} /></button>}
          </div>

          {!plan ? (
            <p className="rounded-xl bg-surface px-4 py-6 text-center text-sm text-text-tertiary">[층 추가]를 눌러 첫 층을 만들고, [네모 그리기]로 방을 끌어 그리세요.</p>
          ) : (
            <>
              {/* 도구 */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="inline-flex rounded-lg bg-surface p-0.5 ring-1 ring-border">
                  <button type="button" onClick={() => setTool('select')} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-semibold ${tool === 'select' ? 'bg-text-primary text-white' : 'text-text-secondary'}`}><MousePointer2 size={13} /> 선택·이동</button>
                  <button type="button" onClick={() => { setTool('rect'); setRoomId(null) }} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-semibold ${tool === 'rect' ? 'bg-emerald-600 text-white' : 'text-text-secondary'}`}><Square size={13} /> 네모 그리기</button>
                </div>
                <label className="inline-flex items-center gap-1 text-text-secondary">비율
                  <select value={String(plan.aspect)} onChange={e => patchPlan(plan.id, p => ({ ...p, aspect: Number(e.target.value) }))} className={`${inputCls} py-1`}>
                    {!ASPECTS.some(a => a.v === plan.aspect) && <option value={String(plan.aspect)}>현재 ({plan.aspect.toFixed(2)})</option>}
                    {ASPECTS.map(a => <option key={a.v} value={String(a.v)}>{a.l}</option>)}
                  </select>
                </label>
                {planAssets.length > 0 && (
                  <label className="inline-flex items-center gap-1 text-text-secondary">밑그림
                    <select value={plan.image_url ?? ''} onChange={e => patchPlan(plan.id, p => { const { image_url: _i, ...rest } = p; void _i; return e.target.value ? { ...rest, image_url: e.target.value } : rest })} className={`${inputCls} max-w-[12rem] py-1`}>
                      <option value="">없음</option>
                      {planAssets.map(a => <option key={a.id} value={a.url}>{a.title || '도면'}</option>)}
                    </select>
                  </label>
                )}
                <label className="inline-flex items-center gap-1 text-text-secondary">이름
                  <select value={labels} onChange={e => setLabels(e.target.value as 'auto' | 'all' | 'none')} className={`${inputCls} py-1`} aria-label="방 이름 표시">
                    <option value="auto">맞는 방만</option>
                    <option value="all">전부</option>
                    <option value="none">숨김</option>
                  </select>
                </label>
                <span className="text-text-tertiary">{tool === 'rect' ? '빈 곳에서 끌어 네모를 그리세요' : '방을 끌어 옮기고, 모서리 점을 끌어 크기를 바꾸세요'}</span>
              </div>

              {/* 캔버스 */}
              <div className="overflow-hidden rounded-xl border border-border bg-surface">
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${VB} ${vbH}`}
                  className={`block max-h-[72vh] w-full ${tool === 'rect' ? 'cursor-crosshair' : ''}`}
                  style={{ touchAction: 'none' }}
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                >
                  <rect x={0} y={0} width={VB} height={vbH} fill="#f8fafc" />
                  {plan.image_url && <image href={plan.image_url} x={0} y={0} width={VB} height={vbH} preserveAspectRatio="none" opacity={0.4} />}
                  {Array.from({ length: 51 }, (_, i) => i * 20).map(x => <line key={`v${x}`} x1={x} y1={0} x2={x} y2={vbH} stroke="#e2e8f0" strokeWidth={x % 100 === 0 ? 1.5 : 0.6} />)}
                  {Array.from({ length: Math.ceil(vbH / 20) + 1 }, (_, i) => i * 20).map(y => <line key={`h${y}`} x1={0} y1={y} x2={VB} y2={y} stroke="#e2e8f0" strokeWidth={y % 100 === 0 ? 1.5 : 0.6} />)}
                  {plan.rooms.map(r => {
                    const zone = zones.find(z => z.id === r.zone_id)
                    const fill = zone ? ZONE_HEX[zone.color] : KIND_FILL[r.kind]
                    const sel = r.id === roomId
                    const [cx, cy] = centroid(r.polygon)
                    const name = r.name || zone?.name || ''
                    // 방 크기에 맞는 글자만. 선택된 방은 항상 표시
                    const label = labels === 'none' && !sel ? null
                      : fitLabel(name, r.polygon, VB, vbH, { maxFont: 30, minFont: labels === 'all' ? 7 : 11 })
                        ?? (sel || labels === 'all' ? { text: name.replace(/^(호실|객실|방)\s*/, ''), fontSize: sel ? 13 : 8 } : null)
                    return (
                      <g key={r.id}>
                        <title>{name}</title>
                        <polygon points={r.polygon.map(pt).join(' ')} fill={fill} fillOpacity={zone ? 0.75 : 0.55} stroke={sel ? '#0f172a' : '#ffffff'} strokeWidth={sel ? 6 : 3} strokeLinejoin="round" className={tool === 'select' ? 'cursor-move' : ''} onPointerDown={e => startMove(e, r)} />
                        {label && <text x={cx * VB} y={cy * vbH} textAnchor="middle" dominantBaseline="middle" fontSize={label.fontSize} fontWeight={700} fill="#1e293b" style={{ pointerEvents: 'none' }}>{label.text}</text>}
                        {sel && r.polygon.map((p, i) => (
                          <circle key={i} cx={p[0] * VB} cy={p[1] * vbH} r={11} fill="#ffffff" stroke="#0f172a" strokeWidth={3} className={isAxisRect(r.polygon) ? 'cursor-nwse-resize' : 'cursor-pointer'} onPointerDown={e => startVertex(e, r, i)} />
                        ))}
                      </g>
                    )
                  })}
                  {preview && <polygon points={preview.map(pt).join(' ')} fill="rgba(5,150,105,.25)" stroke="#059669" strokeWidth={4} strokeDasharray="12 8" />}
                </svg>
              </div>

              {/* 선택된 방 */}
              {room ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3">
                  <input value={room.name} onChange={e => patchRoom(room.id, { name: e.target.value })} placeholder="방 이름 (예: 5F 사무실)" className={`${inputCls} min-w-[10rem] flex-1`} />
                  <select value={room.kind} onChange={e => patchRoom(room.id, { kind: e.target.value as RoomKind })} className={inputCls} aria-label="종류">
                    {ROOM_KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </select>
                  <select value={room.zone_id ?? ''} onChange={e => linkZone(room, e.target.value)} className={`${inputCls} min-w-[10rem]`} aria-label="구역 연결">
                    <option value="">구역 연결 안 함</option>
                    <option value={NEW_ZONE}>＋ 이 이름으로 새 구역 만들기</option>
                    {zones.map(z => <option key={z.id} value={z.id}>{z.name || '이름 없는 구역'}</option>)}
                  </select>
                  <button type="button" onClick={() => removeRoom(room)} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-secondary hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /> 방 삭제</button>
                </div>
              ) : (
                <p className="text-[11px] text-text-tertiary">방을 누르면 이름·종류·구역 연결을 바꿀 수 있습니다. 구역에 연결된 방은 구역 색으로 칠해지고 고객 3D 에서 누를 수 있습니다.</p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
