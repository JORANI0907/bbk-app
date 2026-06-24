import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

const PAGE_SIZE = 30

type NotificationCategory =
  | 'alimtalk'
  | 'sms'
  | 'missed_call'
  | 'payment'
  | 'system'
  | 'push'
  | 'in_app'

interface UnifiedNotification {
  id: string
  category: NotificationCategory
  type: string
  title: string | null
  body: string
  status: 'sent' | 'failed' | 'read' | 'unread'
  is_read?: boolean
  action_url?: string | null
  created_at: string
}

interface NotificationHistoryRow {
  id: string
  category: NotificationCategory
  type: string
  title: string | null
  body: string
  status: 'sent' | 'failed'
  created_at: string
}

interface InAppRow {
  id: string
  type: string
  title: string
  body: string
  is_read: boolean
  action_url: string | null
  created_at: string
}

export async function GET(request: NextRequest) {
  try {
    const session = getServerSession()
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const userType = searchParams.get('userType')
    const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10))

    if (!userId || userId !== session.userId) {
      return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 })
    }

    if (!userType || !['admin', 'worker', 'customer'].includes(userType)) {
      return NextResponse.json({ error: '유효하지 않은 사용자 유형입니다.' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // notification_history 조회 (기존)
    const { data: historyData, count: historyCount } = await supabase
      .from('notification_history')
      .select('id, category, type, title, body, status, created_at', { count: 'exact' })
      .eq('recipient_type', userType)
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })

    // in_app_notifications 조회 (신규)
    const { data: inAppData, count: inAppCount } = await supabase
      .from('in_app_notifications')
      .select('id, type, title, body, is_read, action_url, created_at', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    const historyItems: UnifiedNotification[] = (
      (historyData as NotificationHistoryRow[]) ?? []
    ).map((row) => ({
      id: row.id,
      category: row.category,
      type: row.type,
      title: row.title,
      body: row.body,
      status: row.status,
      created_at: row.created_at,
    }))

    const inAppItems: UnifiedNotification[] = (
      (inAppData as InAppRow[]) ?? []
    ).map((row) => ({
      id: row.id,
      category: 'in_app' as const,
      type: row.type,
      title: row.title,
      body: row.body,
      status: row.is_read ? ('read' as const) : ('unread' as const),
      is_read: row.is_read,
      action_url: row.action_url,
      created_at: row.created_at,
    }))

    // created_at 내림차순으로 합산 후 페이지네이션
    const merged = [...historyItems, ...inAppItems].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )

    const total = (historyCount ?? 0) + (inAppCount ?? 0)
    const paginated = merged.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

    return NextResponse.json({
      data: paginated,
      total,
      page,
      pageSize: PAGE_SIZE,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
