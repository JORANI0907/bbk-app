'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Bell, Users, UserCog, Briefcase } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { EmptyState } from '@/components/ui/EmptyState'

// ─── 타입 ────────────────────────────────────────────────────────

type UserTarget = 'all' | 'admin' | 'worker' | 'customer'
type LogStatus = 'sent' | 'failed' | 'expired'
type PageTab = 'send' | 'rules' | 'notifications'

type NotificationCategory = 'alimtalk' | 'sms' | 'missed_call' | 'payment' | 'system' | 'push'
type NotificationStatus = 'sent' | 'failed'

interface SubscriptionStats {
  admin: number
  worker: number
  customer: number
}

interface SendFormState {
  target: UserTarget
  title: string
  body: string
  url: string
}

interface NotificationRule {
  id: string
  type: string
  label: string
  description: string | null
  channel_alimtalk: boolean
  channel_sms: boolean
  channel_push: boolean
  channel_in_app: boolean
  notify_admin: boolean
  notify_customer: boolean
  notify_worker: boolean
  is_active: boolean
  sort_order: number
}

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

interface NotificationApiResponse {
  data: NotificationHistoryItem[]
  total: number
  page: number
  pageSize: number
  error?: string
}

interface NotificationFilterState {
  category: string
  from: string
  to: string
}

// ─── 상수 ────────────────────────────────────────────────────────

const EMPTY_FORM: SendFormState = {
  target: 'all',
  title: '',
  body: '',
  url: '',
}

const EMPTY_NOTIFICATION_FILTER: NotificationFilterState = {
  category: 'all',
  from: '',
  to: '',
}

const TARGET_OPTIONS: { value: UserTarget; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'admin', label: '관리자' },
  { value: 'worker', label: '작업자' },
  { value: 'customer', label: '고객' },
]

const STATUS_STYLES: Record<LogStatus, string> = {
  sent: 'bg-state-success-bg text-state-success',
  failed: 'bg-state-danger-bg text-state-danger',
  expired: 'bg-surface-sunken text-text-tertiary',
}

const STATUS_LABELS: Record<LogStatus, string> = {
  sent: '발송완료',
  failed: '실패',
  expired: '만료',
}

const TABS: { value: PageTab; label: string }[] = [
  { value: 'send', label: '푸시 발송' },
  { value: 'rules', label: '자동 알림 규칙' },
  { value: 'notifications', label: '알림 이력' },
]

const NOTIFICATION_CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'alimtalk', label: '알림톡' },
  { value: 'sms', label: 'SMS' },
  { value: 'missed_call', label: '부재중' },
  { value: 'payment', label: '결제' },
  { value: 'push', label: '푸시' },
  { value: 'system', label: '시스템' },
]

const NOTIFICATION_CATEGORY_STYLES: Record<NotificationCategory, string> = {
  alimtalk: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  sms: 'bg-blue-50 text-blue-700 border-blue-200',
  missed_call: 'bg-orange-50 text-orange-700 border-orange-200',
  payment: 'bg-green-50 text-green-700 border-green-200',
  system: 'bg-surface-sunken text-text-secondary border-border',
  push: 'bg-purple-50 text-purple-700 border-purple-200',
}

const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  alimtalk: '알림톡',
  sms: 'SMS',
  missed_call: '부재중',
  payment: '결제',
  system: '시스템',
  push: '푸시',
}

const NOTIFICATION_STATUS_STYLES: Record<NotificationStatus, string> = {
  sent: 'bg-state-success-bg text-state-success',
  failed: 'bg-state-danger-bg text-state-danger',
}

const NOTIFICATION_STATUS_LABELS: Record<NotificationStatus, string> = {
  sent: '발송',
  failed: '실패',
}

// ─── 유틸 ─────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function truncate(text: string, len: number): string {
  return text.length > len ? `${text.slice(0, len)}…` : text
}

// ─── 구독 현황 카드 ───────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode
  label: string
  count: number
  loading: boolean
}

