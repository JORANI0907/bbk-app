'use client'

/**
 * 케어매뉴얼 보기 묶음 (고객 · 데모 · 직원 점검 공용, 2026-11-08)
 *   위: [공간 보기 | 메뉴얼 목록] 전환  ·  두 탭은 같은 구역을 가리킨다
 *   공간 보기에서 "메뉴얼에서 보기" → 목록 탭으로 넘어가며 그 품목까지 스크롤
 *   canCheck(직원) 이면 목록에서 완료·특이사항을 남기고, 그 즉시 표시 색이 바뀐다
 */

import { useMemo, useState } from 'react'
import { Box, ListChecks } from 'lucide-react'
import toast from 'react-hot-toast'
import type { CareManualV2, CareManualItemV2, MarkerRef } from '@/types/care-manual'
import { countPanoramas, indexMarkersByItem } from '@/types/care-manual'
import type { CareCheck, CheckStatus } from '@/lib/care-manual-status'
import { computeManualStatuses, latestByItem } from '@/lib/care-manual-status'
import { CareManualViewer } from './CareManualViewer'
import { SpaceView, type MarkerFocus } from './space/SpaceView'
import { SpaceAssetsPanel } from './space/SpaceAssetsPanel'

interface Props {
  manual: CareManualV2
  initialChecks: CareCheck[]
  /** 점검 저장에 필요 (직원·관리자) */
  customerId?: string
  canCheck?: boolean
  emptyText?: string
  emptyHint?: string
}

type Tab = 'space' | 'list'

export function CareManualPortal({ manual, initialChecks, customerId, canCheck = false, emptyText, emptyHint }: Props) {
  const hasSpace = countPanoramas(manual) > 0 || manual.zones.some(z => z.space)
  const [tab, setTab] = useState<Tab>(hasSpace ? 'space' : 'list')
  const [zoneId, setZoneId] = useState<string | null>(manual.zones[0]?.id ?? null)
  const [focus, setFocus] = useState<{ itemId: string | null; key: number }>({ itemId: null, key: 0 })
  const [checks, setChecks] = useState<CareCheck[]>(initialChecks)
  const [focusMarker, setFocusMarker] = useState<MarkerFocus | null>(null)
  const markerIndex = useMemo(() => indexMarkersByItem(manual), [manual])

  const latest = useMemo(() => latestByItem(checks), [checks])
  const statuses = useMemo(() => computeManualStatuses(manual, latest), [manual, latest])

  /** 메뉴얼 목록 → [사진에서 보기] → 공간 보기에서 그 사진·표시 선택 */
  const showMarker = (ref: MarkerRef) => {
    setZoneId(ref.zone_id)
    setTab('space')
    setFocusMarker(f => ({ panoId: ref.pano_id, markerId: ref.marker_id, key: (f?.key ?? 0) + 1 }))
  }

  const goToItem = (zId: string, itemId: string) => {
    setZoneId(zId)
    setTab('list')
    setFocus(f => ({ itemId, key: f.key + 1 }))
  }

  const onCheck = canCheck && customerId ? async (item: CareManualItemV2, zId: string, status: CheckStatus, memo: string) => {
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/care-manual/checks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: item.id, zone_id: zId, status, memo }),
      })
      const body = await res.json().catch(() => ({})) as { check?: CareCheck; error?: string }
      if (!res.ok || !body.check) throw new Error(body.error ?? '저장 실패')
      setChecks(prev => [body.check!, ...prev])
      toast.success(status === 'ok' ? `"${item.title}" 완료 기록됨` : `"${item.title}" 특이사항 기록됨`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '점검 저장 실패')
    }
  } : undefined

  return (
    <div className="flex flex-col gap-4">
      {hasSpace && (
        <div className="inline-flex self-start rounded-xl bg-surface-sunken p-1">
          <TabBtn active={tab === 'space'} onClick={() => setTab('space')} icon={<Box size={15} />} label="공간 보기" />
          <TabBtn active={tab === 'list'} onClick={() => setTab('list')} icon={<ListChecks size={15} />} label="메뉴얼 목록" />
        </div>
      )}

      {/* 자료함은 직원(현장 점검)에게만 — 고객 화면에는 내려가지 않는다 */}
      {canCheck && (manual.assets?.length ?? 0) > 0 && <SpaceAssetsPanel assets={manual.assets ?? []} zones={manual.zones} />}

      {tab === 'space' && hasSpace ? (
        <SpaceView manual={manual} statuses={statuses} latest={latest} activeZoneId={zoneId} onSelectZone={setZoneId} onGoToItem={goToItem} focusMarker={focusMarker} />
      ) : (
        <CareManualViewer
          manual={manual}
          statuses={statuses}
          latest={latest}
          activeZoneId={zoneId}
          onActiveZoneChange={setZoneId}
          focusItemId={focus.itemId}
          focusKey={focus.key}
          onCheck={onCheck}
          markerIndex={markerIndex}
          onShowMarker={hasSpace ? showMarker : undefined}
          emptyText={emptyText}
          emptyHint={emptyHint}
        />
      )}
    </div>
  )
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition-all ${active ? 'bg-surface text-text-primary shadow-segment' : 'text-text-secondary hover:text-text-primary'}`}>
      {icon} {label}
    </button>
  )
}
