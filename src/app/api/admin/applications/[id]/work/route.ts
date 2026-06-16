import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { notifySlack } from '@/lib/slack'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = createServiceClient()
  const { id } = await params
  const body = await request.json()
  const { action, customer_memo, internal_memo, drive_folder_url, condition_score, recommended_services } = body

  if (action === 'start') {
    const { error } = await supabase
      .from('service_applications')
      .update({
        work_status: 'in_progress',
        work_started_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // 작업시작 Slack 보고
    try {
      const { data: appData } = await supabase
        .from('service_applications')
        .select('business_name, owner_name, construction_date, service_type')
        .eq('id', id)
        .single()
      if (appData) {
        await notifySlack({
          notifyType: '작업시작',
          customerName: appData.owner_name ?? '',
          phone: '',
          businessName: appData.business_name ?? '',
          constructionDate: appData.construction_date?.slice(0, 10) ?? null,
          method: 'manual',
        })
      }
    } catch { /* Slack 실패 무시 */ }

    return NextResponse.json({ success: true })
  }

  // P1-14: 작업시작 취소 (pending으로 복귀)
  if (action === 'cancel_start') {
    const { error } = await supabase
      .from('service_applications')
      .update({
        work_status: 'pending',
        work_started_at: null,
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'complete') {
    const now = new Date()

    const { error } = await supabase
      .from('service_applications')
      .update({
        work_status: 'completed',
        work_completed_at: now.toISOString(),
        ...(customer_memo !== undefined && { customer_memo }),
        ...(internal_memo !== undefined && { internal_memo }),
        ...(drive_folder_url !== undefined && { drive_folder_url }),
        ...(condition_score !== undefined && { condition_score }),
        ...(recommended_services !== undefined && { recommended_services }),
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'update') {
    const updates: Record<string, unknown> = {}
    if (customer_memo !== undefined) updates.customer_memo = customer_memo
    if (internal_memo !== undefined) updates.internal_memo = internal_memo
    if (drive_folder_url !== undefined) updates.drive_folder_url = drive_folder_url

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '업데이트할 항목이 없습니다.' }, { status: 400 })
    }

    const { error } = await supabase
      .from('service_applications')
      .update(updates)
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'cancel_complete') {
    const { error } = await supabase
      .from('service_applications')
      .update({
        work_status: 'in_progress',
        work_completed_at: null,
        notification_send_at: null,
      })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }


  return NextResponse.json({ error: '알 수 없는 action입니다.' }, { status: 400 })
}
