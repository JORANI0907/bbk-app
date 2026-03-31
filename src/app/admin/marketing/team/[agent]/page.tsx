'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AGENT_CONFIG, CONTENT_TYPE_META, type AgentKey } from '@/lib/marketing-agents'

interface ContentItem {
  id: string
  content_type: string
  title: string
  body: string
  region: string
  item: string
  char_count: number | null
  is_published: boolean
  published_at: string | null
  created_at: string
}

const VALID_AGENTS: AgentKey[] = ['LEADER', 'MKT', 'DSN', 'STR']

export default function AgentDetailPage() {
  const params = useParams()
  const agentKey = (params?.agent as string)?.toUpperCase() as AgentKey

  if (!VALID_AGENTS.includes(agentKey)) notFound()

  const cfg = AGENT_CONFIG[agentKey]
  const supabase = createClient()

  const [items, setItems] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')
  const [publishFilter, setPublishFilter] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => { load() }, [typeFilter, publishFilter])

  async function load() {
    setLoading(true)
    let q = supabase
      .from('marketing_content')
      .select('*')
      .eq('agent', agentKey)
      .order('created_at', { ascending: false })

    if (typeFilter !== 'all') q = q.eq('content_type', typeFilter)
    if (publishFilter === 'published') q = q.eq('is_published', true)
    if (publishFilter === 'unpublished') q = q.eq('is_published', false)

    const { data } = await q
    setItems(data ?? [])
    setLoading(false)
  }

  // 이 에이전트의 content_type 목록
  const myTypes = cfg.contentTypes

  // 날짜별 그룹
  const grouped = items.reduce<Record<string, ContentItem[]>>((acc, item) => {
    const date = item.created_at.slice(0, 10)
    if (!acc[date]) acc[date] = []
    acc[date].push(item)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-4">
        <Link href="/admin/marketing/team" className="text-gray-400 hover:text-gray-600 transition-colors">
          ← 팀 조직도
        </Link>
      </div>

      {/* 에이전트 프로필 */}
      <div className={`rounded-2xl border-2 ${cfg.bgClass} p-6`}>
        <div className="flex items-start gap-4">
          <span className="text-5xl">{cfg.icon}</span>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{cfg.label}</h1>
              <span className={`text-sm font-semibold px-3 py-1 rounded-full ${cfg.badgeClass}`}>{cfg.role}</span>
            </div>
            <p className="text-gray-600 mt-1">{cfg.desc}</p>
            <div className="flex gap-6 mt-3">
              <div>
                <p className="text-xs text-gray-400">총 산출물</p>
                <p className={`text-2xl font-bold ${cfg.textClass}`}>{items.length}<span className="text-sm font-normal text-gray-400">편</span></p>
              </div>
              {items.filter(i => i.is_published).length > 0 && (
                <div>
                  <p className="text-xs text-gray-400">발행완료</p>
                  <p className="text-2xl font-bold text-green-600">{items.filter(i => i.is_published).length}<span className="text-sm font-normal text-gray-400">편</span></p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1.5">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${typeFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'}`}
          >전체</button>
          {myTypes.map(t => {
            const meta = CONTENT_TYPE_META[t]
            return (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${typeFilter === t ? 'bg-gray-800 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'}`}
              >
                {meta?.icon} {meta?.label ?? t}
              </button>
            )
          })}
        </div>
        <div className="flex gap-1.5">
          {[
            { val: 'all', label: '전체' },
            { val: 'published', label: '✅ 발행완료' },
            { val: 'unpublished', label: '⬜ 미발행' },
          ].map(f => (
            <button
              key={f.val}
              onClick={() => setPublishFilter(f.val)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${publishFilter === f.val ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* 콘텐츠 목록 */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-gray-500">산출물이 없어요</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, dateItems]) => (
              <div key={date}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-sm font-bold text-gray-500">
                    {new Date(date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
                  </span>
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-xs text-gray-400">{dateItems.length}편</span>
                </div>
                <div className="space-y-2">
                  {dateItems.map(item => {
                    const meta = CONTENT_TYPE_META[item.content_type]
                    const isExpanded = expanded === item.id
                    return (
                      <div key={item.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                        <button
                          onClick={() => setExpanded(isExpanded ? null : item.id)}
                          className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                        >
                          <span className="text-xl flex-shrink-0">{meta?.icon ?? '📄'}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{item.title}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {meta?.label}
                              {item.region && item.item ? ` · ${item.region} ${item.item}` : ''}
                              {item.char_count ? ` · ${item.char_count.toLocaleString()}자` : ''}
                            </p>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${item.is_published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                            {item.is_published ? '발행완료' : '미발행'}
                          </span>
                          <span className="text-gray-400 text-sm flex-shrink-0">{isExpanded ? '▲' : '▼'}</span>
                        </button>

                        {isExpanded && (
                          <div className="px-5 pb-5 border-t border-gray-50">
                            <div className="mt-4 bg-gray-50 rounded-xl p-4 max-h-96 overflow-y-auto">
                              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{item.body}</pre>
                            </div>
                            {item.published_at && (
                              <p className="text-xs text-gray-400 mt-2">발행일: {item.published_at.slice(0, 10)}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
