import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSMS } from '@/lib/solapi'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // 발송 예정 시간이 지났고 아직 발송 안 된 항목 조회
  const { data: pending, error } = await supabase
    .from('service_applications')
    .select('id, owner_name, business_name, phone, drive_folder_url, customer_memo, supply_amount, payment_method')
    .eq('work_status', 'completed')
    .lte('notification_send_at', new Date().toISOString())
    .is('notification_sent_at', null)
    .not('notification_send_at', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!pending || pending.length === 0) return NextResponse.json({ processed: 0 })

  const results = await Promise.allSettled(
    pending.map(async (app) => {
      if (!app.phone) return

      const lines: string[] = [`[BBK 공간케어] ${app.business_name} 작업완료 안내`, '']

      if (app.customer_memo) lines.push('📋 특이사항', app.customer_memo, '')
      if (app.drive_folder_url) lines.push(`📸 작업 사진: ${app.drive_folder_url}`, '')

      if (app.supply_amount || app.payment_method) {
        lines.push('💳 결제 정보')
        if (app.supply_amount) lines.push(`금액: ${app.supply_amount.toLocaleString()}원`)
        if (app.payment_method) lines.push(`방법: ${app.payment_method}`)
        lines.push('')
      }

      lines.push('감사합니다 - BBK 공간케어')

      await sendSMS(app.phone, lines.join('\n'))

      await supabase
        .from('service_applications')
        .update({ notification_sent_at: new Date().toISOString(), notification_send_at: null })
        .eq('id', app.id)
    }),
  )

  const sent = results.filter((r) => r.status === 'fulfilled').length
  const failed = results.filter((r) => r.status === 'rejected').length

  return NextResponse.json({ processed: pending.length, sent, failed })
}
