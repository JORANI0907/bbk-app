import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'

export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const hasAssigned = searchParams.get('has_assigned')
  const month = searchParams.get('month')

  let query = supabase
    .from('service_applications')
    .select('*, customer:customers(drive_folder_url)')
    .order('created_at', { ascending: false })

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

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ applications: data })
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()

  if (!body.business_name || !body.owner_name || !body.phone || !body.address) {
    return NextResponse.json({ error: '업체명, 대표자명, 연락처, 주소는 필수입니다.' }, { status: 400 })
  }

  const ALLOWED_POST = [
    // 일반정보
    'owner_name', 'business_name', 'phone', 'email',
    'platform_nickname', 'business_number', 'account_number',
    // 작업장정보
    'address',
    'elevator', 'building_access', 'access_method', 'parking',
    'business_hours_start', 'business_hours_end',
    // 시공정보
    'care_scope', 'request_notes',
    // 결제정보
    'payment_method',
    'unit_price_per_visit', 'deposit', 'supply_amount', 'vat', 'balance', 'manager_pay',
    // 기타
    'service_type', 'admin_notes',
  ]
  const insert: Record<string, unknown> = { status: '신규' }
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
    'owner_name', 'business_name', 'phone', 'email',
    'platform_nickname', 'business_number', 'account_number',
    // 작업장정보
    'address',
    'elevator', 'building_access', 'access_method', 'parking',
    'business_hours_start', 'business_hours_end',
    // 시공정보
    'care_scope', 'request_notes',
    // 결제정보
    'payment_method',
    'unit_price_per_visit', 'deposit', 'supply_amount', 'vat', 'balance', 'manager_pay',
    // 관리 필드
    'status', 'admin_notes', 'service_type', 'assigned_to',
    'drive_folder_url', 'construction_date',
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
          worker_id: app.assigned_to,
          scheduled_date: app.construction_date.slice(0, 10),
          scheduled_time_start: toTime(app.business_hours_start, '09:00:00'),
          scheduled_time_end: toTime(app.business_hours_end, '18:00:00'),
          status: 'scheduled',
          work_step: 0,
          worker_memo: app.care_scope ?? app.request_notes ?? null,
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
            .limit(1)
            .single()

          const { data: byName } = !byPhone && app.business_name
            ? await supabase
                .from('customers')
                .select('id, unit_price, customer_type')
                .eq('business_name', app.business_name)
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

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
  }

  // 연결된 사진 먼저 삭제 (service_schedules는 FK SET NULL으로 자동 처리)
  await supabase.from('application_photos').delete().eq('application_id', id)

  const { error } = await supabase
    .from('service_applications')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
