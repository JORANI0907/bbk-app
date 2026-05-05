'use client'

import type { ReactNode } from 'react'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { type LucideIcon, FileText, Crown, PenLine, Palette, BarChart2, Camera, Lightbulb, Calendar, Sparkles, Coffee, Image, ClipboardList } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AGENT_CONFIG, CONTENT_TYPE_META, type AgentKey } from '@/lib/marketing-agents'

const LUCIDE_ICON_MAP: Record<string, LucideIcon> = {
  Crown, PenLine, Palette, BarChart2, Camera, Lightbulb, Calendar, Sparkles, Coffee, Image,
}

function renderIcon(name: string, size = 16): ReactNode {
  const Icon = LUCIDE_ICON_MAP[name]
  return Icon ? <Icon size={size} /> : null
}

interface ContentItem {
  id: string
  agent: string
  content_type: string
  title: string
  region: string
  item: string
  char_count: number | null
  is_published: boolean
  created_at: string
}

export default function ContentHistoryPage() {
  const supabase = createClient()
  const [items, setItems] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [agentFilter, setAgentFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [publishFilter, setPublishFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [agentFilter, typeFilter, publishFilter])

  async function load() {
    setLoading(true)
    let q = supabase
      .from('marketing_content')
      .select('id,agent,content_type,title,region,item,char_count,is_published,created_at')
      .order('created_at', { ascending: false })
      .limit(100)

    if (agentFilter !== 'all') q = q.eq('agent', agentFilter)
    if (typeFilter !== 'all') q = q.eq('content_type', typeFilter)
    if (publishFilter === 'published') q = q.eq('is_published', true)
    if (publishFilter === 'unpublished') q = q.eq('is_published', false)

    const { data } = await q
    setItems(data ?? [])
    setLoading(false)
  }

  const filtered = items.filter(item =>
    search === '' ||
    item.title.includes(search) ||
    item.region.includes(search) ||
    item.item.includes(search)
  )

  // 날짜별 그룹핑 (KST 기준)
  const grouped = filtered.reduce<Record<string, ContentItem[]>>((acc, item) => {
    const kstDate = new Date(new Date(item.created_at).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    if (!acc[kstDate]) acc[kstDate] = []
    acc[kstDate].push(item)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">콘텐츠 이력</h1>
        <p className="text-sm text-gray-500 mt-0.5">생성된 모든 콘텐츠 목록</p>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="제목, 지역, 품목 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
        {/* 에이전트 필터 */}
        <div className="flex flex-wrap gap-1.5">
          {[{ val: 'all', label: '전체' }, { val: 'LEADER', label: 'LEADER' }, { val: 'MKT', label: 'MKT' }, { val: 'DSN', label: 'DSN' }, { val: 'STR', label: 'STR' }].map(a => (
            <button key={a.val} onClick={() => setAgentFilter(a.val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${agentFilter === a.val ? 'bg-gray-800 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'}`}>
              {a.label}
            </button>
          ))}
        </div>
        {/* 타입 필터 */}
        <div className="flex flex-wrap gap-1.5">
          {['all', 'blog', 'insta', 'insta_tips', 'insta_service', 'insta_lifestyle', 'insta_beforeafter', 'insta_event', 'thumbnail', 'image_prompt', 'weekly_calendar', 'monthly_report', 'keyword_strategy'].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${typeFilter === t ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'}`}>
              {t === 'all' ? '전체 타입' : <>{CONTENT_TYPE_META[t]?.icon ? renderIcon(CONTENT_TYPE_META[t].icon, 12) : null}{' '}{CONTENT_TYPE_META[t]?.label ?? t}</>}
            </button>
          ))}
        </div>
        {/* 발행 필터 */}
        <div className="flex gap-1.5">
          {[{ val: 'all', label: '전체' }, { val: 'published', label: '발행완료' }, { val: 'unpublished', label: '미발행' }].map(f => (
            <button key={f.val} onClick={() => setPublishFilter(f.val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${publishFilter === f.val ? 'bg-gray-800 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100">
          <ClipboardList size={40} className="text-gray-300 mb-3" />
          <p className="text-gray-500">조건에 맞는 콘텐츠가 없어요</p>
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
                  <span className="text-xs text-gray-400">{dateItems.length}개</span>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  {dateItems.map((item, idx) => {
                    const meta = CONTENT_TYPE_META[item.content_type] ?? { label: item.content_type, icon: '', agent: 'MKT' as AgentKey }
                    const agentCfg = AGENT_CONFIG[item.agent as AgentKey] ?? AGENT_CONFIG.MKT
                    return (
                      <Link
                        key={item.id}
                        href={`/admin/marketing/content/${item.id}`}
                        className={`flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors ${idx > 0 ? 'border-t border-gray-50' : ''}`}
                      >
                        <span className="flex items-center">{meta.icon ? renderIcon(meta.icon, 20) : <FileText size={20} />}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{item.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {item.region && item.item ? `${item.region} · ${item.item}` : meta.label}
                            {item.char_count ? ` · ${item.char_count.toLocaleString()}자` : ''}
                          </p>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${agentCfg.badgeClass}`}>
                          {renderIcon(agentCfg.icon, 12)} {agentCfg.label}
                        </span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                          item.is_published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {item.is_published ? '발행완료' : '미발행'}
                        </span>
                        <span className="text-gray-300 text-sm">›</span>
                      </Link>
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
