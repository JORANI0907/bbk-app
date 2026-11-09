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

// ─── 공간 보기 (2026-11-08) — 360 사진 · 사진 위 표시 · 3D 모형 연결 ─────────
/**
 * 사진 위 표시(마커). 위치는 Photo Sphere Viewer 의 yaw/pitch(라디안).
 *   point   : 점 하나 (설비 한 개)
 *   polygon : 꼭짓점 여러 개로 둘러싼 영역 (바닥·벽면처럼 넓은 대상)
 * 품목 이름·빈도·설명은 item_id 로 목록에서 가져오므로 여기엔 넣지 않는다.
 */
export interface PanoMarkerV2 {
  id: string
  item_id: string
  type: 'point' | 'polygon'
  /** point · 360 사진: 각도(라디안) */
  yaw?: number
  pitch?: number
  /** point · 평면 사진: 사진 위 비율 0~1 (x 오른쪽, y 아래) */
  x?: number
  y?: number
  /** polygon — 360 이면 [yaw, pitch][], 평면이면 [x, y][] (0~1). 사진 kind 로 해석 */
  points?: [number, number][]
  /** 관리자 한 줄 코멘트 (선택) */
  note?: string
}

/** 구역 사진 종류 — flat(일반 사진, 기본) · 360(등장방형 2:1) */
export type PhotoKind = 'flat' | '360'

/**
 * 구역 사진 (필드 이름은 호환을 위해 panoramas 그대로). 2026-11-08 평면 사진이 기본이 됨.
 *   kind 가 없으면 예전 데이터 = 360.
 */
export interface PanoramaV2 {
  id: string
  title: string
  image_url: string
  thumb_url?: string
  kind?: PhotoKind
  /** 품목 사진에서 가져온 경우 그 품목 id */
  source_item_id?: string
  markers: PanoMarkerV2[]
}

export const photoKind = (p: PanoramaV2): PhotoKind => p.kind ?? '360'

/** 자료함 — 도면·건축물대장·참고사진 (관리자·직원만 봄, 고객에겐 안 보임). 3D 모형 제작의 원본 자료 */
export const ASSET_KINDS = [
  { value: 'floorplan', label: '도면' },
  { value: 'register',  label: '건축물대장' },
  { value: 'photo',     label: '참고사진' },
  { value: 'other',     label: '기타' },
] as const
export type AssetKind = (typeof ASSET_KINDS)[number]['value']

export interface SpaceAssetV2 {
  id: string
  kind: AssetKind
  title: string
  url: string
  /** image/jpeg · application/pdf 등 */
  mime: string
  /** 바이트 */
  size: number
  /** 어느 구역 자료인지 (선택) */
  zone_id?: string
  /** ISO 시각 */
  uploaded_at: string
}

/**
 * 도면 분석 결과 — 층별 방 윤곽 (2026-11-08)
 *   좌표는 도면 이미지 기준 0~1 비율 (x 오른쪽, y 아래). 평면도(SVG)와 3D(벽 올리기)가 이 좌표로 그린다.
 *   방은 zone_id 로 구역과 연결된다. 연결 안 된 방은 회색으로 보이고 클릭해도 아무 일 없음.
 */
export const ROOM_KINDS = ['room', 'corridor', 'core', 'outdoor'] as const
export type RoomKind = (typeof ROOM_KINDS)[number]

export interface RoomV2 {
  id: string
  name: string
  kind: RoomKind
  /** [x, y][] 0~1, 3개 이상 */
  polygon: [number, number][]
  zone_id?: string
}

export interface FloorPlanV2 {
  id: string
  floor: number
  /** 도면 이미지 가로/세로 비율 (3D 에서 층 크기를 맞출 때) */
  aspect: number
  /** 어떤 자료에서 뽑았는지 (선택) */
  source_asset_id?: string
  /** 평면도 배경으로 깔 도면 이미지 (PDF 면 없음) */
  image_url?: string
  rooms: RoomV2[]
}

/** 3D 모형 안에서 이 구역이 어디인지. 모형 파일이 없으면 floor 만으로 자동 배치한다 */
export interface ZoneSpaceV2 {
  /** 층 (지하는 음수) */
  floor: number
  /** glTF 모형 안의 메시 이름 (도면 기반 모형이 생기면 연결) */
  mesh_key?: string
}

