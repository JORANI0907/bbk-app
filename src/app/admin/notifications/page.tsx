'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Bell } from 'lucide-react'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

// ─── 타입 ────────────────────────────────────────────────────────

type NotificationCategory = 'alimtalk' | 'sms' | 'missed_call' | 'payment' | 'system' | 'push'
type NotificationStatus = 'sent' | 'failed'

interface NotificationHistoryItem {
  id: string
  category: NotificationCategory
  type: string
  method: 'auto' | 'manual'
  recipient_type: 'admin' | 'worker' | 'customer' | null
  recipient_name: string | null
  recipient_phone: string | null
  title: string | null
  body: string
  status: NotificationStatus
  error_message: string | null
  created_at: string
}

interface ApiResponse {
  data: NotificationHistoryItem[]
  total: number
  page: number
  pageSize: number
  error?: string
}

// ─── 상수 ────────────────────────────────────────────────────────

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'alimtalk', label: '알림톡' },
  { value: 'sms', label: 'SMS' },
  { value: 'missed_call', label: '부재중' },
  { value: 'payment', label: '결제' },
  { value: 'push', label: '푸시' },
  { value: 'system', label: '시스템' },
]

const CATEGORY_STYLES: Record<NotificationCategory, string> = {
  alimtalk: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  sms: 'bg-blue-50 text-blue-700 border-blue-200',
  missed_call: 'bg-orange-50 text-orange-700 border-orange-200',
  payment: 'bg-green-50 text-green-700 border-green-200',
  system: 'bg-surface-sunken text-text-secondary border-border',
  push: 'bg-purple-50 text-purple-700 border-purple-200',
}

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  alimtalk: '알림톡',
  sms: 'SMS',
  missed_call: '부재중',
  payment: '결제',
  system: '시스템',
  push: '푸시',
}

const STATUS_STYLES: Record<NotificationStatus, string> = {
  sent: 'bg-state-success-bg text-state-success',
  failed: 'bg-state-danger-bg text-state-danger',
}

const STATUS_LABELS: Record<NotificationStatus, string> = {
  sent: '발송',
  failed: '실패',
}

// ─── 유틸 ────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function truncate(text: string, len: number): string {
  return text.length > len ? `${text.slice(0, len)}…` : text
}

// ─── 필터 상태 ───────────────────────────────────────────────────

interface FilterState {
  category: string
  from: string
  to: string
}

const EMPTY_FILTER: FilterState = {
  category: 'all',
  from: '',
  to: '',
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationHistoryItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER)
  const [appliedFilter, setAppliedFilter] = useState<FilterState>(EMPTY_FILTER)

  const fetchData = useCallback(async (f: FilterState, p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p) })
      if (f.category !== 'all') params.set('category', f.category)
      if (f.from) params.set('from', f.from)
      if (f.to) params.set('to', f.to)

      const res = await fetch(`/api/admin/notification-history?${params}`)
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
    fetchData(appliedFilter, page)
  }, [fetchData, appliedFilter, page])

  const handleSearch = () => {
    setPage(0)
    setAppliedFilter({ ...filter })
  }

  const handleReset = () => {
    setFilter(EMPTY_FILTER)
    setAppliedFilter(EMPTY_FILTER)
    setPage(0)
  }

  const pageSize = 50
  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* 헤더 */}
      <SectionHeader
        level="page"
        title="알림 이력"
        subtitle={`총 ${total.toLocaleString()}건`}
      />

      {/* 필터 바 */}
      <section className="bg-surface rounded-2xl shadow-soft p-5 space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* 카테고리 */}
          <div className="flex-1 min-w-[160px]">
            <p className="text-xs font-medium text-text-secondary mb-1.5">카테고리</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFilter((prev) => ({ ...prev, category: opt.value }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    filter.category === opt.value
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-surface text-text-secondary border-border hover:bg-surface-sunken'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 날짜 범위 */}
          <div className="flex items-end gap-2">
            <Input
              label="시작일"
              type="date"
              value={filter.from}
              onChange={(e) => setFilter((prev) => ({ ...prev, from: e.target.value }))}
            />
            <span className="text-text-tertiary pb-2">~</span>
            <Input
              label="종료일"
              type="date"
              value={filter.to}
              onChange={(e) => setFilter((prev) => ({ ...prev, to: e.target.value }))}
            />
          </div>

          {/* 버튼 */}
          <div className="flex gap-2 pb-0.5">
            <Button size="sm" onClick={handleSearch}>조회</Button>
            <Button size="sm" variant="ghost" onClick={handleReset}>초기화</Button>
          </div>
        </div>
      </section>

      {/* 테이블 */}
      <section className="bg-surface rounded-2xl shadow-soft overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 rounded-xl bg-surface-sunken animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Bell size={36} />}
            title="알림 이력이 없습니다"
            description="조건에 맞는 알림 이력이 없습니다."
            size="md"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-sunken">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary whitespace-nowrap">발송일시</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary whitespace-nowrap">유형</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary">상세 유형</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary hidden md:table-cell">수신자</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary hidden lg:table-cell">내용</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary whitespace-nowrap">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-sunken transition-colors">
                    <td className="px-4 py-3 text-text-secondary whitespace-nowrap tabular-nums text-xs">
                      {formatDate(item.created_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${CATEGORY_STYLES[item.category]}`}>
                        {CATEGORY_LABELS[item.category]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-primary font-medium max-w-[140px] truncate">
                      {item.type}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex flex-col">
                        <span className="text-text-primary text-xs font-medium">{item.recipient_name ?? '-'}</span>
                        <span className="text-text-tertiary text-xs">{item.recipient_phone ?? ''}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary hidden lg:table-cell text-xs max-w-[240px] truncate">
                      {truncate(item.body, 40)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[item.status]}`}>
                        {STATUS_LABELS[item.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border-subtle">
            <p className="text-xs text-text-secondary">
              {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} / {total.toLocaleString()}건
            </p>
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
      </section>
    </div>
  )
}
