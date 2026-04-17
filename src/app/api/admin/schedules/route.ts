import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

interface ServiceApplication {
  id: string
  construction_date: string | null
  business_hours_start: string | null
  care_scope: string | null
  service_type: string | null
  business_name: string | null
  owner_name: string | null
  address: string | null
  phone: string | null
  assigned_to: string | null
  status: string | null
}

export async function GET(request: NextRequest) {
  const session = getServerSession()
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date 파라미터가 필요합니다. (YYYY-MM-DD)' }, { status: 400 })
  }

  const supabase = createServiceClient()

  let query = supabase
    .from('service_applications')
    .select('id, construction_date, business_hours_start, care_scope, service_type, business_name, owner_name, address, phone, assigned_to, status')
    .eq('construction_date', date)
    .is('deleted_at', null)
    .order('business_hours_start', { ascending: true, nullsFirst: false })

  if (session.role === 'worker') {
    query = query.eq('assigned_to', session.userId)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const schedules = (data as ServiceApplication[]).map(app => ({
    id: app.id,
    scheduled_date: app.construction_date,
    scheduled_time_start: app.business_hours_start,
    care_scope: app.care_scope,
    service_type: app.service_type,
    assigned_to: app.assigned_to,
    status: app.status,
    customer: {
      business_name: app.business_name,
      contact_name: app.owner_name,
      contact_phone: app.phone,
      address: app.address,
    },
  }))

  return NextResponse.json({ schedules })
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const {
    application_id,
    customer_id,
    // 신청서에서 직접 생성할 때 사용
    business_name, address, contact_name, contact_phone,
    worker_id, scheduled_date, scheduled_time_start, scheduled_time_end,
    notes, status,
  } = body

  let finalCustomerId = customer_id

  // 고객 매칭 (기존 고객만 연결, 없으면 null 유지)
  if (!finalCustomerId && business_name) {
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('contact_phone', contact_phone ?? '')
      .is('deleted_at', null)
      .single()

    if (existingCustomer) {
      finalCustomerId = existingCustomer.id
    }
    // 매칭 실패 시 자동 생성하지 않음 — finalCustomerId = null 유지
  }

  const toTime = (t: string | undefined) => {
    if (!t) return '09:00:00'
    return t.length === 5 ? `${t}:00` : t
  }

  const { data, error } = await supabase
    .from('service_schedules')
    .insert({
      customer_id: finalCustomerId,
      worker_id: worker_id || null,
      scheduled_date,
      scheduled_time_start: toTime(scheduled_time_start),
      scheduled_time_end: toTime(scheduled_time_end),
      status: status || 'scheduled',
      worker_memo: notes || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 신청서 상태 업데이트
  if (application_id) {
    await supabase
      .from('service_applications')
      .update({ status: '계약완료' })
      .eq('id', application_id)
  }

  return NextResponse.json({ success: true, schedule: data })
}

export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { id, ...updates } = body

  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  // notes → worker_memo로 매핑
  if ('notes' in updates) {
    updates.worker_memo = updates.notes
    delete updates.notes
  }

  const { error } = await supabase
    .from('service_schedules')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
