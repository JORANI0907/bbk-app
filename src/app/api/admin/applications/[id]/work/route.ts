import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSMS, sendAlimtalk } from '@/lib/solapi'
import { notifySlack } from '@/lib/slack'

// 정기엔드케어 작업완료알림 카카오 템플릿 ID (P2-24)
const END_CARE_TEMPLATE_ID = 'KA01TP251208071633315G1wZC9a3w4F'

type Params = { params: Promise<{ id: string }> }

// ─── notification_log 항목 타입 ──────────────────────────────────
interface NotificationLogEntry {
  type: string
  sent_at: string
  phone: string
  method: 'auto' | 'manual'
  template_id?: string
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = createServiceClient()
  const { id } = await params
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
      .select(
        'owner_name, business_name, phone, drive_folder_url, customer_memo, supply_amount, payment_method, notification_sent_at, service_type, construction_date, notification_log',
      )
      .eq('id', id)
      .single()

    if (fetchError || !app) {
      return NextResponse.json({ error: '신청서를 찾을 수 없습니다.' }, { status: 404 })
    }
    if (app.notification_sent_at) {
      return NextResponse.json({ error: '이미 발송된 알림입니다.' }, { status: 400 })
    }

    const nowIso = new Date().toISOString()
    const phone = (app.phone ?? '').replace(/-/g, '')
    const isEndCare = app.service_type === '정기엔드케어'

    try {
      if (isEndCare) {
        // P2-24: 정기엔드케어 전용 알림탁 템플릿
        await sendEndCareCompletion(app, phone)
      } else {
        await sendWorkCompletion(app, phone)
      }

      const notifyType = isEndCare ? '작업완료알림(엔드케어)' : '작업완료알림'

      // P2-30: notification_log append
      const existingLog: NotificationLogEntry[] = Array.isArray(app.notification_log)
        ? (app.notification_log as NotificationLogEntry[])
        : []

      const newEntry: NotificationLogEntry = {
        type: notifyType,
        sent_at: nowIso,
        phone,
        method: 'manual',
        ...(isEndCare && { template_id: END_CARE_TEMPLATE_ID }),
      }

      const updatedLog = [newEntry, ...existingLog]

      const { error } = await supabase
        .from('service_applications')
        .update({
          notification_sent_at: nowIso,
          notification_send_at: null,
          // 정기엔드케어는 '작업완료(엔드)', 나머지는 '작업완료'
          status: isEndCare ? '작업완료(엔드)' : '작업완료',
          notification_log: updatedLog,
        })
        .eq('id', id)

      if (error) throw error

      // P2-29: Slack 보고
      await notifySlack({
        notifyType,
        customerName: app.owner_name ?? '',
        phone,
        businessName: app.business_name ?? '',
        constructionDate: app.construction_date?.slice(0, 10) ?? null,
        method: 'manual',
      }).catch(() => { /* Slack 실패는 무시 */ })

      return NextResponse.json({ success: true })
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
  }

  return NextResponse.json({ error: '알 수 없는 action입니다.' }, { status: 400 })
}

// ─── 내부 헬퍼 ───────────────────────────────────────────────────

interface AppData {
  owner_name: string
  business_name: string
  phone: string
  drive_folder_url: string | null
  customer_memo: string | null
  supply_amount: number | null
  payment_method: string | null
}

async function sendWorkCompletion(app: AppData, phone: string): Promise<void> {
  if (!phone) throw new Error('연락처가 없습니다.')

  const lines: string[] = [
    `[BBK 공간케어] ${app.business_name} 작업완료 안내`,
    '',
  ]

  if (app.customer_memo) {
    lines.push('특이사항', app.customer_memo, '')
  }

  if (app.drive_folder_url) {
    lines.push(`작업 사진: ${app.drive_folder_url}`, '')
  }

  if (app.supply_amount || app.payment_method) {
    lines.push('결제 정보')
    if (app.supply_amount) lines.push(`금액: ${app.supply_amount.toLocaleString()}원`)
    if (app.payment_method) lines.push(`방법: ${app.payment_method}`)
    lines.push('')
  }

  lines.push('감사합니다 - BBK 공간케어')

  await sendSMS(phone, lines.join('\n'))
}

// P2-24: 정기엔드케어 전용 알림 (카카오 템플릿 우선, 실패 시 SMS fallback)
async function sendEndCareCompletion(app: AppData, phone: string): Promise<void> {
  if (!phone) throw new Error('연락처가 없습니다.')

  const fallbackText = [
    `[BBK 공간케어] ${app.business_name} 엔드케어 작업완료 안내`,
    '',
    app.customer_memo ? `특이사항: ${app.customer_memo}` : '',
    app.drive_folder_url ? `작업 사진: ${app.drive_folder_url}` : '',
    '감사합니다 - BBK 공간케어',
  ].filter(Boolean).join('\n')

  try {
    const variables: Record<string, string> = {
      '#{고객명}': app.owner_name ?? '',
      '#{업체명}': app.business_name ?? '',
      '#{특이사항}': app.customer_memo ?? '없음',
      '#{드라이브링크}': app.drive_folder_url ?? '',
    }
    await sendAlimtalk(phone, END_CARE_TEMPLATE_ID, variables, fallbackText)
  } catch {
    // 카카오 실패 시 SMS fallback
    await sendSMS(phone, fallbackText)
  }
}
