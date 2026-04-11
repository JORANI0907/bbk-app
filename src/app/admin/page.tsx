'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'

// ─── 타입 ──────────────────────────────────────────────────────────

interface Notice {
  id: string
  title: string
  content: string
  type: 'notice' | 'event'
  priority: 'normal' | 'important' | 'urgent'
  pinned: boolean
  popup: boolean
  image_url: string | null
  event_date: string | null
  author_name: string | null
  created_at: string
}

interface Schedule {
  id: string
  scheduled_date: string
  scheduled_time_start: string | null
  customer: {
    business_name: string
    address: string
    contact_name: string
    contact_phone: string
  } | null
}

interface Application {
  id: string
  business_name: string
  owner_name: string
  service_type: string
  scheduled_date: string | null
  created_at: string
}

interface SessionUser { userId: string; name: string; role: string }

// ─── 유틸 ──────────────────────────────────────────────────────────

async function fetchSession(): Promise<SessionUser | null> {
  try {
    const res = await fetch('/api/auth/me')
    const data = await res.json()
    return data.user ?? null
  } catch { return null }
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return '방금 전'
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

const PRIORITY_CONFIG = {
  urgent:    { label: '긴급', badge: 'bg-red-500 text-white',      border: 'border-l-red-500',    bg: 'bg-red-50' },
  important: { label: '중요', badge: 'bg-orange-500 text-white',   border: 'border-l-orange-400', bg: 'bg-orange-50' },
  normal:    { label: '일반', badge: 'bg-gray-200 text-gray-600',   border: 'border-l-gray-300',   bg: 'bg-white' },
}

const TYPE_CONFIG = {
  notice: { icon: '📢', label: '공지', color: 'text-blue-600' },
  event:  { icon: '🎉', label: '행사', color: 'text-purple-600' },
}

// ─── 명언 ─────────────────────────────────────────────────────────

const QUOTES = [
  "오늘의 노력이 내일의 자랑이 됩니다.",
  "작은 일에 최선을 다하는 사람이 큰 일도 해냅니다.",
  "매일 조금씩 나아지면 충분합니다.",
  "당신의 수고가 공간을 빛나게 합니다.",
  "최선을 다한 하루는 후회가 없습니다.",
  "좋은 습관이 좋은 결과를 만듭니다.",
  "함께라면 무엇이든 가능합니다.",
  "오늘도 빛나는 하루가 되세요.",
  "성실함은 가장 위대한 재능입니다.",
  "당신의 노력이 누군가의 공간을 따뜻하게 만듭니다.",
  "한 걸음씩 나아가면 목표에 닿습니다.",
  "오늘 잘 마무리하면 내일이 더 밝아집니다.",
  "작은 친절이 큰 차이를 만듭니다.",
  "지금 이 순간을 소중히 여기세요.",
  "꾸준함이 실력이 됩니다.",
  "당신의 전문성이 고객의 신뢰를 만듭니다.",
  "긍정적인 마음이 좋은 결과를 불러옵니다.",
  "깨끗한 공간이 행복한 삶을 만듭니다.",
  "최고의 서비스는 마음에서 나옵니다.",
  "오늘도 수고 많으십니다. 감사합니다.",
  "당신이 있기에 BBK가 빛납니다.",
  "완벽하지 않아도 됩니다. 최선이면 충분합니다.",
  "좋은 팀원이 최고의 결과를 만듭니다.",
  "오늘 도전한 것은 내일의 자신감이 됩니다.",
  "서비스의 품질은 마음의 크기입니다.",
  "오늘 하루도 건강하고 안전하게!",
  "당신의 손길이 공간에 생명을 불어넣습니다.",
  "어려운 일일수록 해냈을 때 더 빛납니다.",
  "고객의 미소가 우리의 보람입니다.",
  "함께 성장하는 오늘이 자랑스럽습니다.",
]

function getDailyQuote(): string {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000)
  return QUOTES[dayOfYear % QUOTES.length]
}

// ─── 공지 카드 (읽기 전용) ────────────────────────────────────────

