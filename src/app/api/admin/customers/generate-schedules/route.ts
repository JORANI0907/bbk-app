import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { notifySlack } from '@/lib/slack'
import { triggerDriveFolderCreation } from '@/lib/drive-server'
import { dispatch, lookupFranchiseHqIdsForCustomer } from '@/lib/notification-dispatcher'
import { generateVisitSchedule, type VisitCycleUnit, type VisitCycleConfig } from '@/lib/schedule-generator'

interface CustomerRow {
  id: string
  business_name: string
  contact_name: string | null
  contact_phone: string | null
  email: string | null
  address: string | null
  platform_nickname: string | null
  business_number: string | null
  account_number: string | null
  payment_method: string | null
  business_hours_start: string | null
  business_hours_end: string | null
  elevator: string | null
  building_access: string | null
  parking_info: string | null
  access_method: string | null
  special_notes: string | null
  // Phase 27-BC: 마스터 UI 라벨 "관리자 요청사항" / "관리자메모" → 회차 생성 시 초기 복사에 사용
  admin_notes: string | null
  notes: string | null
  care_scope: string | null
  customer_type: string | null
  // 신형 방문주기 (Phase 37)
  visit_cycle_unit: VisitCycleUnit | null
  visit_cycle_value: number | null
  visit_cycle_config: VisitCycleConfig | null
  // 구형 방문주기 (legacy fallback)
  visit_schedule_type: 'weekday' | 'monthly_date' | null
  visit_weekdays: number[] | null
  visit_monthly_dates: number[] | null
  contract_start_date: string | null
  contract_end_date: string | null
  unit_price: number | null
  assigned_user_id: string | null
  assigned_worker_id: string | null
  billing_cycle: string | null
  billing_amount: number | null
}

interface GenerateResult {
  customer_id: string
  inserted: number
  skipped: number
}

function getNextMonth(): { year: number; month: number; label: string } {
  const now = new Date()
  const year = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()
  const month = now.getMonth() === 11 ? 1 : now.getMonth() + 2
  return { year, month, label: `${year}년 ${month}월` }
}

/** 다음달 해당 요일 날짜 목록 반환 */
function getDatesForWeekdays(year: number, month: number, weekdays: number[]): string[] {
  const dates: string[] = []
  const daysInMonth = new Date(year, month, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d)
    if (weekdays.includes(date.getDay())) {
      dates.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    }
  }
  return dates
}

