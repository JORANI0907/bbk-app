'use client'

/**
 * 360 사진 뷰어 — Photo Sphere Viewer 래퍼 (2026-11-08)
 *   - 드래그/손가락으로 둘러보기, 핀치 확대
 *   - 표시(마커): 점은 상태색 원, 영역은 반투명 다각형. 클릭 → onMarkerClick
 *   - 편집 모드: 빈 곳 클릭 → onPlace(yaw, pitch) (점 찍기·영역 꼭짓점 찍기)
 *   서버에서는 그리지 않는다 (부모가 next/dynamic ssr:false 로 불러온다).
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Viewer, type ClickData } from '@photo-sphere-viewer/core'
import { MarkersPlugin, type MarkerConfig } from '@photo-sphere-viewer/markers-plugin'
import '@photo-sphere-viewer/core/index.css'
import '@photo-sphere-viewer/markers-plugin/index.css'
import type { PanoMarkerV2 } from '@/types/care-manual'

export interface MarkerVisual {
  marker: PanoMarkerV2
  /** 상태색 hex */
  color: string
  /** 툴팁 (품목 이름) */
  label: string
  /** 구역 안 번호 */
  index: number
}

interface Props {
  imageUrl: string
  markers: MarkerVisual[]
  selectedMarkerId?: string | null
  onMarkerClick: (markerId: string) => void
  /** 편집 모드일 때만: 빈 곳 클릭 위치 */
  onPlace?: (yaw: number, pitch: number) => void
  /** 영역 그리는 중인 꼭짓점 (편집) */
  pendingPoints?: [number, number][]
  className?: string
}

const PENDING_ID = '__pending__'
const NO_POINTS: [number, number][] = []

/** 툴팁은 HTML 로 해석되므로 품목 이름을 이스케이프한다 */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)
}

function pointHtml(color: string, index: number, selected: boolean): string {
  const ring = selected ? 'box-shadow:0 0 0 4px rgba(255,255,255,.95),0 0 0 7px ' + color + ';' : 'box-shadow:0 0 0 3px rgba(255,255,255,.9),0 2px 8px rgba(0,0,0,.35);'
  return `<div style="width:30px;height:30px;border-radius:9999px;background:${color};${ring}display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px;font-family:inherit;cursor:pointer">${index}</div>`
}

function toConfig(v: MarkerVisual, selected: boolean): MarkerConfig {
  const { marker, color, label, index } = v
  if (marker.type === 'polygon' && marker.points) {
    return {
      id: marker.id,
      polygon: marker.points,
      svgStyle: { fill: `${color}${selected ? '88' : '55'}`, stroke: color, strokeWidth: selected ? '4px' : '2.5px' },
      tooltip: { content: escapeHtml(label), position: 'top center' },
    }
  }
  return {
    id: marker.id,
    position: { yaw: marker.yaw ?? 0, pitch: marker.pitch ?? 0 },
    html: pointHtml(color, index, selected),
    size: { width: 30, height: 30 },
    anchor: 'center center',
    tooltip: { content: escapeHtml(label), position: 'top center' },
  }
}

function pendingConfig(points: [number, number][]): MarkerConfig[] {
  if (points.length === 0) return []
  if (points.length < 3) {
    return points.map((p, i) => ({
      id: `${PENDING_ID}${i}`,
      position: { yaw: p[0], pitch: p[1] },
      html: '<div style="width:14px;height:14px;border-radius:9999px;background:#2563eb;box-shadow:0 0 0 3px #fff"></div>',
      size: { width: 14, height: 14 },
      anchor: 'center center',
    }))
  }
  return [{ id: PENDING_ID, polygon: points, svgStyle: { fill: 'rgba(37,99,235,.35)', stroke: '#2563eb', strokeWidth: '3px', strokeDasharray: '6 4' } }]
}

