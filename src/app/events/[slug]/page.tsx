'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

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
  description: string | null
  benefits: Benefit[]
  cta_label: string
  cta_type: 'kakao' | 'phone' | 'form' | 'url'
  cta_value: string | null
  accent_from: string
  accent_to: string
}

const BADGE_STYLE: Record<string, string> = {
  red:    'bg-red-500 text-white',
  orange: 'bg-orange-500 text-white',
  brand:  'bg-[#1e8fc0] text-white',
  green:  'bg-emerald-500 text-white',
}

function dDay(endDate: string | null): { label: string; urgent: boolean } | null {
  if (!endDate) return null
  const diff = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000)
  if (diff < 0) return { label: '종료', urgent: false }
  if (diff === 0) return { label: 'D-Day', urgent: true }
  return { label: `D-${diff}`, urgent: diff <= 7 }
}

function renderDescription(text: string) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('## ')) return <h3 key={i} className="text-base font-bold text-gray-900 mt-5 mb-2">{line.slice(3)}</h3>
    if (line.startsWith('- ')) return <li key={i} className="text-sm text-gray-600 ml-4 mb-1 list-disc">{line.slice(2)}</li>
    if (line.trim() === '') return <div key={i} className="h-2" />
    return <p key={i} className="text-sm text-gray-600 leading-relaxed mb-1">{line}</p>
  })
}

export default function EventDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const [event, setEvent] = useState<BBKEvent | null>(null)
  const [related, setRelated] = useState<BBKEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`/api/events/${slug}`).then(r => r.json()),
      fetch('/api/events?status=active').then(r => r.json()),
    ]).then(([detail, all]) => {
      setEvent(detail.event ?? null)
      setRelated((all.events ?? []).filter((e: BBKEvent) => e.slug !== slug).slice(0, 2))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [slug])

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 pb-40 animate-pulse">
        <div className="h-52 bg-gray-200 rounded-2xl mt-5" />
        <div className="mt-5 space-y-3">
          <div className="h-7 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-100 rounded w-full" />
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="text-center py-32 text-gray-400">
        <p className="text-lg mb-4">이벤트를 찾을 수 없습니다.</p>
        <Link href="/events" className="text-[#1e8fc0] font-semibold hover:underline">← 이벤트 목록으로</Link>
      </div>
    )
  }

  const dd = dDay(event.end_date)
  const isEnded = event.status === 'ended'

  const ctaHref = event.cta_type === 'phone'
    ? `tel:${event.cta_value}`
    : (event.cta_value ?? 'https://pf.kakao.com/_bbkkorea')

  return (
    <div className="max-w-3xl mx-auto pb-40">
      {/* 뒤로가기 */}
      <div className="px-4 pt-4">
        <Link href="/events" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#1e8fc0] transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          이벤트 목록
        </Link>
      </div>

      {/* 썸네일 히어로 */}
      <div
        className="relative mt-3 mx-4 rounded-2xl overflow-hidden h-52 sm:h-64 flex items-end p-5"
        style={{ background: `linear-gradient(135deg, ${event.accent_from} 0%, ${event.accent_to} 100%)` }}
      >
        {event.thumbnail_url && (
          <img src={event.thumbnail_url} alt={event.title} className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 60%)' }} />
        <div className="relative z-10 w-full">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {event.badge_text && (
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${BADGE_STYLE[event.badge_color] ?? BADGE_STYLE.brand}`}>
                {event.badge_text}
              </span>
            )}
            {dd && (
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${dd.urgent ? 'bg-red-500 text-white animate-pulse' : 'bg-black/40 text-white backdrop-blur-sm'}`}>
                {dd.label}
              </span>
            )}
          </div>
          <h1 className="text-xl font-black text-white leading-tight drop-shadow">{event.title}</h1>
        </div>
      </div>

      <div className="px-4 mt-5 space-y-5">
        {/* 기간 + 부제 */}
        <div className="bg-white rounded-2xl p-4 shadow-soft border border-[#e8f6fc]">
          {event.subtitle && (
            <p className="text-sm text-gray-600 leading-relaxed mb-3">{event.subtitle}</p>
          )}
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {event.start_date?.replace(/-/g, '.')} ~ {event.end_date?.replace(/-/g, '.')}
            {isEnded && <span className="ml-2 text-red-400 font-semibold">종료된 이벤트</span>}
          </div>
        </div>

        {/* 혜택 목록 */}
        {event.benefits.length > 0 && (
          <div>
            <h2 className="text-base font-bold text-gray-900 mb-3">✅ 이벤트 혜택</h2>
            <div className="space-y-2.5">
              {event.benefits.map((b, i) => (
                <div key={i} className="flex items-start gap-3 bg-white rounded-xl p-3.5 shadow-soft border border-[#e8f6fc]">
                  <span className="text-2xl shrink-0 mt-0.5">{b.icon}</span>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{b.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 신청 방법 */}
        <div>
          <h2 className="text-base font-bold text-gray-900 mb-3">📋 신청 방법</h2>
          <div className="bg-white rounded-2xl p-4 shadow-soft border border-[#e8f6fc] space-y-3">
            {[
              { step: '01', text: '아래 버튼을 눌러 카카오톡 채널을 추가해주세요.' },
              { step: '02', text: '"이벤트 신청" 또는 원하시는 서비스를 메시지로 보내주세요.' },
              { step: '03', text: '담당자가 연락드려 일정과 견적을 안내해드립니다.' },
            ].map(s => (
              <div key={s.step} className="flex items-start gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-[#1e8fc0] text-white text-xs font-black flex items-center justify-center">{s.step}</span>
                <p className="text-sm text-gray-600 leading-relaxed pt-1">{s.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 상세 설명 */}
        {event.description && (
          <div>
            <h2 className="text-base font-bold text-gray-900 mb-3">📌 상세 안내</h2>
            <div className="bg-white rounded-2xl p-4 shadow-soft border border-[#e8f6fc]">
              {renderDescription(event.description)}
            </div>
          </div>
        )}

        {/* 관련 이벤트 */}
        {related.length > 0 && (
          <div>
            <h2 className="text-base font-bold text-gray-900 mb-3">🎁 다른 이벤트도 확인하세요</h2>
            <div className="space-y-3">
              {related.map(r => (
                <Link
                  key={r.id}
                  href={`/events/${r.slug}`}
                  className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-soft border border-[#e8f6fc] hover:border-[#1e8fc0] transition-colors group"
                >
                  <div
                    className="w-12 h-12 rounded-lg shrink-0"
                    style={{ background: `linear-gradient(135deg, ${r.accent_from}, ${r.accent_to})` }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate group-hover:text-[#1e8fc0] transition-colors">{r.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{r.end_date?.replace(/-/g, '.')} 까지</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-300 group-hover:text-[#1e8fc0] shrink-0 ml-auto transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 하단 고정 CTA (레이아웃 카카오 버튼 위에 추가) */}
      {!isEnded && (
        <div className="fixed bottom-16 left-0 right-0 z-30 px-4">
          <a
            href={ctaHref}
            target={event.cta_type !== 'phone' ? '_blank' : undefined}
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full max-w-3xl mx-auto py-3.5 rounded-xl font-bold text-white text-sm transition-all active:scale-[0.98] shadow-lg"
            style={{ background: `linear-gradient(135deg, ${event.accent_from}, ${event.accent_to})` }}
          >
            {event.cta_label}
          </a>
        </div>
      )}
    </div>
  )
}