export interface CareManualZoneV2 {
  id: string
  name: string
  color: ZoneColor
  groups: CareManualGroupV2[]
  panoramas?: PanoramaV2[]
  space?: ZoneSpaceV2
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
  /** 도면 기반 3D 모형(glTF) 주소. 없으면 구역·층 정보로 간단 모형을 자동 생성 */
  space_model_url?: string
  /** 자료함 (도면·건축물대장·참고사진) */
  assets?: SpaceAssetV2[]
  /** 도면 분석으로 얻은 층별 방 윤곽 — 있으면 3D·평면이 이걸로 그려진다 */
  floor_plans?: FloorPlanV2[]
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

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const optStr = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string' && !!u) : [])
const FREQ_VALUES: readonly string[] = FREQUENCY_OPTIONS.map(o => o.value)
const freq = (v: unknown): Frequency | undefined => (typeof v === 'string' && FREQ_VALUES.includes(v) ? (v as Frequency) : undefined)

/**
 * v1 섹션 배열 → v2 (전부 '기본 구역' 탭 하나에 담고 섹션 사진은 보관만)
 *   id 는 위치 기반으로 고정(s0-i2 …) — 불러올 때마다 바뀌면 점검 기록의 item_id 와 어긋난다.
 */
function fromLegacy(sections: CareManualSection[]): CareManualV2 {
  const valid = sections.filter(isObj) as unknown as CareManualSection[]
  const legacyImages = valid.map(s => s.image_url).filter((u): u is string => typeof u === 'string' && !!u)
  const groups: CareManualGroupV2[] = valid.map((s, si) => ({
    id: `s${si}`,
    title: str(s.section),
    items: (Array.isArray(s.items) ? s.items : []).filter(isObj).map((i, ii) => ({
      id: `s${si}-i${ii}`,
      title: str(i.label),
      instructions: str(i.desc),
      images: typeof i.image_url === 'string' && i.image_url ? [i.image_url] : [],
    })),
  }))
  if (groups.length === 0) return emptyManual()
  return {
    version: 2,
    zones: [{ id: 'legacy', name: '기본 구역', color: 'sky', groups }],
    ...(legacyImages.length > 0 ? { legacy_section_images: legacyImages } : {}),
  }
}

const unit = (v: number) => Math.min(1, Math.max(0, v))

function sanitizeMarker(raw: unknown, idx: number, kind: PhotoKind): PanoMarkerV2 | null {
  if (!isObj(raw)) return null
  const m = raw as Partial<PanoMarkerV2>
  if (typeof m.item_id !== 'string' || !m.item_id) return null
  const note = optStr(m.note)
  const base = { id: optStr(m.id) ?? `m${idx}`, item_id: m.item_id, ...(note ? { note } : {}) }
  if (m.type === 'polygon') {
    const points = (Array.isArray(m.points) ? m.points : [])
      .filter((p): p is [number, number] => Array.isArray(p) && isNum(p[0]) && isNum(p[1]))
      .map((p): [number, number] => (kind === 'flat' ? [unit(p[0]), unit(p[1])] : p))
    return points.length >= 3 ? { ...base, type: 'polygon', points } : null
  }
  if (kind === 'flat') return isNum(m.x) && isNum(m.y) ? { ...base, type: 'point', x: unit(m.x), y: unit(m.y) } : null
  return isNum(m.yaw) && isNum(m.pitch) ? { ...base, type: 'point', yaw: m.yaw, pitch: m.pitch } : null
}

function sanitizePanoramas(raw: unknown, zoneId: string): PanoramaV2[] {
  return (Array.isArray(raw) ? raw : [])
    .filter(isObj)
    .map(p => p as Partial<PanoramaV2>)
    .filter(p => typeof p.image_url === 'string' && !!p.image_url)
    .map((p, pi) => {
      const thumb = optStr(p.thumb_url)
      const kind: PhotoKind = p.kind === 'flat' ? 'flat' : '360'
      const src = optStr(p.source_item_id)
      return {
        id: optStr(p.id) ?? `${zoneId}-p${pi}`,
        title: str(p.title),
        image_url: p.image_url as string,
        ...(thumb ? { thumb_url: thumb } : {}),
        ...(p.kind === 'flat' ? { kind } : {}),
        ...(src ? { source_item_id: src } : {}),
        markers: (Array.isArray(p.markers) ? p.markers : []).map((m, mi) => sanitizeMarker(m, mi, kind)).filter((m): m is PanoMarkerV2 => m !== null),
      }
    })
}

function sanitizeSpace(raw: unknown): ZoneSpaceV2 | undefined {
  if (!isObj(raw) || !isNum(raw.floor)) return undefined
  const mesh = optStr(raw.mesh_key)
  return { floor: Math.trunc(raw.floor), ...(mesh ? { mesh_key: mesh } : {}) }
}

function sanitizeItem(raw: unknown, idx: number, groupId: string): CareManualItemV2 {
  const i = raw as Partial<CareManualItemV2>
  const caution = optStr(i.caution)
  const f = freq(i.frequency)
  return {
    id: optStr(i.id) ?? `${groupId}-i${idx}`,
    title: str(i.title),
    instructions: str(i.instructions),
    ...(caution ? { caution } : {}),
    ...(f ? { frequency: f } : {}),
    images: strList(i.images),
  }
}

function sanitizeGroup(raw: unknown, idx: number, zoneId: string): CareManualGroupV2 {
  const g = raw as Partial<CareManualGroupV2>
  const id = optStr(g.id) ?? `${zoneId}-g${idx}`
  const summary = optStr(g.summary)
  return {
    id,
    title: str(g.title),
    ...(summary ? { summary } : {}),
    items: (Array.isArray(g.items) ? g.items : []).filter(isObj).map((i, ii) => sanitizeItem(i, ii, id)),
  }
}

function sanitizeZone(raw: unknown, idx: number): CareManualZoneV2 {
  const z = raw as Partial<CareManualZoneV2>
  const id = optStr(z.id) ?? `z${idx}`
  const panoramas = sanitizePanoramas(z.panoramas, id)
  const space = sanitizeSpace(z.space)
  const color = typeof z.color === 'string' && (ZONE_COLORS as readonly string[]).includes(z.color) ? (z.color as ZoneColor) : ZONE_COLORS[idx % ZONE_COLORS.length]
  return {
    id,
    name: str(z.name),
    color,
    ...(panoramas.length ? { panoramas } : {}),
    ...(space ? { space } : {}),
    groups: (Array.isArray(z.groups) ? z.groups : []).filter(isObj).map((g, gi) => sanitizeGroup(g, gi, id)),
  }
}

/**
 * 빠진 필드를 채워 안전한 v2 로 (DB 에 손으로 고친 값이 있어도 화면이 깨지지 않게)
 *   - 배열 안의 null·문자열 등 객체가 아닌 요소는 버린다
 *   - 문자열 자리에 다른 타입이 오면 빈 문자열로, 빈도는 정해진 값만 허용
 *   - id 가 없으면 위치 기반으로 고정 생성 (불러올 때마다 바뀌면 점검 기록과 어긋난다)
 */
const ASSET_KIND_VALUES: readonly string[] = ASSET_KINDS.map(k => k.value)

function sanitizeAsset(raw: unknown, idx: number): SpaceAssetV2 | null {
  if (!isObj(raw)) return null
  const a = raw as Partial<SpaceAssetV2>
  if (typeof a.url !== 'string' || !a.url) return null
  const zone = optStr(a.zone_id)
  return {
    id: optStr(a.id) ?? `a${idx}`,
    kind: typeof a.kind === 'string' && ASSET_KIND_VALUES.includes(a.kind) ? (a.kind as AssetKind) : 'other',
    title: str(a.title),
    url: a.url,
    mime: str(a.mime, 'application/octet-stream'),
    size: isNum(a.size) ? a.size : 0,
    ...(zone ? { zone_id: zone } : {}),
    uploaded_at: str(a.uploaded_at),
  }
}

const ROOM_KIND_VALUES: readonly string[] = ROOM_KINDS

function sanitizePoint(p: unknown): [number, number] | null {
  if (!Array.isArray(p) || !isNum(p[0]) || !isNum(p[1])) return null
  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  return [clamp(p[0]), clamp(p[1])]
}

function sanitizeRoom(raw: unknown, idx: number, planId: string): RoomV2 | null {
  if (!isObj(raw)) return null
  const r = raw as Partial<RoomV2>
  const polygon = (Array.isArray(r.polygon) ? r.polygon : []).map(sanitizePoint).filter((p): p is [number, number] => p !== null)
  if (polygon.length < 3) return null
  const zone = optStr(r.zone_id)
  return {
    id: optStr(r.id) ?? `${planId}-r${idx}`,
    name: str(r.name),
    kind: typeof r.kind === 'string' && ROOM_KIND_VALUES.includes(r.kind) ? (r.kind as RoomKind) : 'room',
    polygon,
    ...(zone ? { zone_id: zone } : {}),
  }
}

function sanitizeFloorPlan(raw: unknown, idx: number): FloorPlanV2 | null {
  if (!isObj(raw)) return null
  const f = raw as Partial<FloorPlanV2>
  if (!isNum(f.floor)) return null
  const id = optStr(f.id) ?? `fp${idx}`
  const rooms = (Array.isArray(f.rooms) ? f.rooms : []).map((r, ri) => sanitizeRoom(r, ri, id)).filter((r): r is RoomV2 => r !== null)
  const src = optStr(f.source_asset_id)
  const img = optStr(f.image_url)
  return {
    id,
    floor: Math.trunc(f.floor),
    aspect: isNum(f.aspect) && f.aspect > 0.1 && f.aspect < 10 ? f.aspect : 1.4,
    ...(src ? { source_asset_id: src } : {}),
    ...(img ? { image_url: img } : {}),
    rooms,
  }
}

function sanitizeV2(raw: CareManualV2): CareManualV2 {
  const zones = (Array.isArray(raw.zones) ? raw.zones : []).filter(isObj).map(sanitizeZone)
  const assets = (Array.isArray(raw.assets) ? raw.assets : []).map(sanitizeAsset).filter((a): a is SpaceAssetV2 => a !== null)
  const floorPlans = (Array.isArray(raw.floor_plans) ? raw.floor_plans : []).map(sanitizeFloorPlan).filter((f): f is FloorPlanV2 => f !== null)
  const updates = (Array.isArray(raw.updates) ? raw.updates : [])
    .filter(isObj)
    .map(u => u as Partial<ManualUpdate>)
    .filter(u => typeof u.zone_id === 'string' && typeof u.at === 'string')
    .map((u, ui) => ({ id: optStr(u.id) ?? `u${ui}`, zone_id: u.zone_id as string, zone_name: str(u.zone_name), at: u.at as string }))
    .slice(0, MAX_MANUAL_UPDATES)
  const legacy = strList(raw.legacy_section_images)
  const modelUrl = optStr(raw.space_model_url)
  return {
    version: 2, zones,
    ...(updates.length ? { updates } : {}),
    ...(legacy.length ? { legacy_section_images: legacy } : {}),
    ...(modelUrl ? { space_model_url: modelUrl } : {}),
    ...(assets.length ? { assets } : {}),
    ...(floorPlans.length ? { floor_plans: floorPlans } : {}),
  }
}

/** DB 값(v1 배열 · v2 객체 · null) → v2 */
export function normalizeCareManual(raw: unknown): CareManualV2 {
  if (isManualV2(raw)) return sanitizeV2(raw)
  if (Array.isArray(raw)) return fromLegacy(raw as CareManualSection[])
  return emptyManual()
}

/**
 * 구역 내용 지문 — 이름·묶음·항목이 하나라도 다르면 "최신화"로 본다 (id 는 제외하지 않음: 항목 추가·삭제도 변경)
 *   공간 정보(360 사진·표시·층)는 일부러 뺀다 — 사진만 바뀐 건 "작업 내용 최신화"가 아니다.
 */
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

/** 모든 품목을 구역 정보와 함께 한 줄로 (마커 → 품목 찾기, 선택 목록 만들기용) */
export interface FlatManualItem {
  item: CareManualItemV2
  zone: CareManualZoneV2
  group: CareManualGroupV2
  /** 구역 안 번호 (1부터) */
  index: number
}

export function flattenManualItems(manual: CareManualV2): FlatManualItem[] {
  const out: FlatManualItem[] = []
  for (const zone of manual.zones) {
    let n = 0
    for (const group of zone.groups) {
      for (const item of group.items) {
        n += 1
        out.push({ item, zone, group, index: n })
      }
    }
  }
  return out
}

/** 품목 하나를 가리키는 사진 위 표시 (품목 → 표시 역방향 찾기용) */
export interface MarkerRef {
  zone_id: string
  zone_name: string
  pano_id: string
  pano_title: string
  thumb_url?: string
  marker_id: string
  type: PanoMarkerV2['type']
  note?: string
}

/** item_id → 그 품목을 가리키는 표시 목록 (작업 목록에서 "표시 n" 칩과 [사진에서 보기]에 쓴다) */
export function indexMarkersByItem(manual: CareManualV2): Record<string, MarkerRef[]> {
  const out: Record<string, MarkerRef[]> = {}
  for (const zone of manual.zones) {
    ;(zone.panoramas ?? []).forEach((pano, pi) => {
      for (const m of pano.markers) {
        const ref: MarkerRef = {
          zone_id: zone.id, zone_name: zone.name, pano_id: pano.id, pano_title: pano.title || `지점 ${pi + 1}`,
          ...(pano.thumb_url ? { thumb_url: pano.thumb_url } : {}), marker_id: m.id, type: m.type, ...(m.note ? { note: m.note } : {}),
        }
        out[m.item_id] = [...(out[m.item_id] ?? []), ref]
      }
    })
  }
  return out
}

export function countPanoramas(manual: CareManualV2): number {
  return manual.zones.reduce((n, z) => n + (z.panoramas?.length ?? 0), 0)
}

export function countManualItems(manual: CareManualV2): number {
  return manual.zones.reduce((n, z) => n + z.groups.reduce((m, g) => m + g.items.length, 0), 0)
}

export function isManualEmpty(manual: CareManualV2): boolean {
  return manual.zones.length === 0 || countManualItems(manual) === 0
}
