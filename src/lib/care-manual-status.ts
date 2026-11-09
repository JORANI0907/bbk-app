/**
 * 케어매뉴얼 품목 "관리 상태" 계산 (2026-11-08)
 *
 *   상태는 DB 에 저장하지 않고 매번 계산한다 — 점검 기록과 색이 어긋나는 사고를 막기 위해.
 *   입력: 품목 빈도 + 그 품목의 가장 최근 점검 기록
 *   출력: ok(초록) | due(노랑, 점검 확인 필요) | issue(빨강, 특이사항) | none(회색, 기록 없음·빈도 없음)
 */

import type { Frequency, CareManualV2 } from '@/types/care-manual'
import { flattenManualItems } from '@/types/care-manual'

export type CheckStatus = 'ok' | 'issue'
export type ItemStatus = 'ok' | 'due' | 'issue' | 'none'

export interface CareCheck {
  id: string
  customer_id: string
  item_id: string
  zone_id: string | null
  status: CheckStatus
  memo: string | null
  photo_url: string | null
  worker_name: string | null
  checked_at: string
}

/** 품목별 최신 점검 1건 */
export type LatestChecks = Record<string, CareCheck>

/**
 * 빈도별 "이 날짜 안에 점검이 있어야 정상" 허용 일수. 여유 2일을 둔다.
 *   매회(every) 는 서비스 주기를 모르므로 2주로 본다.
 */
export const DUE_DAYS: Record<Frequency, number> = {
  every: 14,
  weekly: 9,
  biweekly: 16,
  monthly: 33,
}

export const STATUS_LABEL: Record<ItemStatus, string> = {
  ok: '정상',
  due: '점검 확인 필요',
  issue: '특이사항',
  none: '기록 없음',
}

/** 마커·3D 점 색 (hex). Tailwind state 토큰과 같은 값 */
export const STATUS_HEX: Record<ItemStatus, string> = {
  ok: '#16a34a',
  due: '#f59e0b',
  issue: '#dc2626',
  none: '#94a3b8',
}

const DAY_MS = 24 * 60 * 60 * 1000

export function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS)
}

export function computeItemStatus(frequency: Frequency | null | undefined, latest: CareCheck | undefined, now = new Date()): ItemStatus {
  if (!latest) return frequency ? 'due' : 'none'
  if (latest.status === 'issue') return 'issue'
  if (!frequency) return 'ok'
  return daysSince(latest.checked_at, now) > DUE_DAYS[frequency] ? 'due' : 'ok'
}

/** 여러 상태 중 가장 나쁜 것 (구역·3D 덩어리 색 정할 때) */
export function worstStatus(statuses: ItemStatus[]): ItemStatus {
  if (statuses.includes('issue')) return 'issue'
  if (statuses.includes('due')) return 'due'
  if (statuses.includes('ok')) return 'ok'
  return 'none'
}

/** 점검 기록 목록 → 품목별 최신 1건 */
export function latestByItem(checks: CareCheck[]): LatestChecks {
  return checks.reduce<LatestChecks>((acc, c) => {
    const prev = acc[c.item_id]
    return !prev || new Date(c.checked_at) > new Date(prev.checked_at) ? { ...acc, [c.item_id]: c } : acc
  }, {})
}

/** 매뉴얼 전체 품목 상태표 (item_id → 상태) */
export function computeManualStatuses(manual: CareManualV2, latest: LatestChecks, now = new Date()): Record<string, ItemStatus> {
  return Object.fromEntries(
    flattenManualItems(manual).map(({ item }) => [item.id, computeItemStatus(item.frequency, latest[item.id], now)]),
  )
}

/** 구역 하나의 종합 상태 */
export function zoneStatus(zoneId: string, manual: CareManualV2, statuses: Record<string, ItemStatus>): ItemStatus {
  const ids = flattenManualItems(manual).filter(f => f.zone.id === zoneId).map(f => f.item.id)
  return worstStatus(ids.map(id => statuses[id] ?? 'none'))
}

/** "11/5" 같은 짧은 날짜 (KST) */
export function fmtCheckDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}
