import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')

  let query = supabase
    .from('service_schedules')
    .select(`*, customer:customers(id,business_name,address,contact_name,contact_phone), worker:users(id,name)`)
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time_start', { ascending: true })

  if (date) {
    query = query.eq('scheduled_date', date)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ schedules: data })
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

  // 고객 없으면 생성
  if (!finalCustomerId && business_name) {
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('contact_phone', contact_phone ?? '')
      .single()

    if (existingCustomer) {
      finalCustomerId = existingCustomer.id
    } else {
      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({ business_name, address, contact_name: contact_name || '담당자', contact_phone: contact_phone || '', pipeline_status: 'contracted' })
        .select('id')
        .single()
      if (customerError) return NextResponse.json({ error: customerError.message }, { status: 500 })
      finalCustomerId = newCustomer.id
    }
  }

  const toTime = (t: string | undefined) => {
    if (!t) return '09:00:00'
    return t.length === 5 ? `${t}:00` : t
  }

  if (!finalCustomerId) {
    return NextResponse.json({ error: '고객 정보를 찾을 수 없습니다.' }, { status: 400 })
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
