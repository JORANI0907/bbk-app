import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { notifySlack } from '@/lib/slack'
import { calcMonthlyDueDate, computeBillingAmountFromCustomer } from '@/lib/billing-generator'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = createServiceClient()
  const { id } = await params
  const body = await request.json()
  const {
    action,
    customer_memo, internal_memo, drive_folder_url,
    condition_score, recommended_services,
    worker_planned_departure, worker_plan_note,
  } = body

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

    // Phase 27-AV: 작업완료 Slack 보고 (작업시작과 대칭). 1회성·정기딥·정기엔드 모두 동일.
    try {
      const { data: appData } = await supabase
        .from('service_applications')
        .select('business_name, owner_name, construction_date, service_type')
        .eq('id', id)
        .single()
      if (appData) {
        await notifySlack({
          notifyType: '작업완료',
          customerName: appData.owner_name ?? '',
          phone: '',
          businessName: appData.business_name ?? '',
          constructionDate: appData.construction_date?.slice(0, 10) ?? null,
          method: 'manual',
        })
      }
    } catch { /* Slack 실패 무시 */ }

    // 정기딥케어 월간 billing 안전망: 작업완료 시점에 해당 월 billing이 없으면 자동 생성
    try {
      const { data: saData } = await supabase
        .from('service_applications')
        .select('customer_id, construction_date, service_type')
        .eq('id', id)
        .single()

      if (saData?.service_type === '정기딥케어' && saData?.construction_date) {
        const { data: cust } = await supabase
          .from('customers')
          .select('billing_cycle, payment_date, supply_amount, vat, billing_amount, payment_method, status')
          .eq('id', saData.customer_id)
          .single()

        if (cust?.billing_cycle === '월간' && cust?.status !== 'paused') {
          const visitDate = new Date(saData.construction_date)
          const y = visitDate.getFullYear()
          const m = visitDate.getMonth() + 1
          const period = `${y}-${String(m).padStart(2, '0')}`

          const { data: existing } = await supabase
            .from('service_billings')
            .select('id')
            .eq('customer_id', saData.customer_id)
            .eq('billing_period', period)
            .eq('billing_type', 'monthly')
            .maybeSingle()

          if (!existing) {
            const amount = computeBillingAmountFromCustomer(cust)
            if (amount) {
              const dueDate = calcMonthlyDueDate(saData.construction_date, cust.payment_date)
              await supabase.from('service_billings').insert({
                customer_id:    saData.customer_id,
                billing_type:   'monthly',
                billing_period: period,
                amount,
                due_date:       dueDate,
                status:         'pending',
                service_type:   '정기딥케어',
              })
            }
          }
        }
      }
    } catch { /* billing 안전망 실패는 무시 */ }

    return NextResponse.json({ success: true })
  }

  if (action === 'update') {
    const updates: Record<string, unknown> = {}
    if (customer_memo !== undefined) updates.customer_memo = customer_memo
    if (internal_memo !== undefined) updates.internal_memo = internal_memo
    if (drive_folder_url !== undefined) updates.drive_folder_url = drive_folder_url
    if (worker_planned_departure !== undefined) updates.worker_planned_departure = worker_planned_departure
    if (worker_plan_note !== undefined) updates.worker_plan_note = worker_plan_note

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