export default function PanoramaViewer({ imageUrl, markers, selectedMarkerId = null, onMarkerClick, onPlace, pendingPoints = NO_POINTS, className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const pluginRef = useRef<MarkersPlugin | null>(null)
  /** 지금 화면에 올라간 사진 (로드 성공 후에만 갱신 → 실패하면 같은 URL 로 다시 시도할 수 있다) */
  const loadedUrl = useRef<string | null>(null)
  /** 사진 전환 중에는 표시를 갱신하지 않는다 (이전 사진 위에 새 표시가 잠깐 보이는 것 방지) */
  const transitioning = useRef(false)
  const handlers = useRef({ onMarkerClick, onPlace })
  useEffect(() => { handlers.current = { onMarkerClick, onPlace } }, [onMarkerClick, onPlace])

  // 최신 표시 목록은 ref 로 들고 있다가, 뷰어가 준비되면(ready) 그때 그린다
  const configs = useMemo(
    () => [...markers.map(m => toConfig(m, m.marker.id === selectedMarkerId)), ...pendingConfig(pendingPoints)],
    [markers, selectedMarkerId, pendingPoints],
  )
  const configsRef = useRef(configs)
  useEffect(() => { configsRef.current = configs }, [configs])

  const applyMarkers = useCallback(() => {
    const plugin = pluginRef.current
    if (!plugin || transitioning.current) return
    try { plugin.setMarkers(configsRef.current) } catch (e) {
      console.error('[pano] 표시 갱신 실패:', e instanceof Error ? e.message : e)
    }
  }, [])

  /**
   * 뷰어는 한 번만 만든다.
   *   React 개발 모드(StrictMode)는 effect 를 "붙임 → 뗌 → 다시 붙임" 하는데, 그 사이 첫 뷰어가 사진 요청을
   *   취소시키면 두 번째 뷰어가 취소된 요청을 기다리다 멈춘다. 한 프레임 미뤄 만들고, 그 전에 떼이면 아예 만들지 않는다.
   */
  const initialUrl = useRef(imageUrl)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let viewer: Viewer | null = null
    const raf = requestAnimationFrame(() => {
      try {
        viewer = new Viewer({
          container: el,
          panorama: initialUrl.current,
          navbar: ['zoom', 'fullscreen'],
          defaultZoomLvl: 10,
          minFov: 30,
          maxFov: 100,
          touchmoveTwoFingers: false,
          mousewheel: true,
          loadingTxt: '사진 불러오는 중…',
          lang: { zoom: '확대/축소', zoomIn: '확대', zoomOut: '축소', fullscreen: '전체 화면' },
          plugins: [[MarkersPlugin, { markers: [] }]],
        })
      } catch (e) {
        console.error('[pano] 뷰어 생성 실패:', e instanceof Error ? e.message : e)
        return
      }
      const plugin = viewer.getPlugin(MarkersPlugin) as MarkersPlugin
      viewerRef.current = viewer
      pluginRef.current = plugin

      viewer.addEventListener('ready', () => { loadedUrl.current = initialUrl.current; applyMarkers() }, { once: true })
      plugin.addEventListener('select-marker', e => {
        if (!e.marker.id.startsWith(PENDING_ID)) handlers.current.onMarkerClick(e.marker.id)
      })
      viewer.addEventListener('click', e => {
        const data = e.data as ClickData & { marker?: unknown }
        if (data.rightclick || data.marker) return
        handlers.current.onPlace?.(data.yaw, data.pitch)
      })
    })

    return () => {
      cancelAnimationFrame(raf)
      viewer?.destroy()
      viewerRef.current = null
      pluginRef.current = null
      loadedUrl.current = null
    }
  }, [applyMarkers])

  // 사진 교체 (뷰어가 아직 없으면 생성 시 initialUrl 로 들어간다)
  useEffect(() => {
    initialUrl.current = imageUrl
    const viewer = viewerRef.current
    if (!viewer || loadedUrl.current === imageUrl) return
    transitioning.current = true
    viewer.setPanorama(imageUrl, { transition: { speed: 600, rotation: false }, showLoader: true })
      .then(ok => { if (ok) loadedUrl.current = imageUrl })
      .catch(e => {
        // 연속 전환으로 앞선 요청이 취소된 경우는 정상 흐름 — 조용히 넘어간다
        if (!(e instanceof Error && /abort/i.test(e.message))) console.error('[pano] 사진 교체 실패:', e instanceof Error ? e.message : e)
      })
      .finally(() => { transitioning.current = false; applyMarkers() })
  }, [imageUrl, applyMarkers])

  // 표시 갱신
  useEffect(() => { applyMarkers() }, [configs, applyMarkers])

  return <div ref={containerRef} className={`h-full w-full ${onPlace ? 'cursor-crosshair' : ''} ${className}`} />
}
