'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Bell } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'

// ─── 타입 ────────────────────────────────────────────────────────

type NotificationCategory = 'alimtalk' | 'sms' | 'missed_call' | 'payment' | 'system' | 'push'
type NotificationStatus = 'sent' | 'failed'

interface NotificationItem {
  id: string
  category: NotificationCategory
  type: string
  title: string | null
  body: string
  status: NotificationStatus
  created_at: string
}

interface ApiResponse {
  data: NotificationItem[]
  total: number
  page: number
  pageSize: number
  error?: string
}

// ─── 상수 ────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  alimtalk: '알림톡',
  sms: 'SMS',
  missed_call: '부재중',
  payment: '결제',
  system: '시스템',
  push: '푸시',
}

const CATEGORY_STYLES: Record<NotificationCategory, string> = {
  alimtalk: 'bg-yellow-50 text-yellow-700',
  sms: 'bg-blue-50 text-blue-700',
  missed_call: 'bg-orange-50 text-orange-700',
  payment: 'bg-green-50 text-green-700',
  system: 'bg-surface-sunken text-text-secondary',
  push: 'bg-purple-50 text-purple-700',
}

// ─── 유틸 ────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────

export default function WorkerNotificationsPage() {
  const { profile } = useAuth()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async (userId: string, p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        userId,
        userType: 'worker',
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
  }, [])

  useEffect(() => {
    if (profile?.id) {
      fetchData(profile.id, page)
    }
  }, [profile?.id, page, fetchData])

  const pageSize = 30
  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="px-4 py-5">
      <div className="flex items-center gap-2 mb-5">
        <Bell size={20} className="text-text-secondary" />
        <h1 className="text-xl font-bold text-text-primary">알림 이력</h1>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-surface-sunken animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell size={36} />}
          title="알림 이력이 없습니다"
          description="수신된 알림이 없습니다."
          size="md"
        />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="bg-surface rounded-2xl border border-border-subtle p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_STYLES[item.category]}`}>
                      {CATEGORY_LABELS[item.category]}
                    </span>
                    <span className="text-xs font-semibold text-text-primary">{item.type}</span>
                  </div>
                  <p className="text-sm text-text-secondary leading-normal break-keep">{item.body}</p>
                </div>
                <time className="text-xs text-text-tertiary whitespace-nowrap tabular-nums shrink-0">
                  {formatDate(item.created_at)}
                </time>
              </div>
            </div>
          ))}

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-xs text-text-secondary">{total.toLocaleString()}건</p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  이전
                </Button>
                <Button size="sm" variant="ghost" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
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
