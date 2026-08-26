import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'
import { computeBillingAmountFromCustomer, toMonthlyPeriod, calcMonthlyDueDate } from '@/lib/billing-generator'

// 배정관리/캘린더 등 리스트 뷰에서 실제로 렌더링·조작되는 필드만 (약 45개).
// 무거운 jsonb(quote_items, quote_log, saved_quotes, spare_data, recommended_services 등)와
// 잘 안 쓰는 필드(notion_page_id, gcal_event_id, worker_pay 등)를 제외해 응답 크기 축소.
// 세부/편집이 필요한 경우 `fields=slim` 파라미터를 넘기지 않으면 기존과 동일하게 `*` 반환.
const APP_FIELDS_SLIM = [
  'id', 'created_at', 'submitted_at',
  'business_name', 'owner_name', 'phone', 'phone_2', 'phone_notify_1', 'phone_notify_2', 'email',
  'business_name', 'business_number', 'address',
  'status', 'service_type', 'work_status',
  'assigned_to', 'customer_id',
  'construction_date', 'construction_time',
  'business_hours_start', 'business_hours_end',
  'elevator', 'building_access', 'parking', 'access_method',
  'payment_method', 'account_number',
  'supply_amount', 'vat', 'deposit', 'balance',
  'care_scope', 'request_notes', 'admin_request_notes',
  'customer_memo', 'internal_memo',
  'drive_folder_url', 'disposition',
  'progress_status', 'payment_status', 'payment_status_detail',
  'notification_send_at', 'notification_sent_at',
  'work_started_at', 'work_completed_at', 'completed_at',
  'pre_meeting_at', 'pre_meeting_done',
  'condition_score', 'worker_planned_departure', 'worker_plan_note',
  'deposit_paid_at', 'balance_paid_at',
  'archived_at', 'deleted_at',
  'notification_log',
].filter((v, i, a) => a.indexOf(v) === i).join(', ') // 중복 제거

