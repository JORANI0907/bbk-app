import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendByTemplate } from '@/lib/template-sender'
import type { NotificationContext } from '@/lib/notification-variables'
import { saveNotificationHistory } from '@/lib/notification'
import { appendBothNotificationLogs } from '@/lib/notification-log'

/**
 * 1회성케어 고객에게 예약확정알림 SMS 발송 + status='예약확정' 세팅.
 *
 * 발송 후 짝 service_applications.status='예약확정' 이 되므로 다음날부터
 * reservation-reminders cron 이 자동으로 예약1일전/예약당일 알림을 발송.
 *
 * 정기딥/정기엔드는 별도 알림 흐름을 쓰므로 여기서는 1회성만 허용.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createServiceClient()
  const { id } = params

  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
  }

  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single()

  if (custErr || !customer) {
    return NextResponse.json({ error: '고객을 찾을 수 없습니다.' }, { status: 404 })
  }
  if (customer.customer_type !== '1회성케어') {
    return NextResponse.json(
      { error: '1회성케어 고객만 예약확정이 가능합니다.' },
      { status: 400 },
    )
  }

  const phone = (customer.contact_phone ?? '').replace(/-/g, '')
  if (!phone) {
    return NextResponse.json({ error: '연락처가 없습니다.' }, { status: 400 })
  }

  // 짝 open 신청서 조회 (알림 컨텍스트 + status 동기화 대상)
  const { data: openApp } = await supabase
    .from('service_applications')
    .select('*')
    .eq('customer_id', id)
    .is('deleted_at', null)
    .in('status', ['신규', '기존고객', '예약확정', '예약1일전', '예약당일'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const context: NotificationContext = {
    customer: {
      business_name: customer.business_name,
      contact_name: customer.contact_name,
      contact_phone: customer.contact_phone,
      address: customer.address,
      payment_method: customer.payment_method,
      account_number: customer.account_number,
      supply_amount: customer.supply_amount,
      vat: customer.vat,
      deposit: customer.deposit,
      balance: customer.balance,
      care_scope: customer.care_scope,
      business_hours_start: customer.business_hours_start,
      business_hours_end: customer.business_hours_end,
    },
    application: openApp
      ? {
          business_name: openApp.business_name,
          owner_name: openApp.owner_name,
          phone: openApp.phone,
          email: openApp.email,
          address: openApp.address,
          construction_date: openApp.construction_date,
          construction_time: openApp.construction_time,
          business_hours_start: openApp.business_hours_start,
          business_hours_end: openApp.business_hours_end,
          pre_meeting_at: openApp.pre_meeting_at,
          payment_method: openApp.payment_method,
          account_number: openApp.account_number,
          supply_amount: openApp.supply_amount,
          vat: openApp.vat,
          deposit: openApp.deposit,
          balance: openApp.balance,
          deposit_payment_url: openApp.deposit_payment_url,
          balance_payment_url: openApp.balance_payment_url,
          care_scope: openApp.care_scope,
        }
      : null,
  }

  const result = await sendByTemplate('예약확정알림_1회성', phone, context)
  if (!result.ok) {
    return NextResponse.json(
      { error: `SMS 발송 실패: ${result.reason}${result.details ? ` (${result.details})` : ''}` },
      { status: 500 },
    )
  }

  // 이력 저장 (KST)
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .replace('Z', '+09:00')
  const newEntry = {
    type: '예약확정알림',
    sent_at: nowKST,
    phone,
    method: 'manual' as const,
    channel: result.type,
  }

  // customer.progress_status 세팅 + notification_log 갱신
  // (짝 신청서 있으면 appendBothNotificationLogs 로 양쪽 저장, status 도 함께)
  await supabase
    .from('customers')
    .update({ progress_status: '예약확정' })
    .eq('id', id)

  if (openApp) {
    const existAppLog = Array.isArray(openApp.notification_log)
      ? (openApp.notification_log as Array<Record<string, unknown>>)
      : []
    await appendBothNotificationLogs(supabase, {
      appId: openApp.id as string,
      customerId: id,
      existingAppLog: existAppLog,
      entry: newEntry,
      extraAppFields: { status: '예약확정' },
    })
  } else {
    // 짝 신청서가 없으면 customer.notification_log 만 직접 갱신
    const existCustLog = Array.isArray(customer.notification_log)
      ? (customer.notification_log as Array<Record<string, unknown>>)
      : []
    await supabase
      .from('customers')
      .update({ notification_log: [newEntry, ...existCustLog] })
      .eq('id', id)
  }

  await saveNotificationHistory({
    category: 'sms',
    type: '예약확정알림',
    body: result.text,
    method: 'manual',
    recipientType: 'customer',
    recipientPhone: phone,
    metadata: {
      customer_id: id,
      application_id: openApp?.id,
      business_name: customer.business_name,
      channel: result.type,
      source: 'admin/customers/confirm-reservation',
    },
    status: 'sent',
  })

  return NextResponse.json({
    success: true,
    channel: result.type,
    application_id: openApp?.id ?? null,
  })
}
