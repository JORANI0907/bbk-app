/**
 * Notion 백업 유틸리티
 * Notion API를 통해 Supabase 데이터를 Notion DB에 upsert
 * Rate limit: 3 req/s → 350ms 간격으로 호출
 */

const NOTION_API_BASE = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'
const RATE_LIMIT_DELAY_MS = 350

function getNotionHeaders(): Record<string, string> {
  const apiKey = process.env.NOTION_API_KEY
  if (!apiKey) throw new Error('NOTION_API_KEY 환경변수가 설정되지 않았습니다.')
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Notion DB에서 title(id) 기준으로 기존 페이지 검색
 */
export async function findNotionPageByRecordId(
  databaseId: string,
  recordId: string,
): Promise<string | null> {
  const res = await fetch(`${NOTION_API_BASE}/databases/${databaseId}/query`, {
    method: 'POST',
    headers: getNotionHeaders(),
    body: JSON.stringify({
      filter: {
        property: 'id',
        title: { equals: recordId },
      },
      page_size: 1,
    }),
  })
  if (!res.ok) return null
  const json = await res.json() as { results: Array<{ id: string }> }
  return json.results?.[0]?.id ?? null
}

/**
 * Notion 페이지 생성
 */
export async function createNotionPage(
  databaseId: string,
  properties: Record<string, unknown>,
): Promise<{ id: string } | null> {
  const res = await fetch(`${NOTION_API_BASE}/pages`, {
    method: 'POST',
    headers: getNotionHeaders(),
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties,
    }),
  })
  if (!res.ok) return null
  return res.json() as Promise<{ id: string }>
}

/**
 * Notion 페이지 업데이트
 */
export async function updateNotionPage(
  pageId: string,
  properties: Record<string, unknown>,
): Promise<boolean> {
  const res = await fetch(`${NOTION_API_BASE}/pages/${pageId}`, {
    method: 'PATCH',
    headers: getNotionHeaders(),
    body: JSON.stringify({ properties }),
  })
  return res.ok
}

/**
 * Notion 페이지 upsert (없으면 생성, 있으면 업데이트)
 */
export async function upsertNotionPage(
  databaseId: string,
  recordId: string,
  properties: Record<string, unknown>,
): Promise<'created' | 'updated' | 'error'> {
  try {
    const existingPageId = await findNotionPageByRecordId(databaseId, recordId)
    await sleep(RATE_LIMIT_DELAY_MS)

    if (existingPageId) {
      const ok = await updateNotionPage(existingPageId, properties)
      await sleep(RATE_LIMIT_DELAY_MS)
      return ok ? 'updated' : 'error'
    } else {
      const page = await createNotionPage(databaseId, properties)
      await sleep(RATE_LIMIT_DELAY_MS)
      return page ? 'created' : 'error'
    }
  } catch {
    return 'error'
  }
}