function NoticeCard({ notice }: { notice: Notice }) {
  const [expanded, setExpanded] = useState(false)
  const pc = PRIORITY_CONFIG[notice.priority]
  const tc = TYPE_CONFIG[notice.type]

  return (
    <div className={`border-l-4 ${pc.border} ${pc.bg} rounded-r-xl overflow-hidden transition-all`}>
      {/* 사진이 있으면 먼저 표시 */}
      {notice.image_url && (
        <img
          src={notice.image_url}
          alt={notice.title}
          className="w-full max-h-48 object-cover"
        />
      )}

      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl shrink-0 mt-0.5">{tc.icon}</span>
          <div className="flex-1 min-w-0">
            {/* 뱃지 행 */}
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              {notice.pinned && (
                <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">
                  📌 고정
                </span>
              )}
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pc.badge}`}>
                {pc.label}
              </span>
              <span className={`text-xs font-medium ${tc.color}`}>{tc.label}</span>
              {notice.event_date && (
                <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                  📅 {new Date(notice.event_date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
                </span>
              )}
            </div>

            {/* 제목 */}
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-left w-full text-sm font-semibold text-gray-900 hover:text-blue-700 transition-colors leading-snug"
            >
              {notice.title}
            </button>

            {/* 내용 (펼침) */}
            {expanded && (
              <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                {notice.content}
              </p>
            )}

            {/* 메타 */}
            <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
              {notice.author_name && <span>{notice.author_name}</span>}
              <span>·</span>
              <span>{timeAgo(notice.created_at)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 오늘의 일정 카드 ─────────────────────────────────────────────

function TodayScheduleCard() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    fetch(`/api/admin/schedules?date=${today}`)
      .then(r => r.json())
      .then(d => setSchedules(d.schedules ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">📅 오늘의 일정</h3>
        <Link href="/admin/schedule"
          className="text-xs text-blue-600 hover:underline font-medium">보러가기</Link>
      </div>
      {loading ? (
        <div className="px-4 py-6 text-center text-gray-400 text-xs">불러오는 중...</div>
      ) : schedules.length === 0 ? (
        <div className="px-4 py-6 text-center text-gray-400 text-xs">오늘 배정된 일정이 없습니다.</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {schedules.slice(0, 5).map(sch => (
            <div key={sch.id} className="px-4 py-3">
              <p className="text-xs font-semibold text-gray-900 truncate">
                {sch.customer?.business_name ?? '업체명 없음'}
              </p>
              {sch.customer?.contact_name && (
                <p className="text-xs text-gray-500">{sch.customer.contact_name} · {sch.customer.contact_phone}</p>
              )}
              {sch.customer?.address && (
                <p className="text-xs text-gray-400 truncate mt-0.5">{sch.customer.address}</p>
              )}
              {sch.scheduled_time_start && (
                <p className="text-xs text-blue-500 mt-0.5">{sch.scheduled_time_start.slice(0, 5)}</p>
              )}
            </div>
          ))}
          {schedules.length > 5 && (
            <div className="px-4 py-2 text-center text-xs text-gray-400">
              외 {schedules.length - 5}건
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 새로 추가된 일정 카드 ─────────────────────────────────────────

function NewScheduleCard() {
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/applications?limit=5&sort=created_at')
      .then(r => r.json())
      .then(d => {
        const list: Application[] = d.applications ?? d.data ?? []
        // 최근 7일 내 추가된 것만
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
        setApps(list.filter(a => new Date(a.created_at).getTime() > cutoff).slice(0, 5))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">🆕 새로 추가된 일정</h3>
        <Link href="/admin/schedule"
          className="text-xs text-blue-600 hover:underline font-medium">보러가기</Link>
      </div>
      {loading ? (
        <div className="px-4 py-6 text-center text-gray-400 text-xs">불러오는 중...</div>
      ) : apps.length === 0 ? (
        <div className="px-4 py-6 text-center text-gray-400 text-xs">최근 7일 내 새 일정이 없습니다.</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {apps.map(app => (
            <div key={app.id} className="px-4 py-3">
              <p className="text-xs font-semibold text-gray-900 truncate">{app.business_name}</p>
              <p className="text-xs text-gray-500">{app.owner_name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {app.scheduled_date && (
                  <span className="text-xs text-purple-500">{app.scheduled_date}</span>
                )}
                {app.service_type && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                    {app.service_type}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 메인 페이지 ─────────────────────────────────────────────────

export default function AdminHomePage() {
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null)
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'notice' | 'event'>('all')
  const [now, setNow] = useState(new Date())

  const dailyQuote = getDailyQuote()

  useEffect(() => {
    fetchSession().then(setCurrentUser)
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  const fetchNotices = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/notices')
      const data = await res.json()
      setNotices(data.notices ?? [])
    } catch {
      toast.error('공지사항 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchNotices() }, [fetchNotices])

  const filteredNotices = notices.filter(n => filter === 'all' || n.type === filter)

  const urgentCount = notices.filter(n => n.priority === 'urgent').length
  const pinnedCount = notices.filter(n => n.pinned).length

  const greeting = (() => {
    const h = now.getHours()
    if (h < 12) return '좋은 아침이에요'
    if (h < 18) return '좋은 오후예요'
    return '좋은 저녁이에요'
  })()

  const dateStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto pb-6">

      {/* ── 웰컴 배너 ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 p-6 text-white shadow-lg">
        <div className="absolute -right-8 -top-8 w-40 h-40 bg-white/10 rounded-full" />
        <div className="absolute -right-2 top-8 w-24 h-24 bg-white/10 rounded-full" />
        <div className="absolute left-1/2 -bottom-10 w-48 h-48 bg-white/5 rounded-full" />

        <div className="relative z-10 flex items-center justify-between gap-4">
          <div>
            <p className="text-blue-200 text-sm font-medium">{greeting} 👋</p>
            <h1 className="text-2xl font-bold mt-1 leading-tight">
              {currentUser?.name ?? ''}님,<br />환영합니다!
            </h1>
            <p className="text-blue-200 text-xs mt-2">{dateStr}</p>
            {/* 오늘의 명언 */}
            <p className="mt-3 text-sm text-blue-100 italic opacity-90 max-w-xs leading-snug">
              &ldquo;{dailyQuote}&rdquo;
            </p>
          </div>
          <div className="text-right shrink-0 hidden sm:block">
            <div className="text-4xl font-bold tabular-nums leading-none">
              {now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </div>
            <p className="text-blue-200 text-xs mt-1">BBK 공간케어</p>
          </div>
        </div>

        {(urgentCount > 0 || pinnedCount > 0) && (
          <div className="relative z-10 flex gap-2 mt-4 flex-wrap">
            {urgentCount > 0 && (
              <span className="flex items-center gap-1.5 bg-red-500/30 border border-red-400/40 text-white text-xs font-semibold px-3 py-1.5 rounded-full backdrop-blur-sm">
                🚨 긴급 공지 {urgentCount}건
              </span>
            )}
            {pinnedCount > 0 && (
              <span className="flex items-center gap-1.5 bg-white/20 border border-white/30 text-white text-xs font-medium px-3 py-1.5 rounded-full backdrop-blur-sm">
                📌 고정 공지 {pinnedCount}건
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── 2열 레이아웃: 공지 + 사이드바 ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 공지사항 (2/3) */}
        <div className="lg:col-span-2 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-gray-900">공지사항</h2>
              {notices.length > 0 && (
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{notices.length}</span>
              )}
            </div>
            <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs">
              {(['all', 'notice', 'event'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 font-medium transition-colors ${filter === f ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                  {f === 'all' ? '전체' : f === 'notice' ? '📢 공지' : '🎉 행사'}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-gray-400 text-sm">불러오는 중...</div>
          ) : filteredNotices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-dashed border-gray-200 text-center gap-2">
              <span className="text-4xl">📋</span>
              <p className="text-gray-400 text-sm">
                {filter === 'all' ? '등록된 공지사항이 없습니다.' : filter === 'notice' ? '공지사항이 없습니다.' : '행사 정보가 없습니다.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredNotices.map(n => <NoticeCard key={n.id} notice={n} />)}
            </div>
          )}
        </div>

        {/* 사이드 패널 (1/3) */}
        <div className="flex flex-col gap-4">

          {/* 오늘의 일정 */}
          <TodayScheduleCard />

          {/* 새로 추가된 일정 */}
          <NewScheduleCard />

        </div>
      </div>
    </div>
  )
}
