'use client'

/**
 * 3D 공간 모형 (2026-11-08)
 *   모형 파일(glTF)이 없으면 구역·층 정보로 "층을 쌓은 블록 모형"을 자동 생성한다.
 *   - 손가락/마우스로 회전·확대, 층 선택(다른 층은 투명하게)
 *   - 블록 색 = 구역 색, 블록 위 점 = 구역 종합 관리 상태
 *   - 블록 클릭 → onSelectZone
 *   glTF 가 있으면 mesh 이름(zone.space.mesh_key)으로 구역을 찾는다.
 *   서버에서는 그리지 않는다 (SpaceView 가 next/dynamic ssr:false 로 불러온다).
 */

import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Edges, Html, OrbitControls, useCursor, useGLTF } from '@react-three/drei'
import type { Mesh, Object3D } from 'three'
import type { CareManualZoneV2, FloorPlanV2 } from '@/types/care-manual'
import type { ItemStatus } from '@/lib/care-manual-status'
import { STATUS_HEX } from '@/lib/care-manual-status'
import { ZONE_HEX } from '../zone-theme'
import { FLOOR_HEIGHT, layoutFloors, type FloorLayout, type ZoneBlock } from './space-layout'
import { PlanBuilding, type LabelMode } from './PlanBuilding'
import { centroid, planBuildingSize, plansByFloor, toWorld } from './plan-geometry'
import { FlyTo, KeyboardFly } from './CameraRig'
import type { RoomKind } from '@/types/care-manual'

interface Props {
  zones: CareManualZoneV2[]
  zoneStatuses: Record<string, ItemStatus>
  selectedZoneId: string | null
  onSelectZone: (zoneId: string) => void
  modelUrl?: string
  /** 도면 분석 결과 — 있으면 블록 대신 실제 배치로 그린다 */
  floorPlans?: FloorPlanV2[]
  /** 선택된 층 (null = 전체) */
  floor: number | null
  /** 도면 모형에서 보여줄 공간 종류 (호실·복도·공용부·외부) */
  visibleKinds?: ReadonlySet<RoomKind>
  /** 이름 표시 양 */
  labelMode?: LabelMode
  /** 구역을 다시 눌러도 카메라가 다가가도록 바꿔 주는 값 */
  focusNonce?: number
}

const ALL_KINDS: ReadonlySet<RoomKind> = new Set<RoomKind>(['room', 'corridor', 'core', 'outdoor'])

/** 선택된 구역이 3D 어디에 있는지 (카메라가 다가갈 지점) */
function focusPoint(selectedZoneId: string | null, usePlans: boolean, floorPlans: FloorPlanV2[], layout: FloorLayout, yOffset: number): [number, number, number] | null {
  if (!selectedZoneId) return null
  if (usePlans) {
    const sorted = plansByFloor(floorPlans)
    for (let i = 0; i < sorted.length; i++) {
      const room = sorted[i].rooms.find(r => r.zone_id === selectedZoneId)
      if (room) { const [x, z] = toWorld(sorted[i], centroid(room.polygon)); return [x, i * FLOOR_HEIGHT + yOffset + 0.7, z] }
    }
    return null
  }
  for (const f of layout.floors) {
    const b = f.blocks.find(x => x.zoneId === selectedZoneId)
    if (b) return [b.x, f.y + yOffset + b.h / 2, b.z]
  }
  return null
}

