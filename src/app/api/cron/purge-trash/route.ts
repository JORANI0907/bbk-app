import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'

const CRON_SECRET = process.env.CRON_SECRET
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000

export async function GET(request: NextRequest) {
  const secret =
    request.headers.get('authorization')?.replace('Bearer ', '') ??
    request.headers.get('x-cron-secret')

  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const cutoff = new Date(Date.now() - SIXTY_DAYS_MS).toISOString()

  // 고객 60일 경과분 영구 삭제 (FK CASCADE로 schedules 자동 정리)
  const { data: deletedCustomers, error: custErr } = await supabase
    .from('customers')
    .delete()
    .lt('deleted_at', cutoff)
    .not('deleted_at', 'is', null)
    .select('id')

  if (custErr) {
    return NextResponse.json({ error: custErr.message }, { status: 500 })
  }

  // service_applications 60일 경과분 영구 삭제
  const { data: deletedApps, error: appErr } = await supabase
    .from('service_applications')
    .delete()
    .lt('deleted_at', cutoff)
    .not('deleted_at', 'is', null)
    .select('id')

  if (appErr) {
    return NextResponse.json({ error: appErr.message }, { status: 500 })
  }

  // service_schedules 60일 경과분 영구 삭제 (고객/신청서에 묶이지 않고 자체 소프트 삭제된 것)
  const { data: deletedSchedules, error: schedErr } = await supabase
    .from('service_schedules')
    .delete()
    .lt('deleted_at', cutoff)
    .not('deleted_at', 'is', null)
    .select('id')

  if (schedErr) {
    return NextResponse.json({ error: schedErr.message }, { status: 500 })
  }

  const customerCount = deletedCustomers?.length ?? 0
  const appCount = deletedApps?.length ?? 0
  const scheduleCount = deletedSchedules?.length ?? 0

  await sendSlack(
    `🗑️ 영구삭제 | 고객 ${customerCount}건, 신청서 ${appCount}건, 일정 ${scheduleCount}건 (60일 경과)`
  )

  return NextResponse.json({
    success: true,
    purged: {
      customers: customerCount,
      applications: appCount,
      schedules: scheduleCount,
    },
  })
}
