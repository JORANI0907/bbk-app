import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('service_schedules')
    .select(`*, customer:customers(id,business_name,address,contact_name,contact_phone), worker:users(id,name)`)
    .order('scheduled_date', { ascending: true })

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
        .insert({ business_name, address, contact_name, contact_phone, status: 'active' })
        .select('id')
        .single()
      if (customerError) return NextResponse.json({ error: customerError.message }, { status: 500 })
      finalCustomerId = newCustomer.id
    }
  }

  const { data, error } = await supabase
    .from('service_schedules')
    .insert({
      customer_id: finalCustomerId,
      worker_id: worker_id || null,
      scheduled_date,
      scheduled_time_start: scheduled_time_start || '09:00:00',
      scheduled_time_end: scheduled_time_end || '12:00:00',
      status: status || 'scheduled',
      notes: notes || null,
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

  const { error } = await supabase
    .from('service_schedules')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
