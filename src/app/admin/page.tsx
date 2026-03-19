'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'

// ─── 타입 ──────────────────────────────────────────────────────────

interface Notice {
  id: string
  title: string
  content: string
  type: 'notice' | 'event'
  priority: 'normal' | 'important' | 'urgent'
  pinned: boolean
  event_date: string | null
  author_name: string | null
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

function fmtEventDate(d: string) {
  return new Date(d).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
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

// ─── 공지 작성/수정 모달 ──────────────────────────────────────────

interface NoticeFormData {
  title: string
  content: string
  type: 'notice' | 'event'
  priority: 'normal' | 'important' | 'urgent'
  pinned: boolean
  event_date: string
}

const EMPTY_FORM: NoticeFormData = {
  title: '', content: '', type: 'notice', priority: 'normal', pinned: false, event_date: '',
}

function NoticeModal({
  initial, onSave, onClose,
}: {
  initial?: Notice | null
  onSave: (data: NoticeFormData) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<NoticeFormData>(
    initial
      ? { title: initial.title, content: initial.content, type: initial.type, priority: initial.priority, pinned: initial.pinned, event_date: initial.event_date ?? '' }
      : EMPTY_FORM
  )
  const [saving, setSaving] = useState(false)

  const set = (k: keyof NoticeFormData, v: string | boolean) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.content.trim()) {
      toast.error('제목과 내용을 입력하세요.')
      return
    }
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 text-base">{initial ? '공지 수정' : '공지 작성'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* 유형 / 우선순위 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">유형</label>
              <select value={form.type} onChange={e => set('type', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="notice">📢 공지사항</option>
                <option value="event">🎉 행사/이벤트</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">중요도</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="normal">일반</option>
                <option value="important">중요</option>
                <option value="urgent">긴급</option>
              </select>
            </div>
          </div>

          {/* 행사 날짜 (행사 유형일 때만) */}
          {form.type === 'event' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">행사 날짜</label>
              <input type="date" value={form.event_date} onChange={e => set('event_date', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}

          {/* 제목 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">제목</label>
            <input type="text" value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="제목을 입력하세요"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* 내용 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">내용</label>
            <textarea value={form.content} onChange={e => set('content', e.target.value)}
              rows={5} placeholder="내용을 입력하세요"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* 상단 고정 */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => set('pinned', !form.pinned)}
              className={`w-9 h-5 rounded-full relative transition-colors ${form.pinned ? 'bg-blue-600' : 'bg-gray-200'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.pinned ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-gray-600">상단 고정</span>
          </label>

          {/* 버튼 */}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
              취소
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
              {saving ? '저장 중...' : (initial ? '수정하기' : '작성하기')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── 공지 카드 ────────────────────────────────────────────────────

function NoticeCard({
  notice, isAdmin, onEdit, onDelete, onTogglePin,
}: {
  notice: Notice
  isAdmin: boolean
  onEdit: (n: Notice) => void
  onDelete: (id: string) => void
  onTogglePin: (n: Notice) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const pc = PRIORITY_CONFIG[notice.priority]
  const tc = TYPE_CONFIG[notice.type]

  return (
    <div className={`border-l-4 ${pc.border} ${pc.bg} rounded-r-xl p-4 transition-all`}>
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
                📅 {fmtEventDate(notice.event_date)}
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
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {notice.author_name && <span>{notice.author_name}</span>}
              <span>·</span>
              <span>{timeAgo(notice.created_at)}</span>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-1">
                <button onClick={() => onTogglePin(notice)}
                  className={`p-1 rounded hover:bg-white/60 transition-colors text-sm ${notice.pinned ? 'text-blue-500' : 'text-gray-300 hover:text-blue-400'}`}
                  title={notice.pinned ? '고정 해제' : '상단 고정'}>
                  📌
                </button>
                <button onClick={() => onEdit(notice)}
                  className="p-1 rounded hover:bg-white/60 transition-colors text-gray-400 hover:text-gray-700 text-xs">
                  ✏️
                </button>
                <button onClick={() => onDelete(notice.id)}
                  className="p-1 rounded hover:bg-white/60 transition-colors text-gray-400 hover:text-red-500 text-xs">
                  🗑️
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 메인 페이지 ─────────────────────────────────────────────────

export default function AdminHomePage() {
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null)
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState<Notice | null>(null)
  const [filter, setFilter] = useState<'all' | 'notice' | 'event'>('all')
  const [now, setNow] = useState(new Date())

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

  const isAdmin = currentUser?.role === 'admin'

  const handleSave = async (form: NoticeFormData) => {
    const isEdit = !!editTarget
    const url = '/api/admin/notices'
    const body = isEdit ? { id: editTarget!.id, ...form } : form
    const method = isEdit ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const d = await res.json()
      toast.error(d.error ?? '저장 실패')
      return
    }
    toast.success(isEdit ? '수정되었습니다.' : '공지가 등록되었습니다.')
    setShowModal(false)
    setEditTarget(null)
    fetchNotices()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 공지를 삭제하시겠습니까?')) return
    const res = await fetch(`/api/admin/notices?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('삭제되었습니다.')
      setNotices(prev => prev.filter(n => n.id !== id))
    } else {
      toast.error('삭제 실패')
    }
  }

  const handleTogglePin = async (notice: Notice) => {
    const res = await fetch('/api/admin/notices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: notice.id, pinned: !notice.pinned }),
    })
    if (res.ok) fetchNotices()
  }

  const filteredNotices = notices.filter(n => filter === 'all' || n.type === filter)

  const upcomingEvents = notices
    .filter(n => n.type === 'event' && n.event_date && n.event_date >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => (a.event_date ?? '').localeCompare(b.event_date ?? ''))
    .slice(0, 4)

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
        {/* 배경 장식 */}
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
          </div>
          <div className="text-right shrink-0 hidden sm:block">
            <div className="text-4xl font-bold tabular-nums leading-none">
              {now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </div>
            <p className="text-blue-200 text-xs mt-1">BBK 공간케어</p>
          </div>
        </div>

        {/* 요약 뱃지 */}
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

      {/* ── 2열 레이아웃: 공지 + 이벤트 ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 공지사항 (2/3) */}
        <div className="lg:col-span-2 flex flex-col gap-3">
          {/* 헤더 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-gray-900">공지사항</h2>
              {notices.length > 0 && (
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{notices.length}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* 필터 탭 */}
              <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs">
                {(['all', 'notice', 'event'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 font-medium transition-colors ${filter === f ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                    {f === 'all' ? '전체' : f === 'notice' ? '📢 공지' : '🎉 행사'}
                  </button>
                ))}
              </div>
              {isAdmin && (
                <button
                  onClick={() => { setEditTarget(null); setShowModal(true) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                >
                  + 작성
                </button>
              )}
            </div>
          </div>

          {/* 목록 */}
          {loading ? (
            <div className="py-12 text-center text-gray-400 text-sm">불러오는 중...</div>
          ) : filteredNotices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-dashed border-gray-200 text-center gap-2">
              <span className="text-4xl">📋</span>
              <p className="text-gray-400 text-sm">
                {filter === 'all' ? '등록된 공지사항이 없습니다.' : filter === 'notice' ? '공지사항이 없습니다.' : '행사 정보가 없습니다.'}
              </p>
              {isAdmin && (
                <button onClick={() => { setEditTarget(null); setShowModal(true) }}
                  className="mt-1 text-xs text-blue-600 hover:underline">
                  첫 공지 작성하기
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredNotices.map(n => (
                <NoticeCard
                  key={n.id}
                  notice={n}
                  isAdmin={isAdmin}
                  onEdit={(notice) => { setEditTarget(notice); setShowModal(true) }}
                  onDelete={handleDelete}
                  onTogglePin={handleTogglePin}
                />
              ))}
            </div>
          )}
        </div>

        {/* 사이드 패널 (1/3) */}
        <div className="flex flex-col gap-4">

          {/* 다가오는 행사 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">🗓 다가오는 행사</h3>
              <span className="text-xs text-gray-400">{upcomingEvents.length}건</span>
            </div>
            {upcomingEvents.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-400 text-xs">예정된 행사가 없습니다.</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {upcomingEvents.map(ev => {
                  const daysLeft = ev.event_date
                    ? Math.ceil((new Date(ev.event_date).getTime() - Date.now()) / 86400000)
                    : null
                  return (
                    <div key={ev.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="w-10 h-10 shrink-0 rounded-xl bg-purple-100 flex flex-col items-center justify-center text-purple-700">
                        <span className="text-xs font-bold leading-none">
                          {ev.event_date ? new Date(ev.event_date).toLocaleDateString('ko-KR', { month: 'short' }) : ''}
                        </span>
                        <span className="text-base font-extrabold leading-none">
                          {ev.event_date ? new Date(ev.event_date).getDate() : ''}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-900 truncate">{ev.title}</p>
                        {daysLeft !== null && (
                          <p className={`text-xs mt-0.5 font-medium ${daysLeft === 0 ? 'text-red-500' : daysLeft <= 3 ? 'text-orange-500' : 'text-gray-400'}`}>
                            {daysLeft === 0 ? '오늘!' : daysLeft === 1 ? '내일' : `D-${daysLeft}`}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── 모달 ──────────────────────────────────────────────── */}
      {showModal && (
        <NoticeModal
          initial={editTarget}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditTarget(null) }}
        />
      )}
    </div>
  )
}
