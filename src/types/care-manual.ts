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

export interface CareManualV2 {
  version: 2
  zones: CareManualZoneV2[]
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
  return { version: 2, zones, ...(raw.legacy_section_images?.length ? { legacy_section_images: raw.legacy_section_images } : {}) }
}

/** DB 값(v1 배열 · v2 객체 · null) → v2 */
export function normalizeCareManual(raw: unknown): CareManualV2 {
  if (isManualV2(raw)) return sanitizeV2(raw)
  if (Array.isArray(raw)) return fromLegacy(raw as CareManualSection[])
  return emptyManual()
}

export function countManualItems(manual: CareManualV2): number {
  return manual.zones.reduce((n, z) => n + z.groups.reduce((m, g) => m + g.items.length, 0), 0)
}

export function isManualEmpty(manual: CareManualV2): boolean {
  return manual.zones.length === 0 || countManualItems(manual) === 0
}
