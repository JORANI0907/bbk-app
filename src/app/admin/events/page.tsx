'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'

interface BBKEvent {
  id: string
  slug: string
  title: string
  badge_text: string | null
  start_date: string | null
  end_date: string | null
  status: 'upcoming' | 'active' | 'ended'
  is_featured: boolean
  sort_order: number
  accent_from: string
  accent_to: string
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  upcoming: { label: '예정', cls: 'bg-blue-100 text-blue-700' },
  active:   { label: '진행중', cls: 'bg-green-100 text-green-700' },
  ended:    { label: '종료', cls: 'bg-gray-100 text-gray-500' },
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<BBKEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchEvents = () => {
    setLoading(true)
    fetch('/api/events')
      .then(r => r.json())
      .then(d => setEvents(d.events ?? []))
      .catch(() => toast.error('불러오기 실패'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchEvents() }, [])

  const handleStatusChange = async (slug: string, status: string) => {
    try {
      const res = await fetch(`/api/events/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      toast.success('상태 변경 완료')
      fetchEvents()
    } catch {
      toast.error('변경 실패')
    }
  }

  const handleDelete = async (slug: string, title: string) => {
    if (!confirm(`"${title}" 이벤트를 삭제할까요?`)) return
    setDeleting(slug)
    try {
      const res = await fetch(`/api/events/${slug}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('삭제 완료')
      fetchEvents()
    } catch {
      toast.error('삭제 실패')
    } finally {
      setDeleting(null) }
  }

  const handleFeatureToggle = async (slug: string, current: boolean) => {
    try {
      const res = await fetch(`/api/events/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_featured: !current }),
      })
      if (!res.ok) throw new Error()
      toast.success(current ? '히어로 해제' : '히어로 설정')
      fetchEvents()
    } catch {
      toast.error('변경 실패')
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">이벤트 관리</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            <Link href="/events" target="_blank" className="text-brand-600 hover:underline">
              /events ↗
            </Link>
            {' '}에서 공개 노출됩니다.
          </p>
        </div>
        <Link
          href="/admin/events/new"
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-bold hover:bg-brand-700 transition-colors"
        >
          + 새 이벤트
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-surface-sunken rounded-xl animate-pulse" />)}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-20 text-text-tertiary">
          <p className="mb-4">이벤트가 없습니다.</p>
          <Link href="/admin/events/new" className="text-brand-600 font-semibold hover:underline">첫 이벤트 만들기 →</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map(event => {
            const s = STATUS_LABEL[event.status]
            return (
              <div key={event.id} className="bg-surface rounded-2xl border border-border shadow-soft p-4">
                <div className="flex items-start gap-3">
                  {/* 색상 미리보기 */}
                  <div
                    className="w-10 h-10 rounded-xl shrink-0"
                    style={{ background: `linear-gradient(135deg, ${event.accent_from}, ${event.accent_to})` }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
                      {event.is_featured && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">★ 히어로</span>
                      )}
                      {event.badge_text && (
                        <span className="text-xs text-text-tertiary">#{event.badge_text}</span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-text-primary mt-1 truncate">{event.title}</p>
                    <p className="text-xs text-text-tertiary mt-0.5">
                      {event.start_date} ~ {event.end_date} · 순서 {event.sort_order}
                    </p>
                  </div>

                  {/* 액션 */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    <select
                      value={event.status}
                      onChange={e => handleStatusChange(event.slug, e.target.value)}
                      className="text-xs border border-border rounded-lg px-2 py-1 bg-surface focus:outline-none"
                    >
                      <option value="upcoming">예정</option>
                      <option value="active">진행중</option>
                      <option value="ended">종료</option>
                    </select>
                    <button
                      onClick={() => handleFeatureToggle(event.slug, event.is_featured)}
                      className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                        event.is_featured
                          ? 'bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100'
                          : 'border-border text-text-tertiary hover:border-yellow-300 hover:text-yellow-600'
                      }`}
                    >
                      {event.is_featured ? '★ 히어로' : '☆ 히어로'}
                    </button>
                    <Link
                      href={`/admin/events/${event.id}`}
                      className="text-xs px-2 py-1 rounded-lg border border-border text-text-secondary hover:border-brand-400 hover:text-brand-600 transition-colors"
                    >
                      수정
                    </Link>
                    <button
                      onClick={() => handleDelete(event.slug, event.title)}
                      disabled={deleting === event.slug}
                      className="text-xs px-2 py-1 rounded-lg border border-border text-red-400 hover:border-red-300 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {deleting === event.slug ? '...' : '삭제'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
