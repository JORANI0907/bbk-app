'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { LoadingSpinner } from '@/components/admin/LoadingSpinner'
import { OpsDashboardSection } from '@/components/admin/ops/OpsDashboardSection'
import { Camera, ClipboardList, Megaphone, PartyPopper, Pin, Calendar, Sparkles, Siren } from 'lucide-react'

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
  scheduled_date: string | null
  scheduled_time_start: string | null
  care_scope: string | null
  service_type: string | null
  customer: {
    business_name: string | null
    address: string | null
    contact_name: string | null
    contact_phone: string | null
  } | null
}

interface Application {
  id: string
  business_name: string
  owner_name: string
  service_type: string
  scheduled_date: string | null
  created_at: string
  assigned_to: string | null
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

// Toss식 위계: brand 컬러 명도로만 표현 (긴급 > 중요 > 일반)
const PRIORITY_CONFIG = {
  urgent:    { label: '긴급', badge: 'bg-brand-600 text-white',       bar: 'bg-brand-600' },
  important: { label: '중요', badge: 'bg-brand-100 text-brand-700',   bar: 'bg-brand-400' },
  normal:    { label: '일반', badge: 'bg-surface-sunken text-text-secondary', bar: 'bg-border' },
}

const TYPE_CONFIG = {
  notice: { icon: <Megaphone size={20} />, label: '공지', color: 'text-brand-600' },
  event:  { icon: <PartyPopper size={20} />, label: '이벤트', color: 'text-brand-500' },
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
  const [lightbox, setLightbox] = useState<string | null>(null)
  const pc = PRIORITY_CONFIG[notice.priority]
  const tc = TYPE_CONFIG[notice.type]

  const contentPreview = (notice.content ?? '').replace(/\s+/g, ' ').trim()
  const shortPreview = contentPreview.length > 15 ? `${contentPreview.slice(0, 15)}…` : contentPreview
  const fullDate = new Date(notice.created_at).toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).replace(/\.\s?/g, '.').replace(/\.$/, '')

