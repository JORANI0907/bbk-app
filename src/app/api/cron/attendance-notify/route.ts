/**
 * Batch C-5: 출퇴근 알림 cron
 *
 * POST /api/cron/attendance-notify
 * Authorization: Bearer $CRON_SECRET
 *
 * 매일 21:00 KST Make.com 시나리오가 호출.
 * 오늘 요일이 workers.attendance_notify_weekdays 에 포함된 워커에게 웹푸시 발송.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPushToUsers } from '@/lib/push'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET

function getKstWeekday(): number {
  // 0=일 ~ 6=토
  const kst = new Date(Date.now() + 9 * 3600 * 1000)
  return kst.getUTCDay()
}

export async function POST(request: NextRequest) {
  // Bearer 토큰 인증
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!CRON_SECRET || token !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const todayWeekday = getKstWeekday()

  // 오늘 요일이 배열에 포함된 워커 조회 (Postgres array contains)
  const { data: matched, error } = await supabase
    .from('workers')
    .select('id, name, user_id, attendance_notify_weekdays')
    .contains('attendance_notify_weekdays', [todayWeekday])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = (matched ?? [])
    .map(w => w.user_id)
    .filter((v): v is string => !!v)

  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, weekday: todayWeekday, note: '오늘 알림 대상 없음' })
  }

  await sendPushToUsers(userIds, {
    title: '🕘 출근 체크하셨나요?',
    body: '오늘 출퇴근 기록을 잊지 마세요. 지금 앱에서 남겨주세요.',
    url: '/admin/attendance',
  })

  return NextResponse.json({
    ok: true,
    weekday: todayWeekday,
    matched: matched?.length ?? 0,
    sent: userIds.length,
  })
}
