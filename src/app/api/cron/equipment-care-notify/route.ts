/**
 * Batch C-5: 장비관리보고 알림 cron
 *
 * POST /api/cron/equipment-care-notify
 * Authorization: Bearer $CRON_SECRET
 *
 * 매일 21:00 KST Make.com 시나리오가 호출.
 * 오늘 요일이 workers.equipment_notify_weekdays 에 포함(정규 또는 예비)된 워커에게 웹푸시 발송.
 * 이미 이번 주 제출한 워커도 발송 대상 (재제출·추가 보고 유도).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPushToUsers } from '@/lib/push'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET

function getKstWeekday(): number {
  const kst = new Date(Date.now() + 9 * 3600 * 1000)
  return kst.getUTCDay()
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!CRON_SECRET || token !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const todayWeekday = getKstWeekday()

  const { data: matched, error } = await supabase
    .from('workers')
    .select('id, name, user_id, equipment_notify_weekdays')
    .contains('equipment_notify_weekdays', [todayWeekday])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = (matched ?? [])
    .map(w => w.user_id)
    .filter((v): v is string => !!v)

  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, weekday: todayWeekday, note: '오늘 알림 대상 없음' })
  }

  await sendPushToUsers(userIds, {
    title: '🧰 장비관리보고 알림',
    body: '오늘 사용한 장비 사진을 보고해주세요. 정규+예비 요일에 알림이 발송됩니다.',
    url: '/worker/regular-care',
  })

  return NextResponse.json({
    ok: true,
    weekday: todayWeekday,
    matched: matched?.length ?? 0,
    sent: userIds.length,
  })
}
