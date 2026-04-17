/**
 * Notion 백업 DB 초기 설정 스크립트
 *
 * 사용 방법:
 * 1. NOTION_API_KEY를 .env.local에 설정
 * 2. npx tsx scripts/setup-notion-backup.ts
 *
 * 실행 결과로 각 DB의 database_id가 출력됩니다.
 * 출력된 ID들을 .env.local 및 Vercel 환경변수에 설정하세요.
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const NOTION_API_KEY = process.env.NOTION_API_KEY
const NOTION_API_BASE = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

if (!NOTION_API_KEY || NOTION_API_KEY === 'PLACEHOLDER_발급필요') {
  console.error('❌ NOTION_API_KEY가 설정되지 않았습니다.')
  console.error('   https://www.notion.so/my-integrations 에서 integration을 생성하고')
  console.error('   .env.local에 NOTION_API_KEY를 설정하세요.')
  process.exit(1)
}

const headers = {
  Authorization: `Bearer ${NOTION_API_KEY}`,
  'Content-Type': 'application/json',
  'Notion-Version': NOTION_VERSION,
}

async function notionPost(endpoint: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${NOTION_API_BASE}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Notion API 오류 (${res.status}): ${err}`)
  }
  return res.json()
}

async function findOrCreateParentPage(): Promise<string> {
  // workspace 검색
  const searchRes = await notionPost('/search', {
    query: 'BBK 데이터 백업',
    filter: { value: 'page', property: 'object' },
    page_size: 1,
  }) as { results: Array<{ id: string; object: string }> }

  if (searchRes.results.length > 0) {
    console.log('✅ 기존 "BBK 데이터 백업" 페이지 발견:', searchRes.results[0].id)
    return searchRes.results[0].id
  }

  // BBK 상위 페이지 검색
  const bbkRes = await notionPost('/search', {
    query: 'BBK',
    filter: { value: 'page', property: 'object' },
    page_size: 5,
  }) as { results: Array<{ id: string; object: string }> }

  let parentPayload: Record<string, unknown>
  if (bbkRes.results.length > 0) {
    console.log('✅ BBK 상위 페이지 발견, 하위에 생성합니다.')
    parentPayload = { parent: { page_id: bbkRes.results[0].id } }
  } else {
    console.log('ℹ️  BBK 페이지를 찾지 못해 workspace 최상위에 생성합니다.')
    parentPayload = { parent: { type: 'workspace', workspace: true } }
  }

  const page = await notionPost('/pages', {
    ...parentPayload,
    icon: { type: 'emoji', emoji: '🗄️' },
    properties: {
      title: { title: [{ text: { content: '🗄️ BBK 데이터 백업' } }] },
    },
  }) as { id: string }

  console.log('✅ "🗄️ BBK 데이터 백업" 페이지 생성:', page.id)
  return page.id
}

type NotionPropertySchema = Record<string, unknown>

async function createDatabase(
  parentPageId: string,
  title: string,
  properties: NotionPropertySchema,
): Promise<{ id: string; url: string }> {
  const db = await notionPost('/databases', {
    parent: { type: 'page_id', page_id: parentPageId },
    icon: { type: 'emoji', emoji: '📊' },
    title: [{ type: 'text', text: { content: title } }],
    properties,
  }) as { id: string; url: string }

  return { id: db.id, url: db.url }
}

function textProp(): unknown { return { rich_text: {} } }
function numberProp(): unknown { return { number: {} } }
function dateProp(): unknown { return { date: {} } }
function selectProp(options: string[]): unknown {
  return { select: { options: options.map((name) => ({ name })) } }
}
function emailProp(): unknown { return { email: {} } }
function phoneProp(): unknown { return { phone_number: {} } }
function urlProp(): unknown { return { url: {} } }
function checkboxProp(): unknown { return { checkbox: {} } }

async function main(): Promise<void> {
  console.log('🚀 Notion 백업 DB 설정 시작...\n')

  const parentPageId = await findOrCreateParentPage()

  // 1. 고객관리 백업 DB
  console.log('\n📊 고객관리 백업 DB 생성 중...')
  const customersDb = await createDatabase(parentPageId, '고객관리 백업 (customers)', {
    id: { title: {} },
    business_name: textProp(),
    contact_name: textProp(),
    contact_phone: phoneProp(),
    email: emailProp(),
    business_number: textProp(),
    account_number: textProp(),
    platform_nickname: textProp(),
    address: textProp(),
    address_detail: textProp(),
    customer_type: selectProp(['1회성케어', '정기딥케어', '정기엔드케어']),
    status: selectProp(['active', 'paused', 'terminated']),
    pipeline_status: selectProp(['inquiry','quote_sent','consulting','contracted','schedule_assigned','service_scheduled','service_done','payment_done','subscription_active','renewal_pending','churned']),
    payment_method: textProp(),
    billing_cycle: selectProp(['월간', '연간']),
    billing_amount: numberProp(),
    billing_start_date: dateProp(),
    billing_next_date: dateProp(),
    contract_start_date: dateProp(),
    contract_end_date: dateProp(),
    unit_price: numberProp(),
    visit_interval_days: numberProp(),
    next_visit_date: dateProp(),
    visit_schedule_type: selectProp(['weekday', 'monthly_date']),
    visit_weekdays: textProp(),
    visit_monthly_dates: textProp(),
    door_password: textProp(),
    parking_info: textProp(),
    elevator: textProp(),
    building_access: textProp(),
    access_method: textProp(),
    business_hours_start: textProp(),
    business_hours_end: textProp(),
    care_scope: textProp(),
    special_notes: textProp(),
    notes: textProp(),
    drive_folder_url: urlProp(),
    payment_status: textProp(),
    payment_date: dateProp(),
    schedule_generation_day: numberProp(),
    rotation_type: textProp(),
    visit_count_per_month: numberProp(),
    latitude: numberProp(),
    longitude: numberProp(),
    gas_location: textProp(),
    power_location: textProp(),
    deposit: numberProp(),
    supply_amount: numberProp(),
    vat: numberProp(),
    balance: numberProp(),
    created_at: dateProp(),
    updated_at: dateProp(),
    deleted_at: dateProp(),
  })
  console.log('✅ 고객관리 백업 DB:', customersDb.id)

  await sleep(500)

  // 2. 서비스관리 백업 DB
  console.log('\n📊 서비스관리 백업 DB 생성 중...')
  const applicationsDb = await createDatabase(parentPageId, '서비스관리 백업 (service_applications)', {
    id: { title: {} },
    owner_name: textProp(),
    business_name: textProp(),
    phone: phoneProp(),
    email: emailProp(),
    platform_nickname: textProp(),
    business_number: textProp(),
    account_number: textProp(),
    address: textProp(),
    elevator: textProp(),
    building_access: textProp(),
    access_method: textProp(),
    parking: textProp(),
    business_hours_start: textProp(),
    business_hours_end: textProp(),
    payment_method: textProp(),
    privacy_consent: textProp(),
    service_consent: textProp(),
    request_notes: textProp(),
    care_scope: textProp(),
    service_type: textProp(),
    status: textProp(),
    admin_notes: textProp(),
    notion_page_id: textProp(),
    unit_price_per_visit: numberProp(),
    deposit: numberProp(),
    supply_amount: numberProp(),
    vat: numberProp(),
    balance: numberProp(),
    manager_pay: numberProp(),
    work_status: textProp(),
    construction_date: dateProp(),
    assigned_to: textProp(),
    drive_folder_url: urlProp(),
    submitted_at: textProp(),
    notification_send_at: dateProp(),
    notification_sent_at: dateProp(),
    customer_memo: textProp(),
    created_at: dateProp(),
    deleted_at: dateProp(),
  })
  console.log('✅ 서비스관리 백업 DB:', applicationsDb.id)

  await sleep(500)

  // 3. 일정관리 백업 DB
  console.log('\n📊 일정관리 백업 DB 생성 중...')
  const schedulesDb = await createDatabase(parentPageId, '일정관리 백업 (service_schedules)', {
    id: { title: {} },
    customer_id: textProp(),
    contract_id: textProp(),
    worker_id: textProp(),
    application_id: textProp(),
    scheduled_date: dateProp(),
    scheduled_time_start: textProp(),
    scheduled_time_end: textProp(),
    items_this_visit: textProp(),
    status: selectProp(['scheduled','confirmed','in_progress','completed','cancelled','rescheduled']),
    work_step: numberProp(),
    actual_arrival: dateProp(),
    actual_completion: dateProp(),
    arrival_lat: numberProp(),
    arrival_lng: numberProp(),
    worker_memo: textProp(),
    payment_status: selectProp(['pending','invoiced','paid','overdue']),
    payment_amount: numberProp(),
    payment_date: dateProp(),
    created_at: dateProp(),
    updated_at: dateProp(),
    deleted_at: dateProp(),
  })
  console.log('✅ 일정관리 백업 DB:', schedulesDb.id)

  await sleep(500)

  // 4. 작업자 백업 DB
  console.log('\n📊 작업자 백업 DB 생성 중...')
  const workersDb = await createDatabase(parentPageId, '작업자 백업 (workers)', {
    id: { title: {} },
    name: textProp(),
    employment_type: selectProp(['정규직', '계약직', '프리랜서', '일용직']),
    phone: phoneProp(),
    email: emailProp(),
    account_number: textProp(),
    department: textProp(),
    position: textProp(),
    job_title: textProp(),
    join_date: dateProp(),
    skill_level: textProp(),
    specialties: textProp(),
    day_wage: numberProp(),
    night_wage: numberProp(),
    avg_salary: numberProp(),
    anniversary: textProp(),
    hobby: textProp(),
    home_address: textProp(),
    emergency_contact: textProp(),
    created_at: dateProp(),
    updated_at: dateProp(),
  })
  console.log('✅ 작업자 백업 DB:', workersDb.id)

  await sleep(500)

  // 5. 백업 실행 로그 DB
  console.log('\n📊 백업 실행 로그 DB 생성 중...')
  const logDb = await createDatabase(parentPageId, '백업 실행 로그', {
    id: { title: {} },
    실행시각: textProp(),
    상태: selectProp(['성공', '부분오류', '실패']),
    소요시간: numberProp(),
    결과요약: textProp(),
    customers_건수: numberProp(),
    service_applications_건수: numberProp(),
    service_schedules_건수: numberProp(),
    workers_건수: numberProp(),
  })
  console.log('✅ 백업 실행 로그 DB:', logDb.id)

  // .env.local 업데이트
  const envPath = path.join(process.cwd(), '.env.local')
  let envContent = fs.readFileSync(envPath, 'utf-8')

  envContent = envContent
    .replace(/NOTION_BACKUP_CUSTOMERS_DB_ID=".*"/, `NOTION_BACKUP_CUSTOMERS_DB_ID="${customersDb.id.replace(/-/g, '')}"`)
    .replace(/NOTION_BACKUP_APPLICATIONS_DB_ID=".*"/, `NOTION_BACKUP_APPLICATIONS_DB_ID="${applicationsDb.id.replace(/-/g, '')}"`)
    .replace(/NOTION_BACKUP_SCHEDULES_DB_ID=".*"/, `NOTION_BACKUP_SCHEDULES_DB_ID="${schedulesDb.id.replace(/-/g, '')}"`)
    .replace(/NOTION_BACKUP_WORKERS_DB_ID=".*"/, `NOTION_BACKUP_WORKERS_DB_ID="${workersDb.id.replace(/-/g, '')}"`)
    .replace(/NOTION_BACKUP_LOG_DB_ID=".*"/, `NOTION_BACKUP_LOG_DB_ID="${logDb.id.replace(/-/g, '')}"`)

  fs.writeFileSync(envPath, envContent)

  console.log('\n✅ .env.local 업데이트 완료!\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📋 Vercel 환경변수 업데이트 필요:')
  console.log(`NOTION_BACKUP_CUSTOMERS_DB_ID=${customersDb.id.replace(/-/g, '')}`)
  console.log(`NOTION_BACKUP_APPLICATIONS_DB_ID=${applicationsDb.id.replace(/-/g, '')}`)
  console.log(`NOTION_BACKUP_SCHEDULES_DB_ID=${schedulesDb.id.replace(/-/g, '')}`)
  console.log(`NOTION_BACKUP_WORKERS_DB_ID=${workersDb.id.replace(/-/g, '')}`)
  console.log(`NOTION_BACKUP_LOG_DB_ID=${logDb.id.replace(/-/g, '')}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('\n🔗 Notion URLs:')
  console.log('고객관리 백업:', customersDb.url)
  console.log('서비스관리 백업:', applicationsDb.url)
  console.log('일정관리 백업:', schedulesDb.url)
  console.log('작업자 백업:', workersDb.url)
  console.log('백업 로그:', logDb.url)
  console.log('\n✅ 설정 완료! Vercel 환경변수를 업데이트 후 배포하세요.')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main().catch((err: unknown) => {
  console.error('❌ 오류 발생:', err)
  process.exit(1)
})
