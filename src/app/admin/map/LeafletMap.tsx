'use client'

import { useState, useMemo, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { CustomerMapPoint, ManagerLite } from './page'

// Leaflet 기본 마커 아이콘 CDN
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  })
}

const SEOUL_CENTER: [number, number] = [37.5665, 126.978]
const UNASSIGNED_ID = '__unassigned__'
const UNASSIGNED_COLOR = '#9ca3af'

type ServiceFilter = 'all' | '정기딥케어' | '정기엔드케어'

const FILTER_TABS: { key: ServiceFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: '정기딥케어', label: '◆ 정기딥케어' },
  { key: '정기엔드케어', label: '● 정기엔드케어' },
]

// 담당자 색상 팔레트 (최대 12명)
const MANAGER_PALETTE = [
  '#2563eb', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#84cc16', '#06b6d4', '#d946ef',
]

function hashStringToIndex(str: string, mod: number): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0
  return hash % mod
}

function markerSvg(shape: 'diamond' | 'circle', color: string): string {
  const stroke = 'white'
  if (shape === 'diamond') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
      <polygon points="15,2 28,15 15,28 2,15" fill="${color}" stroke="${stroke}" stroke-width="2"/>
    </svg>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <circle cx="14" cy="14" r="11" fill="${color}" stroke="${stroke}" stroke-width="2"/>
  </svg>`
}

function shapeForType(type: string | null): 'diamond' | 'circle' {
  return type === '정기딥케어' ? 'diamond' : 'circle'
}

function makeIcon(shape: 'diamond' | 'circle', color: string) {
  return L.divIcon({
    html: markerSvg(shape, color),
    className: 'bbk-marker',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
  })
}

interface Props {
  points: CustomerMapPoint[]
  managers: ManagerLite[]
}

export function LeafletMap({ points, managers }: Props) {
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>('all')
  const [managerFilter, setManagerFilter] = useState<string | 'all'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // 담당자별 색상 (해시 기반, 새로고침 후에도 동일)
  const managerColorMap = useMemo(() => {
    const map: Record<string, string> = { [UNASSIGNED_ID]: UNASSIGNED_COLOR }
    for (const m of managers) {
      map[m.id] = MANAGER_PALETTE[hashStringToIndex(m.id, MANAGER_PALETTE.length)]
    }
    return map
  }, [managers])

  const managerNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const m of managers) map[m.id] = m.name
    return map
  }, [managers])

  // 서비스 유형 카운트
  const countByType = useMemo(() => {
    const acc: Record<string, number> = { all: points.length }
    for (const p of points) {
      const key = p.customer_type || '기타'
      acc[key] = (acc[key] ?? 0) + 1
    }
    return acc
  }, [points])

  // 서비스 유형 필터 적용된 포인트 (담당자 칩은 이 기준으로 계산)
  const serviceFilteredPoints = useMemo(() => {
    if (serviceFilter === 'all') return points
    return points.filter((p) => p.customer_type === serviceFilter)
  }, [points, serviceFilter])

  // 현재 서비스 유형에 등장하는 담당자만 (사용자가 원한 "각 케어별 담당자")
  const relevantManagers = useMemo(() => {
    const ids = new Set(
      serviceFilteredPoints.map((p) => p.assigned_user_id).filter((v): v is string => !!v),
    )
    return managers.filter((m) => ids.has(m.id))
  }, [serviceFilteredPoints, managers])

  const managerCustomerCount = useMemo(() => {
    const acc: Record<string, number> = { [UNASSIGNED_ID]: 0 }
    for (const p of serviceFilteredPoints) {
      const mid = p.assigned_user_id ?? UNASSIGNED_ID
      acc[mid] = (acc[mid] ?? 0) + 1
    }
    return acc
  }, [serviceFilteredPoints])

  // 최종 필터 적용 (서비스 유형 AND 담당자)
  const finalPoints = useMemo(() => {
    return serviceFilteredPoints.filter((p) => {
      if (managerFilter === 'all') return true
      const mid = p.assigned_user_id ?? UNASSIGNED_ID
      return mid === managerFilter
    })
  }, [serviceFilteredPoints, managerFilter])

  const selectedPoint = useMemo(
    () => finalPoints.find((p) => p.id === selectedId) ?? null,
    [finalPoints, selectedId],
  )

  const selectedManagerName = useMemo(() => {
    if (!selectedPoint) return null
    const mid = selectedPoint.assigned_user_id
    if (!mid) return '미배정'
    return managerNameMap[mid] ?? '미배정'
  }, [selectedPoint, managerNameMap])

  // 서비스 필터 변경 시 담당자 필터 초기화
  useEffect(() => {
    setManagerFilter('all')
  }, [serviceFilter])

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary">
        지도 로딩 중...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <header className="flex flex-col gap-3 border-b border-border bg-surface px-4 py-3 md:px-6 md:py-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-text-primary">지도 대시보드</h1>
          <p className="text-sm text-text-tertiary mt-0.5">
            표시 중 <strong className="text-text-primary">{finalPoints.length}</strong>곳 · 전체 {points.length}곳
          </p>
        </div>

        {/* 서비스 유형 탭 */}
        <div className="flex gap-1 overflow-x-auto">
          {FILTER_TABS.map((tab) => {
            const active = serviceFilter === tab.key
            const count = tab.key === 'all' ? countByType.all : (countByType[tab.key] ?? 0)
            return (
              <button
                key={tab.key}
                onClick={() => setServiceFilter(tab.key)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-brand-600 text-white shadow-card'
                    : 'bg-surface-sunken text-text-secondary hover:bg-surface hover:text-text-primary'
                }`}
              >
                {tab.label}
                <span className={`ml-1.5 text-xs ${active ? 'opacity-80' : 'opacity-60'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* 담당자 칩 (현재 서비스 유형에 등장하는 담당자만) */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary shrink-0">담당자</span>
          <div className="flex gap-1 overflow-x-auto">
            <button
              onClick={() => setManagerFilter('all')}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                managerFilter === 'all'
                  ? 'bg-text-primary text-white border-text-primary'
                  : 'bg-surface text-text-secondary border-border hover:border-border-strong'
              }`}
            >
              전체
            </button>
            {relevantManagers.map((m) => {
              const active = managerFilter === m.id
              const color = managerColorMap[m.id]
              const count = managerCustomerCount[m.id] ?? 0
              return (
                <button
                  key={m.id}
                  onClick={() => setManagerFilter(active ? 'all' : m.id)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    active ? 'border-text-primary shadow-card' : 'border-border hover:border-border-strong'
                  }`}
                  style={active ? { backgroundColor: color, color: 'white' } : { backgroundColor: 'white' }}
                >
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: active ? 'white' : color }}
                  />
                  <span className={active ? '' : 'text-text-primary'}>{m.name}</span>
                  <span className={`text-xs ${active ? 'opacity-80' : 'text-text-tertiary'}`}>{count}</span>
                </button>
              )
            })}
            {(managerCustomerCount[UNASSIGNED_ID] ?? 0) > 0 && (
              <button
                onClick={() => setManagerFilter(managerFilter === UNASSIGNED_ID ? 'all' : UNASSIGNED_ID)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  managerFilter === UNASSIGNED_ID
                    ? 'border-text-primary shadow-card'
                    : 'border-border hover:border-border-strong'
                }`}
                style={managerFilter === UNASSIGNED_ID
                  ? { backgroundColor: UNASSIGNED_COLOR, color: 'white' }
                  : { backgroundColor: 'white' }}
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: managerFilter === UNASSIGNED_ID ? 'white' : UNASSIGNED_COLOR }}
                />
                <span className={managerFilter === UNASSIGNED_ID ? '' : 'text-text-primary'}>미배정</span>
                <span className={`text-xs ${managerFilter === UNASSIGNED_ID ? 'opacity-80' : 'text-text-tertiary'}`}>
                  {managerCustomerCount[UNASSIGNED_ID]}
                </span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 지도 + 사이드 패널 */}
      <div className="flex flex-1 min-h-0 relative">
        <div className="flex-1 min-w-0">
          <MapContainer
            center={SEOUL_CENTER}
            zoom={11}
            style={{ width: '100%', height: '100%' }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.vworld.kr">VWorld</a> (국토지리정보원)'
              url={`https://api.vworld.kr/req/wmts/1.0.0/${process.env.NEXT_PUBLIC_VWORLD_KEY}/Base/{z}/{y}/{x}.png`}
              maxZoom={19}
            />

            <MarkerClusterGroup chunkedLoading showCoverageOnHover={false}>
              {finalPoints.map((point) => {
                const mid = point.assigned_user_id ?? UNASSIGNED_ID
                const color = managerColorMap[mid] ?? UNASSIGNED_COLOR
                const shape = shapeForType(point.customer_type)
                return (
                  <Marker
                    key={point.id}
                    position={[point.latitude, point.longitude]}
                    icon={makeIcon(shape, color)}
                    eventHandlers={{ click: () => setSelectedId(point.id) }}
                  >
                    <Popup>
                      <div className="text-sm">
                        <p className="font-semibold">{point.business_name}</p>
                        <p className="text-xs text-gray-500 mt-1">{point.customer_type ?? '-'}</p>
                      </div>
                    </Popup>
                  </Marker>
                )
              })}
            </MarkerClusterGroup>
          </MapContainer>
        </div>

        {/* 사이드 패널 */}
        {selectedPoint && (
          <aside className="absolute right-0 top-0 h-full w-80 bg-surface border-l border-border shadow-pop overflow-y-auto z-[1000]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
              <h2 className="font-bold text-text-primary">고객사 상세</h2>
              <button
                onClick={() => setSelectedId(null)}
                className="text-text-tertiary hover:text-text-primary px-2 py-1"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <p className="text-xs text-text-tertiary">고객사명</p>
                <p className="text-base font-semibold text-text-primary mt-0.5">{selectedPoint.business_name}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary">서비스 유형</p>
                <p className="text-sm text-text-primary mt-0.5">{selectedPoint.customer_type ?? '-'}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary">담당자</p>
                <p className="text-sm text-text-primary mt-0.5">{selectedManagerName}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary">주소</p>
                <p className="text-sm text-text-primary mt-0.5 break-keep">{selectedPoint.address ?? '-'}</p>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
