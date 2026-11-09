'use client'

/**
 * 평면 사진 뷰어 (2026-11-08) — 일반 사진 위에 점·영역 표시를 그린다. 360 뷰어(PanoramaViewer)와 같은 역할.
 *   - 좌표는 사진 기준 0~1 비율. 사진이 영역 안에 object-contain 으로 놓이므로 여백을 빼고 환산한다.
 *   - 휠/버튼으로 확대, 확대 중엔 드래그로 이동. 드래그가 아닌 클릭만 "찍기"로 본다.
 *   - 편집 모드(onPlace)에서 빈 곳 클릭 → onPlace(x, y)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import type { MarkerVisual } from './PanoramaViewer'

interface Props {
  imageUrl: string
  markers: MarkerVisual[]
  selectedMarkerId?: string | null
  onMarkerClick: (markerId: string) => void
  onPlace?: (x: number, y: number) => void
  pendingPoints?: [number, number][]
}

const MIN_SCALE = 1
const MAX_SCALE = 5
const DRAG_THRESHOLD_PX = 6

/** 컨테이너 안에서 사진이 실제로 차지하는 사각형 (object-contain) */
function imageRect(container: HTMLElement, natural: { w: number; h: number }) {
  const cw = container.clientWidth, ch = container.clientHeight
  const scale = Math.min(cw / natural.w, ch / natural.h)
  const w = natural.w * scale, h = natural.h * scale
  return { left: (cw - w) / 2, top: (ch - h) / 2, width: w, height: h }
}

export default function FlatPhotoViewer({ imageUrl, markers, selectedMarkerId = null, onMarkerClick, onPlace, pendingPoints = [] }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null)

  useEffect(() => { setScale(1); setOffset({ x: 0, y: 0 }); setNatural(null) }, [imageUrl])

  const measure = useCallback(() => {
    if (boxRef.current && natural) setRect(imageRect(boxRef.current, natural))
  }, [natural])
  useEffect(() => {
    measure()
    const ro = new ResizeObserver(measure)
    if (boxRef.current) ro.observe(boxRef.current)
    return () => ro.disconnect()
  }, [measure])

  const zoomTo = (next: number) => {
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next))
    setScale(s)
    if (s === 1) setOffset({ x: 0, y: 0 })
  }
  const onWheel = (e: React.WheelEvent) => { e.preventDefault(); zoomTo(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)) }

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) d.moved = true
    if (d.moved && scale > 1) setOffset({ x: d.ox + dx, y: d.oy + dy })
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d || d.moved || !onPlace || !rect || !boxRef.current) return
    // 클릭 위치 → 확대·이동을 되돌린 사진 좌표(0~1)
    const box = boxRef.current.getBoundingClientRect()
    const cx = box.width / 2, cy = box.height / 2
    const px = (e.clientX - box.left - cx - offset.x) / scale + cx
    const py = (e.clientY - box.top - cy - offset.y) / scale + cy
    const x = (px - rect.left) / rect.width
    const y = (py - rect.top) / rect.height
    if (x < 0 || x > 1 || y < 0 || y > 1) return
    onPlace(x, y)
  }

  const pct = (v: number) => `${(v * 100).toFixed(2)}%`
  const pendingPoly = pendingPoints.length >= 3 ? pendingPoints : null

  return (
    <div
      ref={boxRef}
      className={`relative h-full w-full select-none overflow-hidden bg-black ${onPlace ? 'cursor-crosshair' : scale > 1 ? 'cursor-grab' : ''}`}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { drag.current = null }}
      style={{ touchAction: 'none' }}
    >
      <div className="absolute inset-0" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: 'center center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" draggable={false} className="h-full w-full object-contain" onLoad={e => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
        {rect && (
          <div className="absolute" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}>
            <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
              {markers.filter(m => m.marker.type === 'polygon' && m.marker.points).map(m => {
                const sel = m.marker.id === selectedMarkerId
                return (
                  <polygon
                    key={m.marker.id}
                    points={m.marker.points!.map(p => `${p[0] * 1000},${p[1] * 1000}`).join(' ')}
                    fill={`${m.color}${sel ? '88' : '55'}`}
                    stroke={m.color}
                    strokeWidth={sel ? 8 : 5}
                    vectorEffect="non-scaling-stroke"
                    className="cursor-pointer"
                    onPointerUp={e => { e.stopPropagation(); onMarkerClick(m.marker.id) }}
                    onPointerDown={e => e.stopPropagation()}
                  />
                )
              })}
              {pendingPoly && <polygon points={pendingPoly.map(p => `${p[0] * 1000},${p[1] * 1000}`).join(' ')} fill="rgba(37,99,235,.35)" stroke="#2563eb" strokeWidth={5} strokeDasharray="12 8" vectorEffect="non-scaling-stroke" />}
            </svg>
            {markers.filter(m => m.marker.type === 'point' && m.marker.x !== undefined && m.marker.y !== undefined).map(m => {
              const sel = m.marker.id === selectedMarkerId
              return (
                <button
                  key={m.marker.id}
                  type="button"
                  onPointerDown={e => e.stopPropagation()}
                  onPointerUp={e => { e.stopPropagation(); onMarkerClick(m.marker.id) }}
                  className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ left: pct(m.marker.x!), top: pct(m.marker.y!), background: m.color, boxShadow: sel ? `0 0 0 3px #fff, 0 0 0 6px ${m.color}` : '0 0 0 2px #fff, 0 2px 8px rgba(0,0,0,.35)', transform: `translate(-50%, -50%) scale(${1 / scale})` }}
                  title={m.label}
                >
                  {m.index}
                </button>
              )
            })}
            {!pendingPoly && pendingPoints.map((p, i) => (
              <span key={i} className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600 ring-2 ring-white" style={{ left: pct(p[0]), top: pct(p[1]) }} />
            ))}
          </div>
        )}
      </div>
      <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-black/55 p-1">
        <button type="button" onClick={() => zoomTo(scale / 1.3)} className="rounded p-1 text-white hover:bg-white/20" aria-label="축소"><Minus size={14} /></button>
        <span className="min-w-[2.5rem] text-center text-[11px] font-semibold text-white">{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => zoomTo(scale * 1.3)} className="rounded p-1 text-white hover:bg-white/20" aria-label="확대"><Plus size={14} /></button>
        <button type="button" onClick={() => zoomTo(1)} className="rounded p-1 text-white hover:bg-white/20" aria-label="원래 크기"><RotateCcw size={13} /></button>
      </div>
    </div>
  )
}
