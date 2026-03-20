import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSMS } from '@/lib/solapi'

type Params = { params: { id: string } }

export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = createServiceClient()
  const { id } = params
  const body = await request.json()
  const { action, customer_memo, internal_memo, drive_folder_url } = body

  if (action === 'start') {
    const { error } = await supabase
      .from('service_applications')
      .update({
        work_status: 'in_progress',
        work_started_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'complete') {
    const now = new Date()
    const sendAt = new Date(now.getTime() + 60 * 60 * 1000) // 1시간 후

    const { error } = await supabase
      .from('service_applications')
      .update({
        work_status: 'completed',
        work_completed_at: now.toISOString(),
        notification_send_at: sendAt.toISOString(),
        ...(customer_memo !== undefined && { customer_memo }),
        ...(internal_memo !== undefined && { internal_memo }),
        ...(drive_folder_url !== undefined && { drive_folder_url }),
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, send_at: sendAt.toISOString() })
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

  if (action === 'cancel_notification') {
    const { error } = await supabase
      .from('service_applications')
      .update({ notification_send_at: null })
      .eq('id', id)
      .is('notification_sent_at', null)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'send_now') {
    const { data: app, error: fetchError } = await supabase
      .from('service_applications')
      .select('owner_name, business_name, phone, drive_folder_url, customer_memo, supply_amount, payment_method, notification_sent_at')
      .eq('id', id)
      .single()

    if (fetchError || !app) return NextResponse.json({ error: '신청서를 찾을 수 없습니다.' }, { status: 404 })
    if (app.notification_sent_at) return NextResponse.json({ error: '이미 발송된 알림입니다.' }, { status: 400 })

    try {
      await sendWorkCompletion(app)
      const { error } = await supabase
        .from('service_applications')
        .update({
          notification_sent_at: new Date().toISOString(),
          notification_send_at: null,
        })
        .eq('id', id)

      if (error) throw error
      return NextResponse.json({ success: true })
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
  }

  return NextResponse.json({ error: '알 수 없는 action입니다.' }, { status: 400 })
}

// ─── 내부 헬퍼 ───────────────────────────────────────────────

interface AppData {
  owner_name: string
  business_name: string
  phone: string
  drive_folder_url: string | null
  customer_memo: string | null
  supply_amount: number | null
  payment_method: string | null
}

async function sendWorkCompletion(app: AppData) {
  if (!app.phone) throw new Error('연락처가 없습니다.')

  const lines: string[] = [
    `[BBK 공간케어] ${app.business_name} 작업완료 안내`,
    '',
  ]

  if (app.customer_memo) {
    lines.push('📋 특이사항', app.customer_memo, '')
  }

  if (app.drive_folder_url) {
    lines.push(`📸 작업 사진: ${app.drive_folder_url}`, '')
  }

  if (app.supply_amount || app.payment_method) {
    lines.push('💳 결제 정보')
    if (app.supply_amount) lines.push(`금액: ${app.supply_amount.toLocaleString()}원`)
    if (app.payment_method) lines.push(`방법: ${app.payment_method}`)
    lines.push('')
  }

  lines.push('감사합니다 - BBK 공간케어')

  await sendSMS(app.phone, lines.join('\n'))
}