export default function SpaceModel3D({ zones, zoneStatuses, selectedZoneId, onSelectZone, modelUrl, floorPlans = [], floor, visibleKinds = ALL_KINDS, labelMode = 'zones', focusNonce = 0 }: Props) {
  const layout = useMemo(() => layoutFloors(zones), [zones])
  const usePlans = floorPlans.length > 0 && !modelUrl
  const size = usePlans ? planBuildingSize(floorPlans, FLOOR_HEIGHT) : layout
  const yOffset = -size.height / 2 + 0.4
  const focus = useMemo(() => focusPoint(selectedZoneId, usePlans, floorPlans, layout, yOffset), [selectedZoneId, usePlans, floorPlans, layout, yOffset])
  // 모형 전체가 화면에 꽉 차도록: 가장 긴 변 기준으로 카메라 거리를 잡는다
  const dist = Math.max(size.width, size.depth, size.height * 1.4) * 0.95 + 1.5
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.75]}
      camera={{ position: [dist, dist * 0.7, dist], fov: 34, near: 0.1, far: 500 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      style={{ touchAction: 'none', outline: 'none' }}
      tabIndex={0}
      onPointerDown={e => (e.currentTarget as HTMLElement).focus()}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[8, 14, 6]} intensity={1.1} />
      <directionalLight position={[-6, 6, -8]} intensity={0.35} />
      <group position={[0, yOffset, 0]}>
        {usePlans ? (
          <PlanBuilding plans={floorPlans} zones={zones} zoneStatuses={zoneStatuses} selectedZoneId={selectedZoneId} onSelectZone={onSelectZone} floor={floor} visibleKinds={visibleKinds} labelMode={labelMode} />
        ) : modelUrl ? (
          <ModelBoundary fallback={<BlockBuilding layout={layout} zoneStatuses={zoneStatuses} selectedZoneId={selectedZoneId} onSelectZone={onSelectZone} floor={floor} />}>
            <Suspense fallback={<Html center><span className="rounded-full bg-surface px-3 py-1 text-xs text-text-secondary shadow-soft">모형 불러오는 중…</span></Html>}>
              <GltfBuilding url={modelUrl} zones={zones} selectedZoneId={selectedZoneId} onSelectZone={onSelectZone} />
            </Suspense>
          </ModelBoundary>
        ) : (
          <BlockBuilding layout={layout} zoneStatuses={zoneStatuses} selectedZoneId={selectedZoneId} onSelectZone={onSelectZone} floor={floor} />
        )}
      </group>
      <OrbitControls enablePan enableDamping dampingFactor={0.08} minDistance={1.5} maxDistance={dist * 3} maxPolarAngle={Math.PI * 0.49} makeDefault />
      <KeyboardFly />
      <FlyTo target={focus} nonce={focusNonce} />
    </Canvas>
  )
}

// ─── 블록 모형 ─────────────────────────────────────────────────────
function BlockBuilding({ layout, zoneStatuses, selectedZoneId, onSelectZone, floor }: {
  layout: FloorLayout; zoneStatuses: Record<string, ItemStatus>; selectedZoneId: string | null; onSelectZone: (id: string) => void; floor: number | null
}) {
  return (
    <>
      {layout.floors.map(f => {
        const dim = floor !== null && f.floor !== floor
        return (
          <group key={f.floor} position={[0, f.y, 0]}>
            <mesh position={[0, -layout.slab / 2, 0]} receiveShadow>
              <boxGeometry args={[f.slabWidth, layout.slab, f.slabDepth]} />
              <meshStandardMaterial color="#e2e8f0" transparent opacity={dim ? 0.08 : 1} depthWrite={!dim} />
            </mesh>
            <Html position={[-f.slabWidth / 2 - 0.3, 0.1, f.slabDepth / 2]} center pointerEvents="none" style={{ opacity: dim ? 0.3 : 1 }}>
              <span className="whitespace-nowrap rounded-md bg-text-primary/80 px-1.5 py-0.5 text-[11px] font-bold text-white">{f.floor > 0 ? `${f.floor}F` : `B${-f.floor}`}</span>
            </Html>
            {f.blocks.map(b => (
              <ZoneBox key={b.zoneId} block={b} status={zoneStatuses[b.zoneId] ?? 'none'} selected={b.zoneId === selectedZoneId} dim={dim} onSelect={() => onSelectZone(b.zoneId)} />
            ))}
          </group>
        )
      })}
    </>
  )
}

