import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendByTemplate } from '@/lib/template-sender'
import type { NotificationContext } from '@/lib/notification-variables'
import { saveNotificationHistory } from '@/lib/notification'

/**
 * 정기 청구(service_billings) 기반 결제 알림 크론.
 *
 * 대상: status='pending' AND due_date <= today (선납·후납 모두 동일 규칙)
 *   - due_date 는 billing-generator.ts 에서 timing 별로 이미 계산됨
 *     · 선납: 사이클 시작월의 payment_day
 *     · 후납: 계약시작일 + K사이클 - 1일
 * 발송 정책: 결제완료(status='paid') 될 때까지 매일 1회 반복 발송.
 *   - notification_log 에 오늘 같은 type 발송 이력 있으면 스킵.
 *
 * 인증: CRON_SECRET Bearer 헤더
 * 스케줄: Make.com 시나리오에서 매일 KST 06:00 호출 권장
 */

const CRON_SECRET = process.env.CRON_SECRET

function getKSTToday(): string {
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return nowKST.toISOString().slice(0, 10)
}

/** 결제방식 → 알림 템플릿 base code */
function pickTemplateBase(paymentMethod: string | null): string | null {
  const pm = String(paymentMethod ?? '')
  if (pm === '현금(계산서 희망)') return '결제알림'
  if (pm === '현금(비과세)')     return '결제알림(현금)'
  if (pm === '카드(온라인 간편결제)' || pm === '플랫폼') return '결제요청알림(카드)'
  return null
}

/** service_type → 템플릿 코드 suffix */
function typeSuffix(serviceType: string | null): string {
  if (serviceType === '정기딥케어')   return '_정기딥'
  if (serviceType === '정기엔드케어') return '_정기엔드'
  return ''
}

interface CustomerInfo {
  id: string
  business_name: string | null
  business_number: string | null
  contact_name: string | null
  contact_phone: string | null
  address: string | null
  payment_method: string | null
  customer_type: string | null
  status: string | null
  notification_log: Array<{ type: string; sent_at: string }> | null
}

interface BillingRow {
  id: string
  customer_id: string
  billing_period: string
  amount: number
  due_date: string
  billing_timing: 'prepaid' | 'postpaid' | null
  customers: CustomerInfo | null
}

function alreadySentToday(
  log: Array<{ type: string; sent_at: string }> | null,
  type: string,
  todayKST: string,
): boolean {
  if (!Array.isArray(log)) return false
  return log.some(e => e.type === type && e.sent_at.startsWith(todayKST))
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const todayKST = getKSTToday()

  // 오늘 이전(포함) due_date인 pending 청구 조회 + 고객 조인
  const { data: rows, error } = await supabase
    .from('service_billings')
    .select(`
      id, customer_id, billing_period, amount, due_date, billing_timing,
      customers(id, business_name, business_number, contact_name, contact_phone, address,
                payment_method, customer_type, status, notification_log)
    `)
    .eq('status', 'pending')
    .lte('due_date', todayKST)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let sent = 0, failed = 0, skipped = 0
  const errors: Array<{ billing_id: string; reason: string }> = []

  for (const row of ((rows ?? []) as unknown as BillingRow[])) {
    const c = row.customers
    if (!c) { skipped++; continue }
    if (c.status === 'paused') { skipped++; continue }
    if (!c.contact_phone) { skipped++; continue }

    const base = pickTemplateBase(c.payment_method)
    if (!base) { skipped++; continue }

    const templateCode = `${base}${typeSuffix(c.customer_type)}`
    if (alreadySentToday(c.notification_log, base, todayKST)) { skipped++; continue }

    // 템플릿 활성 여부 확인
    const { data: tpl } = await supabase
      .from('notification_templates')
      .select('is_active, auto_used, send_mode')
      .eq('code', templateCode)
      .maybeSingle()
    if (!tpl || !tpl.is_active || !tpl.auto_used || tpl.send_mode !== 'auto') {
      skipped++
      continue
    }

    const phone = String(c.contact_phone).replace(/-/g, '')
    const context: NotificationContext = {
      application: {
        business_name:   c.business_name,
        business_number: c.business_number,
        owner_name:      c.contact_name,
        phone:           c.contact_phone,
        address:         c.address,
        payment_method:  c.payment_method,
        // 청구 정보 매핑 (템플릿에서 supply_amount / construction_date 변수로 참조)
        supply_amount:   row.amount,
        vat:             0,
        construction_date: row.due_date,
      },
    }

    try {
      const result = await sendByTemplate(templateCode, phone, context)
      if (!result.ok) throw new Error(result.reason ?? 'send failed')

      const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
      const nowIso = nowKST.toISOString().replace('Z', '+09:00')
      const existLog = Array.isArray(c.notification_log) ? c.notification_log : []
      const newLog = [
        ...existLog,
        { type: base, sent_at: nowIso, phone, method: 'auto', channel: result.type },
      ]

      await supabase
        .from('customers')
        .update({ notification_log: newLog })
        .eq('id', c.id)

      await saveNotificationHistory({
        category: 'sms',
        type: base,
        body: result.text,
        method: 'auto',
        recipientType: 'customer',
        recipientPhone: phone,
        metadata: {
          billing_id:    row.id,
          customer_id:   c.id,
          billing_period: row.billing_period,
          billing_timing: row.billing_timing ?? 'prepaid',
          due_date:      row.due_date,
          amount:        row.amount,
          channel:       result.type,
          source:        'cron/billing-payment-reminders',
        },
        status: 'sent',
      })

      sent++
    } catch (e) {
      failed++
      errors.push({
        billing_id: row.id,
        reason: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return NextResponse.json({
    ok: true,
    date: todayKST,
    scanned: (rows ?? []).length,
    sent, failed, skipped,
    errors,
  })
}
