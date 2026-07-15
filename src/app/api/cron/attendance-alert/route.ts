import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET

// 감지 함수 반환 타입
interface AttendanceAnomaly {
  application_id: string
  business_name: string | null
  alert_type: 'late_arrival' | 'late_departure' | 'overrun'
  construction_date: string
  scheduled_time: string | null
  work_started_at: string | null
  elapsed_min: number
  worker_user_ids: string[] | null
  assigned_admin_id: string | null
}

interface PushSubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
}

const ALERT_META: Record<AttendanceAnomaly['alert_type'], { emoji: string; label: string }> = {
  late_arrival:   { emoji: '🚨', label: '출근 지연' },
  late_departure: { emoji: '⏰', label: '퇴근 지연' },
  overrun:        { emoji: '⚡', label: '소요 초과' },
}

/**
 * Make.com 스케줄러가 매 30분(20-06시) 호출하는 통합 감지 · 알림 endpoint.
 * 감지 → Slack + Web Push + attendance_alerts INSERT를 서버에서 한 번에 처리.
 */
export async function POST(request: NextRequest) {
  // Bearer 토큰 인증
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!CRON_SECRET || token !== CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // 1. 감지 함수 호출
  const { data: anomalies, error: rpcError } = await supabase
    .rpc('detect_attendance_anomalies', {
      late_arrival_grace_min: 10,
      late_departure_grace_min: 30,
      overrun_ratio: 0.5,
    })

  if (rpcError) {
    console.error('[attendance-alert] rpc error', rpcError)
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

  const events = (anomalies ?? []) as AttendanceAnomaly[]
  if (events.length === 0) {
    return NextResponse.json({ processed: 0, message: 'no anomalies' })
  }

  // Web Push용 VAPID 설정 (있을 때만)
  const hasVapid = !!(
    process.env.VAPID_SUBJECT &&
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY
  )
  if (hasVapid) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    )
  }

  const results = { processed: 0, slack: 0, push: 0, inserted: 0, errors: [] as string[] }

  for (const ev of events) {
    const meta = ALERT_META[ev.alert_type]
    if (!meta) continue

    // 2. Slack 알림
    try {
      const scheduled = ev.scheduled_time ? ` · 예정 ${ev.scheduled_time}` : ''
      const link = 'https://app.bbkorea.co.kr/admin/live'
      await sendSlack(
        `${meta.emoji} *BBK ${meta.label} 감지*\n` +
        `• 현장: ${ev.business_name ?? '(현장명 없음)'}\n` +
        `• 날짜: ${ev.construction_date}${scheduled}\n` +
        `• 경과: ${ev.elapsed_min}분\n` +
        `<${link}|오늘의 현장 열기>`,
      )
      results.slack++
    } catch (e) {
      results.errors.push(`slack:${ev.application_id}:${e instanceof Error ? e.message : 'unknown'}`)
    }

    // 3. Web Push (overrun은 관리자만 → 직원 스킵)
    if (hasVapid && ev.alert_type !== 'overrun' && ev.worker_user_ids?.length) {
      try {
        const { data: subs } = await supabase
          .from('push_subscriptions')
          .select('endpoint, p256dh, auth')
          .eq('is_active', true)
          .in('user_id', ev.worker_user_ids)

        const payload = JSON.stringify({
          title: `⚠️ BBK 현장 확인 필요`,
          body: `${ev.business_name ?? '현장'} · ${meta.label} · ${ev.elapsed_min}분 경과`,
          url: '/admin/schedule',
        })

        const sent = await Promise.allSettled(
          (subs as PushSubscriptionRow[] ?? []).map((s) =>
            webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              payload,
            ),
          ),
        )
        results.push += sent.filter((r) => r.status === 'fulfilled').length
      } catch (e) {
        results.errors.push(`push:${ev.application_id}:${e instanceof Error ? e.message : 'unknown'}`)
      }
    }

    // 4. attendance_alerts INSERT (중복 방지)
    try {
      const now = new Date().toISOString()
      const { error: insErr } = await supabase.from('attendance_alerts').insert({
        application_id: ev.application_id,
        alert_type: ev.alert_type,
        admin_notified_at: now,
        worker_notified_at: ev.alert_type !== 'overrun' && ev.worker_user_ids?.length ? now : null,
      })
      if (insErr && !insErr.message.includes('duplicate')) {
        results.errors.push(`insert:${ev.application_id}:${insErr.message}`)
      } else if (!insErr) {
        results.inserted++
      }
    } catch (e) {
      results.errors.push(`insert:${ev.application_id}:${e instanceof Error ? e.message : 'unknown'}`)
    }

    results.processed++
  }

  return NextResponse.json(results)
}
