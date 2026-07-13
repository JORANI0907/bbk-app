import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// 최근 발송된 출퇴근 알림 이력 (기본 최근 30건, 최대 100건)
export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '30'), 100)

  const { data, error } = await supabase
    .from('attendance_alerts')
    .select(`
      id, alert_type, detected_at, worker_notified_at, admin_notified_at,
      application:service_applications (
        id, business_name, owner_name, construction_date, construction_time
      )
    `)
    .order('detected_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ alerts: data ?? [] })
}
