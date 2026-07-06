'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Benefit {
  icon: string
  title: string
  desc: string
}

interface BBKEvent {
  id: string
  slug: string
  title: string
  subtitle: string | null
  thumbnail_url: string | null
  badge_text: string | null
  badge_color: string
  start_date: string | null
  end_date: string | null
  status: 'upcoming' | 'active' | 'ended'
  benefits: Benefit[]
  cta_label: string
  accent_from: string
  accent_to: string
  is_featured: boolean
}

const BADGE_STYLE: Record<string, string> = {
  red:    'bg-red-500 text-white',
  orange: 'bg-orange-500 text-white',
  brand:  'bg-[#1e8fc0] text-white',
  green:  'bg-emerald-500 text-white',
}

const STATUS_TABS = [
  { key: 'all',      label: '전체' },
  { key: 'active',   label: '진행중' },
  { key: 'upcoming', label: '예정' },
  { key: 'ended',    label: '종료' },
] as const

function dDay(endDate: string | null): string | null {
  if (!endDate) return null
  const diff = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000)
  if (diff < 0) return '종료'
  if (diff === 0) return 'D-Day'
  return `D-${diff}`
}

function formatDate(d: string | null) {
  if (!d) return ''
  return d.replace(/-/g, '.').slice(2)
}

function EventCard({ event }: { event: BBKEvent }) {
  const dd = dDay(event.end_date)
  const isEnded = event.status === 'ended'
  const isUrgent = dd && !isEnded && parseInt(dd.replace('D-', '')) <= 7

  return (
    <Link
      href={`/events/${event.slug}`}
      className={`block group rounded-2xl overflow-hidden shadow-soft hover:shadow-card active:scale-[0.99] transition-all border border-white/60 ${isEnded ? 'opacity-60' : ''}`}
    >
      {/* 썸네일 영역 */}
      <div
        className="relative h-36 sm:h-44 flex items-end p-4"
        style={{ background: `linear-gradient(135deg, ${event.accent_from} 0%, ${event.accent_to} 100%)` }}
      >
        {event.thumbnail_url ? (
          <img
            src={event.thumbnail_url}
            alt={event.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-3 right-5 w-28 h-28 rounded-full bg-white/30" />
            <div className="absolute bottom-0 left-8 w-20 h-20 rounded-full bg-white/20" />
          </div>
        )}

        {/* 배지들 */}
        <div className="relative z-10 flex items-center gap-2 flex-wrap">
          {event.badge_text && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${BADGE_STYLE[event.badge_color] ?? BADGE_STYLE.brand}`}>
              {event.badge_text}
            </span>
          )}
          {dd && !isEnded && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${isUrgent ? 'bg-red-500 text-white animate-pulse' : 'bg-black/30 text-white backdrop-blur-sm'}`}>
              {dd}
            </span>
          )}
        </div>
      </div>

      {/* 텍스트 영역 */}
      <div className="bg-white px-4 py-4">
        <h2 className="text-base font-bold text-gray-900 leading-snug group-hover:text-[#1e8fc0] transition-colors">
          {event.title}
        </h2>
        {event.subtitle && (
          <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-2">{event.subtitle}</p>
        )}

        {/* 혜택 미리보기 */}
        {event.benefits.length > 0 && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {event.benefits.slice(0, 3).map((b, i) => (
              <span key={i} className="flex items-center gap-1 text-[11px] text-gray-600 bg-[#f0f7fb] px-2 py-1 rounded-full">
                <span>{b.icon}</span>
                <span className="font-medium">{b.title}</span>
              </span>
            ))}
          </div>
        )}

        {/* 하단: 기간 + CTA */}
        <div className="flex items-center justify-between mt-4">
          <span className="text-[11px] text-gray-400">
            {formatDate(event.start_date)} ~ {formatDate(event.end_date)}
          </span>
          <span className="text-xs font-bold text-[#1e8fc0] group-hover:translate-x-0.5 transition-transform">
            {isEnded ? '종료된 이벤트' : `${event.cta_label} →`}
          </span>
        </div>
      </div>
    </Link>
  )
}

export default function EventsPage() {
  const [events, setEvents] = useState<BBKEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all' | 'active' | 'upcoming' | 'ended'>('all')

  useEffect(() => {
    fetch('/api/events')
      .then(r => r.json())
      .then(d => setEvents(d.events ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const featured = events.find(e => e.is_featured && e.status === 'active')
  const filtered = tab === 'all' ? events : events.filter(e => e.status === tab)

  return (
    <div className="max-w-3xl mx-auto px-4 pb-28">
      {/* 히어로 섹션 */}
      <div
        className="rounded-2xl mt-5 mb-6 px-6 py-8 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1e8fc0 0%, #0f5474 100%)' }}
      >
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-white/5 -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-white/5 translate-y-1/3 -translate-x-1/4" />
        <div className="relative z-10">
          <p className="text-[#c7eaf7] text-xs font-semibold tracking-widest uppercase mb-2">BBK 혜택 센터</p>
          <h1 className="text-2xl font-black leading-tight mb-2">
            지금이 가장<br />좋은 조건입니다
          </h1>
          <p className="text-[#96d8f1] text-sm leading-relaxed">
            범빌드코리아만의 특별 이벤트로<br />더 합리적인 공간케어를 경험하세요.
          </p>
          {featured && (
            <Link
              href={`/events/${featured.slug}`}
              className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-white text-[#1e8fc0] rounded-xl text-sm font-bold hover:bg-[#e8f6fc] transition-colors"
            >
              {featured.badge_text && <span>🔥</span>}
              지금 바로 확인하기 →
            </Link>
          )}
        </div>
      </div>

      {/* 필터 탭 */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1 scrollbar-hide">
        {STATUS_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
              tab === t.key
                ? 'bg-[#1e8fc0] text-white shadow-sm'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-[#1e8fc0] hover:text-[#1e8fc0]'
            }`}
          >
            {t.label}
            {t.key === 'active' && events.filter(e => e.status === 'active').length > 0 && (
              <span className="ml-1.5 bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[9px]">
                {events.filter(e => e.status === 'active').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 이벤트 리스트 */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-2xl overflow-hidden bg-white shadow-soft animate-pulse">
              <div className="h-36 bg-gray-100" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-gray-100 rounded w-2/3" />
                <div className="h-3 bg-gray-100 rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">
          해당하는 이벤트가 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(event => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}