  return (
    <div className="relative bg-surface border border-border-subtle rounded-2xl overflow-hidden card-toss shadow-flat">
      {/* 우선순위 accent bar (Toss 방식: border 대신 내부 absolute) */}
      <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${pc.bar}`} />
      <div className="p-4 pl-5">
        <div className="flex items-start gap-3">
          <span className="text-xl shrink-0 mt-0.5">{tc.icon}</span>
          <div className="flex-1 min-w-0">
            {/* 뱃지 행 + 우측 년월일 */}
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-xs font-semibold ${tc.color}`}>{tc.label}</span>
                {notice.pinned && (
                  <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-700 bg-brand-100 px-1.5 py-0.5 rounded-md">
                    <Pin size={10} className="inline mr-0.5" />고정
                  </span>
                )}
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-md ${pc.badge}`}>
                  {pc.label}
                </span>
                {notice.event_date && (
                  <span className="text-xs font-semibold text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded-md">
                    <Calendar size={12} className="inline mr-0.5" />{new Date(notice.event_date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
                  </span>
                )}
                {notice.image_url && !expanded && (
                  <span className="text-xs text-text-tertiary bg-surface-sunken px-1.5 py-0.5 rounded-md"><Camera size={12} /></span>
                )}
              </div>
              <span className="text-xs font-medium text-text-tertiary whitespace-nowrap shrink-0">
                {fullDate}
              </span>
            </div>

            {/* 제목 */}
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-left w-full text-sm font-semibold text-text-primary hover:text-brand-700 transition-colors leading-snug"
            >
              {notice.title}
            </button>

            {/* 본문 15글자 미리보기 (접혔을 때만) */}
            {!expanded && shortPreview && (
              <p className="text-xs text-text-secondary leading-snug mt-0.5">{shortPreview}</p>
            )}

            {/* 펼쳐질 때: 사진 + 전체 내용 */}
            {expanded && (
              <>
                {notice.image_url && (
                  <img
                    src={notice.image_url}
                    alt={notice.title}
                    className="w-full h-auto mt-3 rounded-lg cursor-zoom-in"
                    onClick={() => setLightbox(notice.image_url)}
                  />
                )}
                <p className="mt-2 text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                  {notice.content}
                </p>
              </>
            )}

            {/* 메타 (작성자만 유지 — 날짜는 위로 이동) */}
            {notice.author_name && (
              <div className="text-xs text-text-tertiary mt-2">{notice.author_name}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 오늘의 일정 카드 ─────────────────────────────────────────────

function TodayScheduleCard({ role, userId }: { role: string; userId: string }) {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    fetch(`/api/admin/schedules?date=${today}`)
      .then(r => r.json())
      .then(d => {
        // 서버사이드에서 role/userId 기반 필터링이 완료된 결과를 그대로 사용
        setSchedules(d.schedules ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [role, userId])

  return (
    <div className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
      <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
        <h3 className="text-sm font-bold text-text-primary flex items-center gap-1"><Calendar size={14} />오늘의 일정</h3>
        <Link href="/admin/schedule"
          className="text-xs text-brand-600 hover:underline font-medium">보러가기</Link>
      </div>
      {loading ? (
        <LoadingSpinner text="일정 불러오는 중..." />
      ) : schedules.length === 0 ? (
        <div className="px-4 py-6 text-center text-text-tertiary text-xs">오늘 배정된 일정이 없습니다.</div>
      ) : (
        <div className="anim-stagger-fast divide-y divide-border-subtle">
          {schedules.slice(0, 5).map(sch => (
            <div key={sch.id} className="px-4 py-3">
              <p className="text-xs font-semibold text-text-primary truncate">
                {sch.customer?.business_name ?? '업체명 없음'}
              </p>
              {sch.customer?.contact_name && (
                <p className="text-xs text-text-secondary">{sch.customer.contact_name} · {sch.customer.contact_phone}</p>
              )}
              {sch.customer?.address && (
                <p className="text-xs text-text-tertiary truncate mt-0.5">{sch.customer.address}</p>
              )}
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {sch.scheduled_date && (
                  <span className="text-xs text-text-secondary">
                    시공일: {sch.scheduled_date.slice(2).replace(/-/g, '.')}
                  </span>
                )}
                {sch.scheduled_time_start && (
                  <span className="text-xs text-brand-500">{sch.scheduled_time_start.slice(0, 5)}</span>
                )}
              </div>
              {sch.care_scope && (
                <p className="text-xs text-text-tertiary mt-0.5">{sch.care_scope}</p>
              )}
            </div>
          ))}
          {schedules.length > 5 && (
            <div className="px-4 py-2 text-center text-xs text-text-tertiary">
              외 {schedules.length - 5}건
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 새로 추가된 일정 카드 ─────────────────────────────────────────

function NewScheduleCard({ role, userId }: { role: string; userId: string }) {
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/applications?limit=50&sort=created_at')
      .then(r => r.json())
      .then(d => {
        let list: Application[] = d.applications ?? d.data ?? []
        // 최근 7일 내 추가된 것만
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
        list = list.filter(a => new Date(a.created_at).getTime() > cutoff)
        // worker는 본인이 담당자인 일정만 클라이언트 필터링
        if (role === 'worker' && userId) {
          list = list.filter(a => a.assigned_to === userId)
        }
        setApps(list.slice(0, 5))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [role, userId])

  return (
    <div className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
      <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
        <h3 className="text-sm font-bold text-text-primary flex items-center gap-1"><Sparkles size={14} />새로 추가된 일정</h3>
        <Link href="/admin/schedule"
          className="text-xs text-brand-600 hover:underline font-medium">보러가기</Link>
      </div>
      {loading ? (
        <LoadingSpinner text="일정 불러오는 중..." />
      ) : apps.length === 0 ? (
        <div className="px-4 py-6 text-center text-text-tertiary text-xs">최근 7일 내 새 일정이 없습니다.</div>
      ) : (
        <div className="anim-stagger-fast divide-y divide-border-subtle">
          {apps.map(app => (
            <div key={app.id} className="px-4 py-3">
              <p className="text-xs font-semibold text-text-primary truncate">{app.business_name}</p>
              <p className="text-xs text-text-secondary">{app.owner_name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {app.scheduled_date && (
                  <span className="text-xs font-semibold text-brand-600">{app.scheduled_date}</span>
                )}
                {app.service_type && (
                  <span className="text-xs bg-surface-sunken text-text-secondary px-1.5 py-0.5 rounded-md">
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
  const [showAllNotices, setShowAllNotices] = useState(false)
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
  const NOTICE_LIMIT_DESKTOP = 5
  const NOTICE_LIMIT_MOBILE  = 3
  const slicedNotices = showAllNotices ? filteredNotices : filteredNotices.slice(0, NOTICE_LIMIT_DESKTOP)

  const urgentCount = notices.filter(n => n.priority === 'urgent').length
  const pinnedCount = notices.filter(n => n.pinned).length

  const dateStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto pb-20 md:pb-6">

      {/* ── Phase 1 v2 S5: 운영 대시보드 (admin 전용) ────────── */}
      {currentUser?.role === 'admin' && <OpsDashboardSection />}

      {/* ── 인사말 (Toss 스타일 — 그라디언트 배너 제거) ─────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-text-tertiary">{dateStr}</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-text-primary leading-tight break-keep">
            안녕하세요, {currentUser?.name ?? ''}님
          </h1>
          {/* 오늘의 명언 */}
          <p className="mt-2 text-sm text-text-secondary italic leading-snug break-keep">
            &ldquo;{dailyQuote}&rdquo;
          </p>
        </div>

        {(urgentCount > 0 || pinnedCount > 0) && (
          <div className="flex gap-2 flex-wrap shrink-0 justify-end">
            {urgentCount > 0 && (
              <Link href="/admin/notices" className="btn-toss-primary inline-flex items-center gap-1.5 bg-brand-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold">
                <Siren size={14} />긴급 공지 {urgentCount}건
              </Link>
            )}
            {pinnedCount > 0 && (
              <Link href="/admin/notices" className="btn-toss inline-flex items-center gap-1.5 bg-brand-50 text-brand-700 border border-brand-100 px-3 py-1.5 rounded-lg text-xs font-semibold">
                <Pin size={14} />고정 공지 {pinnedCount}건
              </Link>
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
              <h2 className="text-base font-bold text-text-primary">공지사항</h2>
              {notices.length > 0 && (
                <span className="text-xs bg-surface-sunken text-text-secondary px-2 py-0.5 rounded-md font-semibold">{notices.length}</span>
              )}
            </div>
            <div className="inline-flex rounded-lg bg-surface-sunken p-1 text-xs font-semibold border border-border-subtle">
              {(['all', 'notice', 'event'] as const).map(f => (
                <button key={f} onClick={() => { setFilter(f); setShowAllNotices(false) }}
                  className={`pill-toss px-3 py-1 rounded flex items-center gap-1 ${filter === f ? 'segment-active-toss bg-surface text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}>
                  {f === 'all' ? '전체' : f === 'notice' ? <><Megaphone size={12} />공지</> : <><PartyPopper size={12} />이벤트</>}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <LoadingSpinner />
          ) : filteredNotices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 bg-surface rounded-2xl border border-dashed border-border text-center gap-2">
              <ClipboardList size={40} />
              <p className="text-text-tertiary text-sm">
                {filter === 'all' ? '등록된 공지사항이 없습니다.' : filter === 'notice' ? '공지사항이 없습니다.' : '이벤트 정보가 없습니다.'}
              </p>
            </div>
          ) : (
            <div className="anim-stagger-fast flex flex-col gap-2">
              {slicedNotices.map((n, i) => (
                <div key={n.id} className={!showAllNotices && i >= NOTICE_LIMIT_MOBILE ? 'hidden sm:block' : ''}>
                  <NoticeCard notice={n} />
                </div>
              ))}
              {!showAllNotices && filteredNotices.length > NOTICE_LIMIT_MOBILE && (
                <button
                  onClick={() => setShowAllNotices(true)}
                  className="btn-toss w-full py-2 text-xs font-semibold text-text-secondary bg-surface-sunken hover:bg-surface hover:text-brand-700 border border-border rounded-lg"
                >
                  전체보기 ({filteredNotices.length}개)
                </button>
              )}
            </div>
          )}
        </div>

        {/* 사이드 패널 (1/3) */}
        <div className="flex flex-col gap-4">

          {/* 오늘의 일정 */}
          <TodayScheduleCard role={currentUser?.role ?? ''} userId={currentUser?.userId ?? ''} />

          {/* 새로 추가된 일정 */}
          <NewScheduleCard role={currentUser?.role ?? ''} userId={currentUser?.userId ?? ''} />

        </div>
      </div>
    </div>
  )
}