export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const hasAssigned = searchParams.get('has_assigned')
  const month = searchParams.get('month')
  // Phase 2: 고객 상세페이지에서 특정 고객의 일정만 조회
  // Phase 22 v8: customer_id 우선 매칭 (phone/business_name은 같은 사업장 다른 유형 계약을 구분 못함)
  const customerId = searchParams.get('customer_id')
  const phone = searchParams.get('phone')
  const businessName = searchParams.get('business_name')
  // Phase 4: 이관 필터 (활성/이관됨/전체)
  const archived = searchParams.get('archived')
  // 성능 최적화: fields=slim 이면 리스트 필드만 반환 (기본은 * 유지 → 하위호환)
  const useSlim = searchParams.get('fields') === 'slim'
  const selectClause = useSlim
    ? `${APP_FIELDS_SLIM}, customer:customers(drive_folder_url)`
    : '*, customer:customers(drive_folder_url)'

  let query = supabase
    .from('service_applications')
    .select(selectClause)
    .is('deleted_at', null)
    .order('construction_date', { ascending: true })

  if (archived === 'true') {
    query = query.not('archived_at', 'is', null)
  } else if (archived !== 'all') {
    query = query.is('archived_at', null)
  }

  if (status) {
    query = query.eq('status', status)
  }
  if (hasAssigned === 'true') {
    query = query.not('assigned_to', 'is', null)
  }
  if (month) {
    const [y, m] = month.split('-').map(Number)
    const nextMonth = m === 12
      ? `${y + 1}-01-01`
      : `${y}-${String(m + 1).padStart(2, '0')}-01`
    query = query
      .gte('construction_date', `${month}-01`)
      .lt('construction_date', nextMonth)
  }
  // 고객 매칭 (customer_id 최우선 → phone → business_name)
  // Phase 22 v8: customer_id로 매칭하면 같은 phone/business_name을 공유하는 다른 유형 계약과 안전하게 분리됨
  if (customerId) {
    query = query.eq('customer_id', customerId)
  } else if (phone) {
    // OR 조건으로 phone에 대시 유무 두 형식 모두 매칭
    const normalized = phone.replace(/-/g, '')
    query = query.or(`phone.eq.${normalized},phone.eq.${phone}`)
  } else if (businessName) {
    query = query.eq('business_name', businessName)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Phase 27-AC: 각 application 에 배정된 모든 작업자 id 배열로 병합 (다중 배정 지원).
  // - assigned_worker_ids: string[]  (신규, 다중)
  // - assigned_worker_id: string | null  (하위호환, 첫 번째 id — 기존 UI·필터·payroll 이 참조 중)
  // 동적 select 문자열 사용으로 Supabase 타입 추론이 실패 → 명시적 캐스트
  type AppRow = Record<string, unknown> & { id: string }
  const apps = (data ?? []) as unknown as AppRow[]
  if (apps.length > 0) {
    const appIds = apps.map(a => a.id)
    const { data: assignments } = await supabase
      .from('work_assignments')
      .select('application_id, worker_id, id')
      .in('application_id', appIds)
      .order('id', { ascending: true })   // 삽입 순서 유지 → 첫 번째가 primary

    const workerMap: Record<string, string[]> = {}
    for (const a of assignments ?? []) {
      if (!a.application_id || !a.worker_id) continue
      if (!workerMap[a.application_id]) workerMap[a.application_id] = []
      if (!workerMap[a.application_id].includes(a.worker_id)) {
        workerMap[a.application_id].push(a.worker_id)
      }
    }
    for (const app of apps) {
      const ids = workerMap[app.id] ?? []
      ;(app as Record<string, unknown>).assigned_worker_ids = ids
      ;(app as Record<string, unknown>).assigned_worker_id = ids[0] ?? null
    }
  }

  return NextResponse.json({ applications: apps })
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()

  if (!body.business_name || !body.owner_name || !body.phone || !body.address) {
    return NextResponse.json({ error: '업체명, 대표자명, 연락처, 주소는 필수입니다.' }, { status: 400 })
  }

  const ALLOWED_POST = [
    // 일반정보
    'owner_name', 'business_name', 'phone', 'phone_2', 'phone_notify_1', 'phone_notify_2', 'email',
    'platform_nickname', 'business_number', 'account_number',
    // 작업장정보
    'address',
    'elevator', 'building_access', 'access_method', 'parking',
    'business_hours_start', 'business_hours_end',
    // 시공정보
    'care_scope', 'request_notes', 'admin_request_notes', 'construction_time',
    // 결제정보
    'payment_method',
    'unit_price_per_visit', 'deposit', 'supply_amount', 'vat', 'balance', 'manager_pay',
    // 기타
    'service_type', 'admin_notes', 'disposition',
    // Batch A-2 후속: 유입 채널 (관리자 수동 등록 시 드롭다운 선택)
    'acquisition_source',
  ]
  // Phase 8-C: 신규 신청 유입 시 progress_status='신청서작성' 초기값 세팅
  // (기존 status='신규'는 자동화 backward-compat 위해 유지)
  const insert: Record<string, unknown> = { status: '신규', progress_status: '신청서작성' }
  for (const key of ALLOWED_POST) {
    if (key in body) insert[key] = body[key]
  }

  const { data, error } = await supabase
    .from('service_applications')
    .insert(insert)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Slack 알림 (fire-and-forget)
  const kstTime = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
  sendSlack(
    `📋 *새 서비스 신청 (관리자 등록)*\n` +
    `• 업체명: ${body.business_name ?? '-'}\n` +
    `• 대표자: ${body.owner_name ?? '-'}\n` +
    `• 연락처: ${body.phone ?? '-'}\n` +
    `• 주소: ${body.address ?? '-'}\n` +
    (body.service_type ? `• 서비스: ${body.service_type}\n` : '') +
    `• 접수시각: ${kstTime}`
  ).catch(() => {})

  return NextResponse.json({ application: data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { id, ...rest } = body

  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
  }

  const ALLOWED = [
    // 일반정보
    'owner_name', 'business_name', 'phone', 'phone_2', 'phone_notify_1', 'phone_notify_2', 'email',
    'platform_nickname', 'business_number', 'account_number',
    // 작업장정보
    'address',
    'elevator', 'building_access', 'access_method', 'parking',
    'business_hours_start', 'business_hours_end',
    // 시공정보
    'care_scope', 'request_notes', 'admin_request_notes',
    // 결제정보
    'payment_method',
    'unit_price_per_visit', 'deposit', 'supply_amount', 'vat', 'balance', 'manager_pay',
    // 관리 필드
    'status', 'admin_notes', 'service_type', 'assigned_to',
    'drive_folder_url', 'construction_date', 'construction_time',
    'pre_meeting_at', 'disposition',
    // 작업/결제 상태 (Phase 1: 상태 분리)
    'work_status', 'work_started_at', 'work_completed_at',
    'payment_status', 'completed_at',
    'customer_memo', 'internal_memo',
    // Phase 8-C: 진행/결제 상태 이원화 (UI 수동 편집 허용)
    'progress_status', 'payment_status_detail',
    // pending 신청서 → 고객 등록 완료 시 연결
    'customer_id',
    // Batch A-2 후속: 유입 채널 수동 수정 허용
    'acquisition_source',
  ]
  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (key in rest) updates[key] = rest[key]
  }

  const { error } = await supabase
    .from('service_applications')
    .update(updates)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── work_assignments.construction_date 자동 동기화 ──────────────
  // application의 construction_date가 변경되면 연결된 모든 work_assignments도 함께 이동
  // (급여정산 카드의 일자별 그룹·자동합계가 application 기준으로 정확하게 반영되도록)
  if ('construction_date' in updates && updates.construction_date) {
    try {
      await supabase
        .from('work_assignments')
        .update({ construction_date: updates.construction_date })
        .eq('application_id', id)
    } catch (e) {
      console.error('work_assignments construction_date 동기화 실패:', e instanceof Error ? e.message : e)
    }
  }

  // ── service_schedules 자동 동기화 ──────────────────────────────
  // assigned_to 또는 construction_date가 변경된 경우에만 실행
  const touchedScheduleFields =
    'assigned_to' in updates || 'construction_date' in updates

  if (touchedScheduleFields) {
    try {
      // 최신 application 데이터 조회
      const { data: app } = await supabase
        .from('service_applications')
        .select('*')
        .eq('id', id)
        .single()

      if (app?.assigned_to && app?.construction_date) {
        const toTime = (t: string | null | undefined, fallback: string) =>
          t ? (t.length === 5 ? `${t}:00` : t) : fallback

        const scheduleData = {
          // Rename-A: worker_id 컬럼명이 오해 유발적이라 assigned_user_id 로 점진 교체 중.
          // 관찰 기간 동안 두 컬럼 모두 dual-write 하여 되돌리기 쉽게 유지.
          worker_id: app.assigned_to,
          assigned_user_id: app.assigned_to,
          scheduled_date: app.construction_date.slice(0, 10),
          scheduled_time_start: toTime(app.business_hours_start, '09:00:00'),
          scheduled_time_end: toTime(app.business_hours_end, '18:00:00'),
          status: 'scheduled',
          work_step: 0,
          worker_memo: app.admin_request_notes ?? app.care_scope ?? null,
          application_id: id,
        }

        // customer 찾기 또는 생성
        let customerId: string | null = null

        const normalizedPhone = (app.phone ?? '').replace(/-/g, '')
        if (normalizedPhone) {
          // 전화번호는 대시 유무 두 형식 모두 시도, 없으면 업체명으로 fallback
          const { data: byPhone } = await supabase
            .from('customers')
            .select('id, unit_price, customer_type')
            .or(`contact_phone.eq.${normalizedPhone},contact_phone.eq.${app.phone ?? ''}`)
            .is('deleted_at', null)
            .limit(1)
            .single()

          const { data: byName } = !byPhone && app.business_name
            ? await supabase
                .from('customers')
                .select('id, unit_price, customer_type')
                .eq('business_name', app.business_name)
                .is('deleted_at', null)
                .limit(1)
                .single()
            : { data: null }

          const existingCustomer = byPhone ?? byName

          if (existingCustomer) {
            customerId = existingCustomer.id
            // 정기엔드케어이고 고객 건당급여가 있으면 application에 자동 반영 (unit_price_per_visit 미설정 시)
            if (
              app.service_type === '정기엔드케어' &&
              existingCustomer.unit_price &&
              !app.unit_price_per_visit
            ) {
              await supabase
                .from('service_applications')
                .update({ unit_price_per_visit: existingCustomer.unit_price })
                .eq('id', id)
            }
          }
          // 매칭 실패 시 자동 생성하지 않음 — customerId = null 유지
        }

        // 기존 schedule 확인 (같은 application_id)
        const { data: existingSchedule } = await supabase
          .from('service_schedules')
          .select('id')
          .eq('application_id', id)
          .single()

        if (existingSchedule) {
          // 업데이트
          await supabase
            .from('service_schedules')
            .update({ ...scheduleData, ...(customerId ? { customer_id: customerId } : {}) })
            .eq('id', existingSchedule.id)
        } else {
          // 신규 생성
          await supabase.from('service_schedules').insert({
            ...scheduleData,
            customer_id: customerId,
          })
        }
      }
    } catch (syncErr) {
      // 동기화 실패는 로그만 남기고 메인 응답은 성공 처리
      console.error('service_schedules 동기화 실패:', syncErr)
    }
  }

  // Phase 22 v11: 정기딥 월간 방문 완료 시 그 달 billings 자동 생성 (idempotent)
  // 진행상태가 '작업완료'로 변경됐고 고객이 정기딥+월간이면 실행
  if (updates.progress_status === '작업완료') {
    try {
      const { data: app } = await supabase
        .from('service_applications')
        .select('customer_id, business_name, phone, construction_date')
        .eq('id', id)
        .single()

      if (app?.customer_id && app.construction_date) {
        const { data: customer } = await supabase
          .from('customers')
          .select('id, customer_type, billing_cycle, payment_date, supply_amount, vat, billing_amount, payment_method, status')
          .eq('id', app.customer_id)
          .is('deleted_at', null)
          .single()

        // Phase 23: 일시정지 고객은 방문 완료 트리거로도 청구 생성 skip
        if (customer?.customer_type === '정기딥케어' && customer.billing_cycle === '월간' && customer.status !== 'paused') {
          const period = toMonthlyPeriod(app.construction_date)
          // 이미 있으면 skip
          const { data: existing } = await supabase
            .from('service_billings')
            .select('id')
            .eq('customer_id', customer.id)
            .eq('billing_period', period)
            .maybeSingle()
          if (!existing) {
            const amount = computeBillingAmountFromCustomer(customer)
            if (amount && amount > 0) {
              const dueDate = calcMonthlyDueDate(app.construction_date, customer.payment_date ?? null)
              await supabase.from('service_billings').insert({
                customer_id: customer.id,
                billing_type: 'monthly',
                billing_period: period,
                amount,
                due_date: dueDate,
                status: 'pending',
                notes: '방문 완료 자동 생성',
              })
            }
          }
        }
      }
    } catch (e) {
      console.error('정기딥 월간 billings 자동 생성 실패:', e instanceof Error ? e.message : e)
    }
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
  }

  const now = new Date().toISOString()

  // 신청서 소프트 삭제
  const { error } = await supabase
    .from('service_applications')
    .update({ deleted_at: now })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 연결된 service_schedules도 cascade 소프트 삭제
  await supabase
    .from('service_schedules')
    .update({ deleted_at: now })
    .eq('application_id', id)
    .is('deleted_at', null)

  return NextResponse.json({ success: true })
}
