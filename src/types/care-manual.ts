/**
 * 케어매뉴얼 데이터 형식
 *
 * v1 (레거시): customers.care_manual = CareManualSection[]  — 섹션 → 항목(이름·설명·사진 1장), 섹션 사진 포함
 * v2 (2026-11-03): customers.care_manual = CareManualV2       — 구역(탭) → 작업 묶음 → 작업 항목(지시문·주의·빈도·사진 여러 장)
 *
 * 읽는 쪽은 반드시 normalizeCareManual() 을 거쳐 v2 로 다룬다. 저장은 v2 만 한다.
 */

// ─── v1 (레거시, 호환용) ────────────────────────────────────────────
export interface CareManualItem {
  label: string
  desc: string
  image_url?: string
}

export interface CareManualSection {
  section: string
  items: CareManualItem[]
  image_url?: string
}

// ─── v2 ─────────────────────────────────────────────────────────────
export const ZONE_COLORS = ['sky', 'mint', 'apricot', 'lavender', 'lemon', 'rose'] as const
export type ZoneColor = (typeof ZONE_COLORS)[number]

export const FREQUENCY_OPTIONS = [
  { value: 'every',    label: '매회' },
  { value: 'weekly',   label: '주 1회' },
  { value: 'biweekly', label: '격주' },
  { value: 'monthly',  label: '월 1회' },
] as const
export type Frequency = (typeof FREQUENCY_OPTIONS)[number]['value']

export interface CareManualItemV2 {
  id: string
  /** 한 줄 제목 (예: 후드 필터 분리 세척) */
  title: string
  /** 작업 지시 — 여러 줄, '- ' 글머리표 허용 */
  instructions: string
  /** 주의사항 (선택) */
  caution?: string
  /** 작업 빈도 (선택) */
  frequency?: Frequency | null
  /** 사진 여러 장 */
  images: string[]
}

export interface CareManualGroupV2 {
  id: string
  title: string
  /** 한 줄 요약 (선택) */
  summary?: string
  items: CareManualItemV2[]
}

export interface CareManualZoneV2 {
  id: string
  name: string
  color: ZoneColor
  groups: CareManualGroupV2[]
}

/** 최신화 알림 한 줄 — "화장실 구역 최신화 · 11/3" (내용은 담지 않는다) */
export interface ManualUpdate {
  id: string
  zone_id: string
  zone_name: string
  /** ISO 시각 */
  at: string
}

export const MAX_MANUAL_UPDATES = 30

export interface CareManualV2 {
  version: 2
  zones: CareManualZoneV2[]
  /** 최근 최신화 기록 (최신이 앞). 저장 시 서버가 바뀐 구역을 자동으로 넣고, 관리자가 알림창에서 지울 수 있다 */
  updates?: ManualUpdate[]
  /** v1 에서 넘어온 섹션 사진 — 화면엔 안 보이지만 되돌리기용으로 보관 */
  legacy_section_images?: string[]
}

export function newManualId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().slice(0, 8)
  return Math.random().toString(36).slice(2, 10)
}

export const emptyItem = (): CareManualItemV2 => ({ id: newManualId(), title: '', instructions: '', images: [] })
export const emptyGroup = (): CareManualGroupV2 => ({ id: newManualId(), title: '', items: [emptyItem()] })
export const emptyZone = (name = '', index = 0): CareManualZoneV2 => ({
  id: newManualId(), name, color: ZONE_COLORS[index % ZONE_COLORS.length], groups: [],
})
export const emptyManual = (): CareManualV2 => ({ version: 2, zones: [] })

export function isManualV2(raw: unknown): raw is CareManualV2 {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as { version?: unknown }).version === 2
}

/** v1 섹션 배열 → v2 (전부 '기본 구역' 탭 하나에 담고 섹션 사진은 보관만) */
function fromLegacy(sections: CareManualSection[]): CareManualV2 {
  const legacyImages = sections.map(s => s.image_url).filter((u): u is string => !!u)
  const groups: CareManualGroupV2[] = sections.map(s => ({
    id: newManualId(),
    title: s.section ?? '',
    items: (s.items ?? []).map(i => ({
      id: newManualId(),
      title: i.label ?? '',
      instructions: i.desc ?? '',
      images: i.image_url ? [i.image_url] : [],
    })),
  }))
  if (groups.length === 0) return emptyManual()
  return {
    version: 2,
    zones: [{ id: newManualId(), name: '기본 구역', color: 'sky', groups }],
    ...(legacyImages.length > 0 ? { legacy_section_images: legacyImages } : {}),
  }
}