function ZoneBox({ block, status, selected, dim, onSelect }: { block: ZoneBlock; status: ItemStatus; selected: boolean; dim: boolean; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false)
  useCursor(hovered && !dim)
  const color = ZONE_HEX[block.color]
  const lift = selected ? 0.12 : 0
  return (
    <group position={[block.x, block.h / 2 + lift, block.z]}>
      <mesh
        onClick={e => { e.stopPropagation(); if (!dim) onSelect() }}
        onPointerOver={e => { e.stopPropagation(); setHovered(true) }}
        onPointerOut={() => setHovered(false)}
        castShadow
      >
        <boxGeometry args={[block.w, block.h, block.d]} />
        <meshStandardMaterial
          color={color}
          emissive={selected || hovered ? color : '#000000'}
          emissiveIntensity={selected ? 0.35 : hovered ? 0.15 : 0}
          transparent
          opacity={dim ? 0.1 : 0.95}
          depthWrite={!dim}
          roughness={0.6}
        />
        {!dim && <Edges color={selected ? '#0f172a' : '#ffffff'} threshold={15} />}
      </mesh>
      {!dim && status !== 'none' && (
        <mesh position={[0, block.h / 2 + 0.28, 0]}>
          <sphereGeometry args={[0.17, 20, 20]} />
          <meshStandardMaterial color={STATUS_HEX[status]} emissive={STATUS_HEX[status]} emissiveIntensity={0.5} />
        </mesh>
      )}
      {!dim && (
        <Html position={[0, block.h / 2 + 0.7, 0]} center pointerEvents="none" zIndexRange={[10, 0]}>
          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-soft ${selected ? 'bg-text-primary text-white' : 'bg-surface/95 text-text-primary'}`}>
            {block.name || '이름 없는 구역'}
          </span>
        </Html>
      )}
    </group>
  )
}

// ─── glTF 모형 ─────────────────────────────────────────────────────
type EmissiveMaterial = { emissive?: { set: (c: string) => void }; emissiveIntensity?: number }

function GltfBuilding({ url, zones, selectedZoneId, onSelectZone }: { url: string; zones: CareManualZoneV2[]; selectedZoneId: string | null; onSelectZone: (id: string) => void }) {
  const { scene } = useGLTF(url)
  const invalidate = useThree(s => s.invalidate)
  const byMesh = useMemo(() => new Map(zones.filter(z => z.space?.mesh_key).map(z => [z.space!.mesh_key!, z])), [zones])
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)
  const selectedKey = zones.find(z => z.id === selectedZoneId)?.space?.mesh_key

  // 선택 강조는 렌더 밖(effect)에서 적용하고, 떠날 때 원래대로 돌려 놓는다 (useGLTF 가 씬을 캐시하므로)
  useEffect(() => {
    const touched: Mesh[] = []
    scene.traverse((o: Object3D) => {
      const m = o as Mesh
      if (!m.isMesh || !byMesh.has(m.name)) return
      const mat = m.material as EmissiveMaterial
      if (!mat.emissive) return
      mat.emissive.set(m.name === selectedKey ? '#38bdf8' : '#000000')
      mat.emissiveIntensity = m.name === selectedKey ? 0.5 : 0
      touched.push(m)
    })
    invalidate()
    return () => {
      touched.forEach(m => { const mat = m.material as EmissiveMaterial; mat.emissive?.set('#000000'); mat.emissiveIntensity = 0 })
    }
  }, [scene, byMesh, selectedKey, invalidate])
  useEffect(() => () => { useGLTF.clear(url) }, [url])

  return (
    <primitive
      object={scene}
      onClick={(e: { stopPropagation: () => void; object: Object3D }) => {
        e.stopPropagation()
        const zone = byMesh.get(e.object.name)
        if (zone) onSelectZone(zone.id)
      }}
      onPointerOver={(e: { stopPropagation: () => void; object: Object3D }) => { e.stopPropagation(); setHovered(byMesh.has(e.object.name)) }}
      onPointerOut={() => setHovered(false)}
    />
  )
}

/** glTF 로딩이 실패하면 블록 모형으로 */
class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: Error) { console.error('[space] 3D 모형 로딩 실패, 블록 모형으로 대체:', e.message) }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}