/** null/undefined를 Notion rich_text용 빈 문자열로 */
function safeText(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

/** Notion title property */
export function notionTitle(val: unknown): { title: Array<{ text: { content: string } }> } {
  return { title: [{ text: { content: safeText(val) } }] }
}

/** Notion rich_text property */
export function notionText(val: unknown): { rich_text: Array<{ text: { content: string } }> } {
  const text = safeText(val)
  // Notion rich_text 최대 2000자 제한
  const truncated = text.length > 2000 ? text.slice(0, 1997) + '...' : text
  return { rich_text: [{ text: { content: truncated } }] }
}

/** Notion number property */
export function notionNumber(val: unknown): { number: number | null } {
  if (val === null || val === undefined) return { number: null }
  const n = Number(val)
  return { number: isNaN(n) ? null : n }
}

/** Notion date property */
export function notionDate(val: unknown): { date: { start: string } | null } {
  if (!val) return { date: null }
  return { date: { start: String(val) } }
}

/** Notion checkbox property */
export function notionCheckbox(val: unknown): { checkbox: boolean } {
  return { checkbox: Boolean(val) }
}

/** Notion select property */
export function notionSelect(val: unknown): { select: { name: string } | null } {
  if (!val) return { select: null }
  return { select: { name: String(val) } }
}

/** Notion email property */
export function notionEmail(val: unknown): { email: string | null } {
  if (!val) return { email: null }
  return { email: String(val) }
}

/** Notion phone_number property */
export function notionPhone(val: unknown): { phone_number: string | null } {
  if (!val) return { phone_number: null }
  return { phone_number: String(val) }
}

/** Notion url property */
export function notionUrl(val: unknown): { url: string | null } {
  if (!val) return { url: null }
  const s = String(val)
  return { url: s.startsWith('http') ? s : null }
}

// ─────────────────────────────────────────────────────────────
// 테이블별 Notion properties 변환
// ─────────────────────────────────────────────────────────────

export type CustomerRow = Record<string, unknown>
export type ApplicationRow = Record<string, unknown>
export type ScheduleRow = Record<string, unknown>
export type WorkerRow = Record<string, unknown>

export function customerToNotionProps(row: CustomerRow): Record<string, unknown> {
  return {
    id: notionTitle(row.id),
    business_name: notionText(row.business_name),
    business_number: notionText(row.business_number),
    contact_name: notionText(row.contact_name),
    contact_phone: notionPhone(row.contact_phone),
    email: notionEmail(row.email),
    address: notionText(row.address),
    address_detail: notionText(row.address_detail),
    platform_nickname: notionText(row.platform_nickname),
    account_number: notionText(row.account_number),
    payment_method: notionText(row.payment_method),
    customer_type: notionSelect(row.customer_type),
    status: notionSelect(row.status),
    pipeline_status: notionSelect(row.pipeline_status),
    elevator: notionText(row.elevator),
    building_access: notionText(row.building_access),
    access_method: notionText(row.access_method),
    business_hours_start: notionText(row.business_hours_start),
    business_hours_end: notionText(row.business_hours_end),
    door_password: notionText(row.door_password),
    parking_info: notionText(row.parking_info),
    care_scope: notionText(row.care_scope),
    special_notes: notionText(row.special_notes),
    unit_price: notionNumber(row.unit_price),
    deposit: notionNumber(row.deposit),
    supply_amount: notionNumber(row.supply_amount),
    vat: notionNumber(row.vat),
    balance: notionNumber(row.balance),
    billing_cycle: notionSelect(row.billing_cycle),
    billing_amount: notionNumber(row.billing_amount),
    billing_start_date: notionDate(row.billing_start_date),
    billing_next_date: notionDate(row.billing_next_date),
    contract_start_date: notionDate(row.contract_start_date),
    contract_end_date: notionDate(row.contract_end_date),
    visit_interval_days: notionNumber(row.visit_interval_days),
    next_visit_date: notionDate(row.next_visit_date),
    visit_schedule_type: notionSelect(row.visit_schedule_type),
    visit_weekdays: notionText(row.visit_weekdays),
    visit_monthly_dates: notionText(row.visit_monthly_dates),
    notes: notionText(row.notes),
    drive_folder_url: notionUrl(row.drive_folder_url),
    latitude: notionNumber(row.latitude),
    longitude: notionNumber(row.longitude),
    gas_location: notionText(row.gas_location),
    power_location: notionText(row.power_location),
    rotation_type: notionText(row.rotation_type),
    visit_count_per_month: notionNumber(row.visit_count_per_month),
    payment_status: notionSelect(row.payment_status),
    payment_date: notionDate(row.payment_date),
    schedule_generation_day: notionNumber(row.schedule_generation_day),
    created_at: notionDate(row.created_at),
    updated_at: notionDate(row.updated_at),
    deleted_at: notionDate(row.deleted_at),
  }
}

export function applicationToNotionProps(row: ApplicationRow): Record<string, unknown> {
  return {
    id: notionTitle(row.id),
    owner_name: notionText(row.owner_name),
    business_name: notionText(row.business_name),
    phone: notionPhone(row.phone),
    email: notionEmail(row.email),
    platform_nickname: notionText(row.platform_nickname),
    business_number: notionText(row.business_number),
    account_number: notionText(row.account_number),
    address: notionText(row.address),
    elevator: notionText(row.elevator),
    building_access: notionText(row.building_access),
    access_method: notionText(row.access_method),
    parking: notionText(row.parking),
    business_hours_start: notionText(row.business_hours_start),
    business_hours_end: notionText(row.business_hours_end),
    payment_method: notionText(row.payment_method),
    privacy_consent: notionText(row.privacy_consent),
    service_consent: notionText(row.service_consent),
    request_notes: notionText(row.request_notes),
    care_scope: notionText(row.care_scope),
    service_type: notionText(row.service_type),
    status: notionText(row.status),
    admin_notes: notionText(row.admin_notes),
    notion_page_id: notionText(row.notion_page_id),
    unit_price_per_visit: notionNumber(row.unit_price_per_visit),
    deposit: notionNumber(row.deposit),
    supply_amount: notionNumber(row.supply_amount),
    vat: notionNumber(row.vat),
    balance: notionNumber(row.balance),
    manager_pay: notionNumber(row.manager_pay),
    work_status: notionText(row.work_status),
    construction_date: notionDate(row.construction_date),
    assigned_to: notionText(row.assigned_to),
    drive_folder_url: notionUrl(row.drive_folder_url),
    submitted_at: notionText(row.submitted_at),
    notification_send_at: notionDate(row.notification_send_at),
    notification_sent_at: notionDate(row.notification_sent_at),
    customer_memo: notionText(row.customer_memo),
    created_at: notionDate(row.created_at),
    deleted_at: notionDate(row.deleted_at),
  }
}

export function scheduleToNotionProps(row: ScheduleRow): Record<string, unknown> {
  return {
    id: notionTitle(row.id),
    customer_id: notionText(row.customer_id),
    contract_id: notionText(row.contract_id),
    worker_id: notionText(row.worker_id),
    application_id: notionText(row.application_id),
    scheduled_date: notionDate(row.scheduled_date),
    scheduled_time_start: notionText(row.scheduled_time_start),
    scheduled_time_end: notionText(row.scheduled_time_end),
    items_this_visit: notionText(row.items_this_visit),
    status: notionSelect(row.status),
    work_step: notionNumber(row.work_step),
    actual_arrival: notionDate(row.actual_arrival),
    actual_completion: notionDate(row.actual_completion),
    arrival_lat: notionNumber(row.arrival_lat),
    arrival_lng: notionNumber(row.arrival_lng),
    worker_memo: notionText(row.worker_memo),
    payment_status: notionSelect(row.payment_status),
    payment_amount: notionNumber(row.payment_amount),
    payment_date: notionDate(row.payment_date),
    created_at: notionDate(row.created_at),
    updated_at: notionDate(row.updated_at),
    deleted_at: notionDate(row.deleted_at),
  }
}

export function workerToNotionProps(row: WorkerRow): Record<string, unknown> {
  return {
    id: notionTitle(row.id),
    name: notionText(row.name),
    employment_type: notionSelect(row.employment_type),
    phone: notionPhone(row.phone),
    email: notionEmail(row.email),
    account_number: notionText(row.account_number),
    department: notionText(row.department),
    position: notionText(row.position),
    job_title: notionText(row.job_title),
    join_date: notionDate(row.join_date),
    skill_level: notionText(row.skill_level),
    specialties: notionText(row.specialties),
    day_wage: notionNumber(row.day_wage),
    night_wage: notionNumber(row.night_wage),
    avg_salary: notionNumber(row.avg_salary),
    anniversary: notionText(row.anniversary),
    hobby: notionText(row.hobby),
    home_address: notionText(row.home_address),
    emergency_contact: notionText(row.emergency_contact),
    created_at: notionDate(row.created_at),
    updated_at: notionDate(row.updated_at),
  }
}