function StatCard({ icon, label, count, loading }: StatCardProps) {
  return (
    <div className="bg-surface rounded-2xl shadow-soft p-6 flex items-center gap-4">
      <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-text-secondary leading-normal">{label}</p>
        {loading ? (
          <div className="h-7 w-16 rounded-md bg-surface-sunken animate-pulse mt-1" />
        ) : (
          <p className="text-2xl font-bold text-text-primary leading-tight tabular-nums">
            {count.toLocaleString()}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── 토글 스위치 ─────────────────────────────────────────────────

interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}

function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-40 ${
        checked ? 'bg-brand-600' : 'bg-border'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

// ─── 자동 알림 규칙 탭 ───────────────────────────────────────────

function RulesTab() {
  const [rules, setRules] = useState<NotificationRule[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  const fetchRules = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/notification-rules')
      const json = await res.json() as { data?: NotificationRule[]; error?: string }
      if (json.error) throw new Error(json.error)
      setRules(json.data ?? [])
    } catch {
      toast.error('알림 규칙 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRules() }, [fetchRules])

  const handleToggle = async (id: string, field: string, value: boolean) => {
    const key = `${id}-${field}`
    setUpdating(key)
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    )
    try {
      const res = await fetch('/api/admin/notification-rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, field, value }),
      })
      const json = await res.json() as { success?: boolean; error?: string }
      if (json.error) throw new Error(json.error)
    } catch {
      toast.error('저장 실패')
      setRules((prev) =>
        prev.map((r) => (r.id === id ? { ...r, [field]: !value } : r))
      )
    } finally {
      setUpdating(null)
    }
  }

  return (
    <section className="bg-surface rounded-2xl shadow-soft overflow-hidden">
      <div className="px-6 py-5 border-b border-border-subtle">
        <SectionHeader
          title="자동 알림 규칙"
          subtitle="고객/직원에게 자동 발송되는 알림 유형을 관리합니다."
        />
      </div>

      {loading ? (
        <div className="p-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-surface-sunken animate-pulse" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <EmptyState icon={<Bell size={36} />} title="알림 규칙이 없습니다." size="md" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-sunken">
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary">알림 유형</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary hidden lg:table-cell">설명</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-text-secondary whitespace-nowrap">알림톡</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-text-secondary">SMS</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-text-secondary whitespace-nowrap">앱 알림</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-text-secondary whitespace-nowrap hidden md:table-cell">대상</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-text-secondary whitespace-nowrap">활성화</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rules.map((rule) => {
                const targets = [
                  rule.notify_admin ? '관리자' : null,
                  rule.notify_customer ? '고객' : null,
                  rule.notify_worker ? '직원' : null,
                ].filter(Boolean).join(', ')

                return (
                  <tr key={rule.id} className="hover:bg-surface-sunken transition-colors">
                    <td className="px-4 py-3 text-text-primary font-medium whitespace-nowrap">
                      {rule.label}
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs hidden lg:table-cell max-w-[200px] truncate">
                      {rule.description ?? '-'}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex justify-center">
                        <Toggle
                          checked={rule.channel_alimtalk}
                          onChange={(v) => handleToggle(rule.id, 'channel_alimtalk', v)}
                          disabled={updating === `${rule.id}-channel_alimtalk`}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex justify-center">
                        <Toggle
                          checked={rule.channel_sms}
                          onChange={(v) => handleToggle(rule.id, 'channel_sms', v)}
                          disabled={updating === `${rule.id}-channel_sms`}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex justify-center">
                        <Toggle
                          checked={rule.channel_in_app}
                          onChange={(v) => handleToggle(rule.id, 'channel_in_app', v)}
                          disabled={updating === `${rule.id}-channel_in_app`}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center hidden md:table-cell">
                      <span className="text-xs text-text-secondary">{targets || '-'}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex justify-center">
                        <Toggle
                          checked={rule.is_active}
                          onChange={(v) => handleToggle(rule.id, 'is_active', v)}
                          disabled={updating === `${rule.id}-is_active`}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// ─── 알림 이력 탭 ────────────────────────────────────────────────

function NotificationsTab() {
  const [items, setItems] = useState<NotificationHistoryItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<NotificationFilterState>(EMPTY_NOTIFICATION_FILTER)
  const [appliedFilter, setAppliedFilter] = useState<NotificationFilterState>(EMPTY_NOTIFICATION_FILTER)

  const fetchData = useCallback(async (f: NotificationFilterState, p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p) })
      if (f.category !== 'all') params.set('category', f.category)
      if (f.from) params.set('from', f.from)
      if (f.to) params.set('to', f.to)

      const res = await fetch(`/api/admin/notification-history?${params}`)
      const json = await res.json() as NotificationApiResponse

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
    setFilter(EMPTY_NOTIFICATION_FILTER)
    setAppliedFilter(EMPTY_NOTIFICATION_FILTER)
    setPage(0)
  }

  const pageSize = 50
  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-5">
      {/* 필터 바 */}
      <section className="bg-surface rounded-2xl shadow-soft p-5 space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* 카테고리 */}
          <div className="flex-1 min-w-[160px]">
            <p className="text-xs font-medium text-text-secondary mb-1.5">카테고리</p>
            <div className="flex flex-wrap gap-2">
              {NOTIFICATION_CATEGORY_OPTIONS.map((opt) => (
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
        <div className="px-6 py-5 border-b border-border-subtle">
          <SectionHeader
            title="알림 이력"
            subtitle={`총 ${total.toLocaleString()}건`}
          />
        </div>

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
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${NOTIFICATION_CATEGORY_STYLES[item.category]}`}>
                        {NOTIFICATION_CATEGORY_LABELS[item.category]}
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
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${NOTIFICATION_STATUS_STYLES[item.status]}`}>
                        {NOTIFICATION_STATUS_LABELS[item.status]}
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

// ─── 메인 컴포넌트 ────────────────────────────────────────────────

export default function PushPage() {
  const [activeTab, setActiveTab] = useState<PageTab>('send')
  const [stats, setStats] = useState<SubscriptionStats>({ admin: 0, worker: 0, customer: 0 })
  const [statsLoading, setStatsLoading] = useState(true)
  const [form, setForm] = useState<SendFormState>(EMPTY_FORM)
  const [sending, setSending] = useState(false)

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const res = await fetch('/api/push/stats')
      const json = await res.json() as SubscriptionStats & { error?: string }
      if (json.error) throw new Error(json.error)
      setStats({ admin: json.admin, worker: json.worker, customer: json.customer })
    } catch {
      toast.error('구독자 수 조회 실패')
    } finally {
      setStatsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const handleSend = async () => {
    if (!form.title.trim()) {
      toast.error('알림 제목을 입력해주세요')
      return
    }
    if (!form.body.trim()) {
      toast.error('알림 내용을 입력해주세요')
      return
    }

    setSending(true)
    try {
      const payload: {
        title: string
        body: string
        url: string
        userType?: string
      } = {
        title: form.title.trim(),
        body: form.body.trim(),
        url: form.url.trim() || '/',
      }

      if (form.target !== 'all') {
        payload.userType = form.target
      }

      const res = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json() as { success?: boolean; sent?: number; error?: string }

      if (!res.ok || json.error) {
        throw new Error(json.error ?? '발송 실패')
      }

      toast.success(`${json.sent ?? 0}명에게 발송 완료`)
      setForm(EMPTY_FORM)
      await fetchStats()
    } catch (err) {
      const message = err instanceof Error ? err.message : '발송 실패'
      toast.error(message)
    } finally {
      setSending(false)
    }
  }

  const totalSubs = stats.admin + stats.worker + stats.customer

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* 페이지 헤더 */}
      <SectionHeader
        level="page"
        title="푸시알림 관리"
        subtitle={`총 구독자 ${totalSubs.toLocaleString()}명`}
      />

      {/* 구독 현황 카드 */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={<UserCog size={22} />} label="관리자 구독자" count={stats.admin} loading={statsLoading} />
        <StatCard icon={<Briefcase size={22} />} label="작업자 구독자" count={stats.worker} loading={statsLoading} />
        <StatCard icon={<Users size={22} />} label="고객 구독자" count={stats.customer} loading={statsLoading} />
      </section>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-border-subtle">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.value
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 1: 푸시 발송 */}
      {activeTab === 'send' && (
        <section className="bg-surface rounded-2xl shadow-soft p-6 space-y-5">
          <SectionHeader title="수동 발송" />

          {/* 대상 선택 */}
          <div>
            <p className="text-sm font-medium text-text-primary mb-2">발송 대상</p>
            <div className="flex flex-wrap gap-3">
              {TARGET_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="push-target"
                    value={opt.value}
                    checked={form.target === opt.value}
                    onChange={() => setForm((prev) => ({ ...prev, target: opt.value }))}
                    className="w-4 h-4 accent-brand-600"
                  />
                  <span className="text-sm text-text-primary">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 제목 */}
          <Input
            label="제목"
            placeholder="알림 제목"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            maxLength={100}
          />

          {/* 내용 */}
          <Textarea
            label="내용"
            placeholder="알림 내용"
            rows={3}
            value={form.body}
            onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
            maxLength={300}
          />

          {/* URL */}
          <Input
            label="이동 URL (선택)"
            placeholder="/admin — 클릭 시 이동할 경로"
            value={form.url}
            onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
          />

          {/* 발송 버튼 */}
          <div className="flex justify-end">
            <Button onClick={handleSend} isLoading={sending} disabled={sending} size="md">
              <Bell size={15} />
              {sending ? '발송 중...' : '푸시 발송'}
            </Button>
          </div>
        </section>
      )}

      {/* 탭 2: 자동 알림 규칙 */}
      {activeTab === 'rules' && <RulesTab />}

      {/* 탭 3: 알림 이력 */}
      {activeTab === 'notifications' && <NotificationsTab />}
    </div>
  )
}