/** 다음달 해당 날짜 목록 반환 */
function getDatesForMonthlyDates(year: number, month: number, monthlyDates: number[]): string[] {
  const daysInMonth = new Date(year, month, 0).getDate()
  return monthlyDates
    .filter(d => d >= 1 && d <= daysInMonth)
    .map(d => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const {
    customer_ids,
    year: reqYear,
    month: reqMonth,
    start_day: reqStartDay,
    end_day: reqEndDay,
    regenerate,
    cleanup_only,
  }: {
    customer_ids: string[]
    year?: number
    month?: number
    start_day?: number
    /** Phase 5-E: 대상 월의 end_day까지만 처리 (기간 기반) */
    end_day?: number
    /** Phase 5-C: true면 대상 월의 미완료 일정 먼저 soft-delete 후 재생성 */
    regenerate?: boolean
    /** Phase 5-D: true면 대상 월의 미완료 일정 중 새 방문일정에 없는 것만 삭제 (신규 INSERT 스킵) */
    cleanup_only?: boolean
  } = body

  if (!Array.isArray(customer_ids) || customer_ids.length === 0) {
    return NextResponse.json({ error: 'customer_ids가 필요합니다.' }, { status: 400 })
  }

  // year/month 미전달 시 기존 로직(다음달)으로 폴백. 하위 호환 유지.
  const { year, month, label } =
    reqYear && reqMonth
      ? { year: reqYear, month: reqMonth, label: `${reqYear}년 ${reqMonth}월` }
      : getNextMonth()
  // 지정된 시작일 이후만 필터 (미전달 시 1일)
  const startDay = typeof reqStartDay === 'number' && reqStartDay >= 1 && reqStartDay <= 31 ? reqStartDay : 1
  const startDateStr = `${year}-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`
  // Phase 5-E: 종료일 (미전달 시 31일 → 해당 월 말일까지 처리)
  const endDay = typeof reqEndDay === 'number' && reqEndDay >= 1 && reqEndDay <= 31 ? reqEndDay : 31
  const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`

  const { data: customersData, error: fetchError } = await supabase
    .from('customers')
    .select(
      'id, business_name, contact_name, contact_phone, email, address, platform_nickname, business_number, account_number, payment_method, business_hours_start, business_hours_end, elevator, building_access, parking_info, access_method, special_notes, admin_notes, notes, care_scope, customer_type, visit_cycle_unit, visit_cycle_value, visit_cycle_config, visit_schedule_type, visit_weekdays, visit_monthly_dates, contract_start_date, contract_end_date, unit_price, assigned_user_id, assigned_worker_id, billing_cycle, billing_amount'
    )
    .in('id', customer_ids)
    .is('deleted_at', null)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const customers = (customersData ?? []) as CustomerRow[]

  const results: GenerateResult[] = []
  let totalInserted = 0

  for (const customer of customers) {
    if (
      customer.customer_type !== '정기딥케어' &&
      customer.customer_type !== '정기엔드케어'
    ) {
      results.push({ customer_id: customer.id, inserted: 0, skipped: 0 })
      continue
    }

    let scheduledDates: string[] = []

    if (customer.visit_cycle_unit) {
      // 신형: visit_cycle_unit/value/config 기반 — generateVisitSchedule으로 전체 계약기간 날짜 생성 후 범위 필터
      const contractStart = customer.contract_start_date ?? startDateStr
      const contractEnd   = customer.contract_end_date ?? null
      const allDates = generateVisitSchedule({
        unit:          customer.visit_cycle_unit,
        value:         customer.visit_cycle_value ?? 1,
        config:        customer.visit_cycle_config ?? {},
        contractStart,
        contractEnd,
      })
      scheduledDates = allDates.filter(d => d >= startDateStr && d <= endDateStr)
    } else if (customer.visit_schedule_type === 'weekday' && customer.visit_weekdays?.length) {
      // 레거시 fallback: weekday
      scheduledDates = getDatesForWeekdays(year, month, customer.visit_weekdays)
        .filter(d => d >= startDateStr && d <= endDateStr)
    } else if (customer.visit_schedule_type === 'monthly_date' && customer.visit_monthly_dates?.length) {
      // 레거시 fallback: monthly_date
      scheduledDates = getDatesForMonthlyDates(year, month, customer.visit_monthly_dates)
        .filter(d => d >= startDateStr && d <= endDateStr)
    }

    if (scheduledDates.length === 0) {
      results.push({ customer_id: customer.id, inserted: 0, skipped: 0 })
      continue
    }

    // regenerate 모드 = "수정 반영":
    //   1) 기간 내 미완료 회차 중 새 방문일정 날짜와 겹치는 것 → 마스터 필드 재복사 (UPDATE)
    //   2) 겹치지 않는 미완료 회차 → soft-delete (기존 동작)
    //   3) 새 방문일정 중 회차 없는 날짜 → 아래 INSERT 로직에서 신규 생성
    //   4) 완료된 회차(work_status='completed')는 이력 보존 위해 손대지 않음
    if (regenerate) {
      // 기간 내 미완료 회차 조회
      const { data: existingApps } = await supabase
        .from('service_applications')
        .select('id, construction_date, business_name')
        .eq('customer_id', customer.id)
        .gte('construction_date', startDateStr)
        .lte('construction_date', endDateStr)
        .is('deleted_at', null)
        .or('work_status.is.null,work_status.neq.completed')

      const scheduledSet = new Set(scheduledDates)
      const toKeepIds: string[] = []
      const toDeleteIds: string[] = []
      const keptApps: Array<{ id: string; construction_date: string; business_name: string }> = []
      for (const app of existingApps ?? []) {
        if (!app.id || !app.construction_date) continue
        if (scheduledSet.has(app.construction_date)) {
          toKeepIds.push(app.id)
          keptApps.push({
            id: app.id,
            construction_date: app.construction_date,
            business_name: app.business_name ?? customer.business_name,
          })
        } else {
          toDeleteIds.push(app.id)
        }
      }

      // 1) 겹치지 않는 미완료 회차 삭제
      if (toDeleteIds.length > 0) {
        await supabase
          .from('service_applications')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', toDeleteIds)
      }

      // 2) 유지되는 회차의 마스터 필드 재복사 (스냅샷 갱신)
      if (toKeepIds.length > 0) {
        const isAnnualForResync = customer.billing_cycle === '연간'
        const resyncSupply =
          !isAnnualForResync && customer.customer_type === '정기딥케어' && customer.billing_cycle === '월간'
            ? (customer.billing_amount || null)
            : null

        const resyncFields = {
          business_name: customer.business_name,
          owner_name: customer.contact_name || customer.business_name,
          phone: customer.contact_phone || '',
          email: customer.email || null,
          platform_nickname: customer.platform_nickname || null,
          business_number: customer.business_number || null,
          account_number: customer.account_number || null,
          address: customer.address || '',
          payment_method: customer.payment_method || null,
          business_hours_start: customer.business_hours_start || null,
          business_hours_end: customer.business_hours_end || null,
          elevator: customer.elevator || null,
          building_access: customer.building_access || null,
          parking: customer.parking_info || null,
          access_method: customer.access_method || null,
          request_notes: customer.special_notes || null,
          care_scope: customer.care_scope || null,
          admin_request_notes: customer.admin_notes || null,
          admin_notes: customer.notes || null,
          service_type: customer.customer_type,
          assigned_to: customer.assigned_user_id || null,
          unit_price_per_visit: isAnnualForResync ? null : (customer.unit_price || null),
          supply_amount: resyncSupply,
        }
        await supabase
          .from('service_applications')
          .update(resyncFields)
          .in('id', toKeepIds)

        // 3) work_assignments 재배정: 기존 배정 삭제 후 마스터 assigned_worker_id 로 재삽입
        //    회차별 다중 배정도 마스터 기준으로 초기화 (수정 반영 의도상 정상)
        await supabase.from('work_assignments').delete().in('application_id', toKeepIds)
        if (customer.assigned_worker_id) {
          const workerRows = keptApps.map((app) => ({
            worker_id: customer.assigned_worker_id!,
            application_id: app.id,
            construction_date: app.construction_date.slice(0, 10),
            business_name: app.business_name,
            customer_id: customer.id,
            service_type: customer.customer_type,
          }))
          await supabase
            .from('work_assignments')
            .upsert(workerRows, { onConflict: 'worker_id,application_id', ignoreDuplicates: true })
        }
      }
    }

    // Phase 5-D: cleanup_only 모드 — 새 방문일정에 없는 미완료 일정만 삭제, INSERT 스킵
    // (계약일정 수정 시 사용: 기존 일정 정리만, 신규 생성은 별도 "생성" 버튼)
    if (cleanup_only) {
      // startDate~endDate 미완료 일정 조회
      const { data: existingMisc } = await supabase
        .from('service_applications')
        .select('id, construction_date, work_status')
        .eq('customer_id', customer.id)
        .gte('construction_date', startDateStr)
        .lte('construction_date', endDateStr)
        .is('deleted_at', null)
      // 새 방문일정에 없는 미완료 것만 삭제 대상 필터
      const scheduledSet = new Set(scheduledDates)
      const toDelete = (existingMisc ?? [])
        .filter((r: { id: string; construction_date: string | null; work_status: string | null }) =>
          r.construction_date && !scheduledSet.has(r.construction_date) &&
          (r.work_status == null || r.work_status !== 'completed'))
        .map(r => r.id)
      let deletedCount = 0
      if (toDelete.length > 0) {
        const { error: delErr } = await supabase
          .from('service_applications')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', toDelete)
        if (!delErr) deletedCount = toDelete.length
      }
      results.push({ customer_id: customer.id, inserted: 0, skipped: deletedCount })
      continue
    }

    // 이미 생성된 일정 확인 (중복 방지)
    const { data: existingApps } = await supabase
      .from('service_applications')
      .select('construction_date')
      .eq('customer_id', customer.id)
      .in('construction_date', scheduledDates)
      .is('deleted_at', null)

    const existingDates = new Set((existingApps ?? []).map((a: { construction_date: string | null }) => a.construction_date))
    const newDates = scheduledDates.filter(d => !existingDates.has(d))
    const skipped = scheduledDates.length - newDates.length

    if (newDates.length === 0) {
      results.push({ customer_id: customer.id, inserted: 0, skipped })
      continue
    }

    const isAnnual = customer.billing_cycle === '연간'
    // 정기딥/정기엔드 매출은 결제 시점의 service_billings.amount 기준으로 산정됨.
    // 회차별 supply_amount 는 UI/집계에서 사용하지 않으므로 null 고정 (지금 대로 유지되어도 무해).
    const supplyAmount: number | null = null

    // Phase 22 v7: 정기딥 연간은 계약 시 선결제·세금계산서 일괄 발행 → 각 방문 결제상태 자동 세팅
    const preSettledPayment =
      customer.customer_type === '정기딥케어' && customer.billing_cycle === '연간'
        ? '계산서발행완료'
        : null

    const toInsert = newDates.map(date => ({
      customer_id: customer.id,
      business_name: customer.business_name,
      owner_name: customer.contact_name || customer.business_name,
      phone: customer.contact_phone || '',
      email: customer.email || null,
      platform_nickname: customer.platform_nickname || null,
      business_number: customer.business_number || null,
      account_number: customer.account_number || null,
      address: customer.address || '',
      payment_method: customer.payment_method || null,
      business_hours_start: customer.business_hours_start || null,
      business_hours_end: customer.business_hours_end || null,
      elevator: customer.elevator || null,
      building_access: customer.building_access || null,
      parking: customer.parking_info || null,
      access_method: customer.access_method || null,
      request_notes: customer.special_notes || null,
      care_scope: customer.care_scope || null,
      // Phase 27-BC: 회차 생성 시점 마스터 스냅샷 초기 복사.
      //   이후 마스터 편집으로는 이 필드가 덮이지 않음(customer-app-sync 매핑 제외 처리).
      //   admin_request_notes ← customer.admin_notes (마스터 UI 라벨: "관리자 요청사항")
      //   admin_notes         ← customer.notes       (마스터 UI 라벨: "관리자메모")
      admin_request_notes: customer.admin_notes || null,
      admin_notes: customer.notes || null,
      service_type: customer.customer_type,
      assigned_to: customer.assigned_user_id || null,
      unit_price_per_visit: isAnnual ? null : (customer.unit_price || null),
      supply_amount: supplyAmount,
      payment_status_detail: preSettledPayment,
      construction_date: date,
      status: '예약확정',
      // 시스템 태그는 감사·디버깅용 internal_memo 로 이동해 사용자 필드(admin_notes) 오염 방지.
      internal_memo: `고객 DB 자동 일정 생성 (${label})`,
    }))

    const { data: inserted, error: insertError } = await supabase
      .from('service_applications')
      .insert(toInsert)
      .select('id, assigned_to, construction_date, business_hours_start, business_hours_end, care_scope, request_notes, phone')

    if (insertError) {
      results.push({ customer_id: customer.id, inserted: 0, skipped })
      continue
    }

    const insertedApps = inserted ?? []
    const insertedCount = insertedApps.length
    totalInserted += insertedCount

    // 작업자가 있으면 work_assignments에 자동 생성
    if (customer.assigned_worker_id && insertedApps.length > 0) {
      const workerRows = insertedApps.map((app: { id: string; construction_date: string }) => ({
        worker_id: customer.assigned_worker_id,
        application_id: app.id,
        construction_date: app.construction_date.slice(0, 10),
        business_name: customer.business_name,
        customer_id: customer.id,
        service_type: customer.customer_type,
      }))
      // Phase 27-BJ: (worker_id, application_id) 유니크 제약과 정합 —
      //   회차 재생성·중복 클릭 시 중복 삽입 방지 (급여정산 중복 표시 재발 방지).
      await supabase
        .from('work_assignments')
        .upsert(workerRows, { onConflict: 'worker_id,application_id', ignoreDuplicates: true })
    }

    // assigned_to가 있으면 service_schedules에도 자동 생성
    const toSchedule = insertedApps.filter(
      (app: { assigned_to: string | null; construction_date: string | null }) =>
        app.assigned_to && app.construction_date
    )

    if (toSchedule.length > 0) {
      const toTime = (t: string | null | undefined, fallback: string) =>
        t ? (t.length === 5 ? `${t}:00` : t) : fallback

      const scheduleRows = toSchedule.map((app: {
        id: string
        assigned_to: string
        construction_date: string
        business_hours_start?: string | null
        business_hours_end?: string | null
        care_scope?: string | null
        request_notes?: string | null
      }) => ({
        worker_id: app.assigned_to,
        customer_id: customer.id,
        scheduled_date: app.construction_date.slice(0, 10),
        scheduled_time_start: toTime(customer.business_hours_start, '09:00:00'),
        scheduled_time_end: toTime(customer.business_hours_end, '18:00:00'),
        status: 'scheduled',
        work_step: 0,
        worker_memo: customer.care_scope ?? customer.special_notes ?? null,
        application_id: app.id,
      }))

      await supabase.from('service_schedules').insert(scheduleRows)
    }

    // ── 예약확정알림 발송 (고객당 1건, 날짜 통합) ───────────────────────
    // 정기엔드케어는 수동 발송 전환 — 알림 자동발송 스킵
    const phone = (customer.contact_phone || '').replace(/-/g, '')
    // 정기딥케어/정기엔드케어 모두 수동 발송 전환 — 예약확정알림 자동발송 스킵
    if (phone && insertedApps.length > 0
        && customer.customer_type !== '정기엔드케어'
        && customer.customer_type !== '정기딥케어') {
      let assignedUserName = '-'
      if (customer.assigned_user_id) {
        const { data: userRow } = await supabase
          .from('users').select('name').eq('id', customer.assigned_user_id).single()
        if (userRow?.name) assignedUserName = userRow.name
      }
      const nowIso = new Date().toISOString()
      const ownerName = customer.contact_name || customer.business_name

      const sortedDates = insertedApps
        .map((app: { construction_date: string }) => (app.construction_date as string)?.slice(0, 10) ?? '')
        .filter(Boolean)
        .sort()
      const monthNum = parseInt(sortedDates[0].slice(5, 7))
      const dateStr = `${monthNum}월 ` + sortedDates
        .map((d: string) => `${parseInt(d.slice(8, 10))}일`)
        .join(', ')

      const variables: Record<string, string> = {
        '고객명':     ownerName,
        '고객연락처': customer.contact_phone || '',
        '상호명':     customer.business_name,
        '케어유형':   customer.customer_type || '',
        '담당자':     assignedUserName,
        '주소':       customer.address || '',
        '시공일자':   dateStr,
        '요청시간':   '',
        '미팅여부':   '-',
        '미팅시간':   '-',
      }
      const fallback = `[BBK 공간케어] ${ownerName}님, ${customer.business_name} ${dateStr} 예약이 확정되었습니다.`
      // notification_rules의 채널·role 토글에 따라 자동 발송 (Slack 포함)
      // 관리자 push는 customer.assigned_user_id(담당 관리자)에게만
      const franchiseHqIds = customer.id ? await lookupFranchiseHqIdsForCustomer(customer.id) : []
      const customerUserId = await (async () => {
        const { data } = await supabase.from('customers').select('user_id').eq('id', customer.id).maybeSingle()
        return (data as { user_id: string | null } | null)?.user_id ?? undefined
      })()
      try {
        await dispatch('예약확정알림', {
          customer: { id: customer.id, userId: customerUserId, phone, name: ownerName, businessName: customer.business_name },
          workerIds: customer.assigned_worker_id ? [customer.assigned_worker_id] : [],
          adminIds: customer.assigned_user_id ? [customer.assigned_user_id] : [],
          franchiseHqIds,
          variables,
          fallbackText: fallback,

          slack: { constructionDate: dateStr },
          method: 'auto',
          metadata: { source: 'generate-schedules', business_name: customer.business_name },
        })
        const newEntry = { type: '예약확정알림', sent_at: nowIso, phone, method: 'auto' }
        await Promise.all(
          insertedApps.map((app: { id: string }) =>
            supabase.from('service_applications')
              .update({ notification_log: [newEntry] })
              .eq('id', app.id)
          )
        )
      } catch { /* 알림 실패는 일정 생성에 영향 없음 */ }
    }

    // ── Make 웹훅으로 구글 드라이브 폴더 자동생성 요청 (건별) ─────────────────
    // Vercel 서버리스: return 전에 반드시 await 해야 함 (미await 시 컨테이너 종료로 fetch kill)
    if (insertedApps.length > 0 && customer.customer_type) {
      await Promise.all(
        insertedApps.map((app: { id: string; construction_date: string }) =>
          triggerDriveFolderCreation(
            app.id,
            customer.business_name,
            (app.construction_date as string).slice(0, 10),
            customer.customer_type!,
          ).catch(() => {})
        )
      )
    }

    results.push({ customer_id: customer.id, inserted: insertedCount, skipped })
  }

  return NextResponse.json({ results, totalInserted, targetMonth: label })
}