/** 빠진 필드를 채워 안전한 v2 로 (DB 에 손으로 고친 값이 있어도 화면이 깨지지 않게) */
function sanitizeV2(raw: CareManualV2): CareManualV2 {
  const zones = (Array.isArray(raw.zones) ? raw.zones : []).map((z, zi) => ({
    id: z.id || newManualId(),
    name: z.name ?? '',
    color: (ZONE_COLORS as readonly string[]).includes(z.color) ? z.color : ZONE_COLORS[zi % ZONE_COLORS.length],
    groups: (Array.isArray(z.groups) ? z.groups : []).map(g => ({
      id: g.id || newManualId(),
      title: g.title ?? '',
      ...(g.summary ? { summary: g.summary } : {}),
      items: (Array.isArray(g.items) ? g.items : []).map(i => ({
        id: i.id || newManualId(),
        title: i.title ?? '',
        instructions: i.instructions ?? '',
        ...(i.caution ? { caution: i.caution } : {}),
        ...(i.frequency ? { frequency: i.frequency } : {}),
        images: Array.isArray(i.images) ? i.images.filter((u): u is string => typeof u === 'string' && !!u) : [],
      })),
    })),
  }))
  const updates = (Array.isArray(raw.updates) ? raw.updates : [])
    .filter(u => !!u && typeof u === 'object' && typeof u.zone_id === 'string' && typeof u.at === 'string')
    .map(u => ({ id: u.id || newManualId(), zone_id: u.zone_id, zone_name: u.zone_name ?? '', at: u.at }))
    .slice(0, MAX_MANUAL_UPDATES)
  return {
    version: 2, zones,
    ...(updates.length ? { updates } : {}),
    ...(raw.legacy_section_images?.length ? { legacy_section_images: raw.legacy_section_images } : {}),
  }
}

/** DB 값(v1 배열 · v2 객체 · null) → v2 */
export function normalizeCareManual(raw: unknown): CareManualV2 {
  if (isManualV2(raw)) return sanitizeV2(raw)
  if (Array.isArray(raw)) return fromLegacy(raw as CareManualSection[])
  return emptyManual()
}

/** 구역 내용 지문 — 이름·묶음·항목이 하나라도 다르면 "최신화"로 본다 (id 는 제외하지 않음: 항목 추가·삭제도 변경) */
function zoneFingerprint(z: CareManualZoneV2): string {
  return JSON.stringify({ name: z.name, groups: z.groups })
}

const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

/**
 * 저장 직전: 이전 저장본과 비교해 바뀐 구역마다 최신화 기록을 앞에 넣는다.
 *   - 같은 구역을 같은 날(KST) 여러 번 고치면 기록 하나로 합치고 시각만 갱신
 *   - 삭제된 구역은 갈 곳이 없으므로 기록하지 않음
 *   - 기록 목록 자체는 next(화면에서 지운 항목 반영)를 기준으로 한다
 */
export function appendZoneUpdates(prev: CareManualV2, next: CareManualV2, now = new Date()): CareManualV2 {
  const prevById = new Map(prev.zones.map(z => [z.id, zoneFingerprint(z)]))
  const changed = next.zones.filter(z => prevById.get(z.id) !== zoneFingerprint(z))
  if (changed.length === 0) return next
  const at = now.toISOString()
  const today = kstDay(at)
  let updates = [...(next.updates ?? [])]
  for (const z of changed) {
    const sameDay = updates.find(u => u.zone_id === z.id && kstDay(u.at) === today)
    updates = sameDay
      ? updates.filter(u => u.id !== sameDay.id)
      : updates
    updates = [{ id: sameDay?.id ?? newManualId(), zone_id: z.id, zone_name: z.name, at }, ...updates]
  }
  return { ...next, updates: updates.slice(0, MAX_MANUAL_UPDATES) }
}

export function countManualItems(manual: CareManualV2): number {
  return manual.zones.reduce((n, z) => n + z.groups.reduce((m, g) => m + g.items.length, 0), 0)
}

export function isManualEmpty(manual: CareManualV2): boolean {
  return manual.zones.length === 0 || countManualItems(manual) === 0
}
