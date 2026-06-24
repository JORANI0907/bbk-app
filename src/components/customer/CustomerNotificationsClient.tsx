'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Bell } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'

// ─── 타입 ────────────────────────────────────────────────────────

type NotificationCategory =
  | 'alimtalk'
  | 'sms'
  | 'missed_call'
  | 'payment'
  | 'system'
  | 'push'
  | 'in_app'

type NotificationStatus = 'sent' | 'failed' | 'read' | 'unread'

interface NotificationItem {
  id: string
  category: NotificationCategory
  type: string
  title: string | null
  body: string
  status: NotificationStatus
  is_read?: boolean
  action_url?: string | null
  created_at: string
}

interface ApiResponse {
  data: NotificationItem[]
  total: number
  page: number
  pageSize: number
  error?: string
}

interface Props {
  userId: string
}

// ─── 상수 ────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  alimtalk: '카카오 알림톡',
  sms: 'SMS',
  missed_call: '부재중',
  payment: '결제',
  system: '시스템',
  push: '푸시',
  in_app: '앱 알림',
}

const CATEGORY_STYLES: Record<NotificationCategory, string> = {
  alimtalk: 'bg-yellow-50 text-yellow-700',
  sms: 'bg-blue-50 text-blue-700',
  missed_call: 'bg-orange-50 text-orange-700',
  payment: 'bg-green-50 text-green-700',
  system: 'bg-surface-sunken text-text-secondary',
  push: 'bg-purple-50 text-purple-700',
  in_app: 'bg-brand-600/10 text-brand-600',
}

// ─── 유틸 ────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────

export function CustomerNotificationsClient({ userId }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        userId,
        userType: 'customer',
        page: String(p),
      })
      const res = await fetch(`/api/user/notifications?${params}`)
      const json = await res.json() as ApiResponse

      if (json.error) throw new Error(json.error)
      setItems(json.data)
      setTotal(json.total)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '조회 실패'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [userId])

  // 탭 진입 시 전체 읽음 처리
  useEffect(() => {
    fetch('/api/user/notifications/read', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    }).catch(() => {})
  }, [])

  useEffect(() => {
    fetchData(page)
  }, [page, fetchData])

  const handleItemClick = (item: NotificationItem) => {
    if (item.category === 'in_app' && item.action_url) {
      router.push(item.action_url)
    }
  }

  const pageSize = 30
  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="px-4 py-5 max-w-2xl mx-auto md:px-6 md:py-8">
      {/* 헤더 */}
      <div className="flex items-center gap-2.5 mb-5">
        <Bell size={20} className="text-text-secondary" />
        <h1 className="text-xl font-bold text-text-primary">알림 이력</h1>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-surface-sunken animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell size={40} />}
          title="알림 이력이 없습니다"
          description="수신된 알림 내역이 없습니다."
          size="md"
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isClickable = item.category === 'in_app' && !!item.action_url
            const isUnread = item.category === 'in_app' && item.is_read === false

            return (
              <div
                key={item.id}
                onClick={isClickable ? () => handleItemClick(item) : undefined}
                className={`bg-surface rounded-2xl shadow-soft p-4 transition-colors ${
                  isClickable ? 'cursor-pointer hover:bg-surface-sunken active:scale-[0.98]' : ''
                } ${isUnread ? 'ring-2 ring-brand-600/20' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      {isUnread && (
                        <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0" />
                      )}
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_STYLES[item.category]}`}
                      >
                        {CATEGORY_LABELS[item.category]}
                      </span>
                      {item.title && (
                        <span className="text-xs font-semibold text-text-primary break-keep">
                          {item.title}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-text-secondary leading-normal break-keep">
                      {item.body}
                    </p>
                  </div>
                  <time className="text-xs text-text-tertiary whitespace-nowrap tabular-nums shrink-0 mt-0.5">
                    {formatDate(item.created_at)}
                  </time>
                </div>
              </div>
            )
          })}

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-text-secondary">{total.toLocaleString()}건</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  이전
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  다음
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
