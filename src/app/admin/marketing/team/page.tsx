'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AGENT_CONFIG, AGENT_KEYS, CONTENT_TYPE_META, type AgentKey } from '@/lib/marketing-agents'

interface AgentStat {
  agent: string
  count: number
  last_date: string | null
}

interface RecentItem {
  id: string
  agent: string
  content_type: string
  title: string
  region: string
  item: string
  created_at: string
  is_published: boolean
}

export default function TeamPage() {
  const supabase = createClient()
  const [stats, setStats] = useState<Record<AgentKey, { count: number; lastDate: string | null }>>({
    LEADER: { count: 0, lastDate: null },
    MKT:    { count: 0, lastDate: null },
    DSN:    { count: 0, lastDate: null },
    STR:    { count: 0, lastDate: null },
  })
  const [recent, setRecent] = useState<RecentItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [contentRes, recentRes] = await Promise.all([
      supabase.from('marketing_content').select('agent, created_at'),
      supabase.from('marketing_content')
        .select('id, agent, content_type, title, region, item, created_at, is_published')
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    // 에이전트별 집계
    const agg: Record<string, { count: number; lastDate: string | null }> = {
      LEADER: { count: 0, lastDate: null },
      MKT:    { count: 0, lastDate: null },
      DSN:    { count: 0, lastDate: null },
      STR:    { count: 0, lastDate: null },
    }
    for (const row of contentRes.data ?? []) {
      const a = row.agent as AgentKey
      if (!agg[a]) continue
      agg[a].count++
      if (!agg[a].lastDate || row.created_at > agg[a].lastDate!) {
        agg[a].lastDate = row.created_at
      }
    }
    setStats(agg as typeof stats)
    setRecent(recentRes.data ?? [])
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">팀 조직도</h1>
        <p className="text-sm text-gray-500 mt-0.5">마케팅 에이전트 팀 구조 및 각 팀원의 산출물 이력</p>
      </div>

      {/* 조직도 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-6">조직도</h2>

        {/* LEADER */}
        <div className="flex justify-center mb-4">
          <AgentCard agentKey="LEADER" stat={stats.LEADER} large />
        </div>

        {/* 연결선 */}
        <div className="flex justify-center mb-4">
          <div className="w-px h-6 bg-gray-200" />
        </div>
        <div className="relative flex justify-center mb-4">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[56%] h-px bg-gray-200" />
          <div className="flex gap-16">
            <div className="w-px h-6 bg-gray-200 mt-0" />
            <div className="w-px h-6 bg-gray-200 mt-0" />
            <div className="w-px h-6 bg-gray-200 mt-0" />
          </div>
        </div>

        {/* MKT / DSN / STR */}
        <div className="grid grid-cols-3 gap-4">
          {(['MKT', 'DSN', 'STR'] as AgentKey[]).map(key => (
            <AgentCard key={key} agentKey={key} stat={stats[key]} />
          ))}
        </div>
      </div>

      {/* 에이전트별 상세 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {AGENT_KEYS.map(key => {
          const cfg = AGENT_CONFIG[key]
          const agentItems = recent.filter(r => r.agent === key)
          return (
            <div key={key} className={`rounded-2xl border-2 ${cfg.bgClass} p-5`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{cfg.icon}</span>
                  <div>
                    <p className="font-bold text-gray-900">{cfg.label}</p>
                    <p className="text-xs text-gray-500">{cfg.role}</p>
                  </div>
                </div>
                <Link
                  href={`/admin/marketing/team/${key}`}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${cfg.badgeClass} hover:opacity-80 transition-opacity`}
                >
                  전체 이력 →
                </Link>
              </div>

              {agentItems.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">아직 산출물이 없어요</p>
              ) : (
                <div className="space-y-2">
                  {agentItems.slice(0, 4).map(item => {
                    const meta = CONTENT_TYPE_META[item.content_type]
                    return (
                      <div key={item.id} className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5">
                        <span className="text-base flex-shrink-0">{meta?.icon ?? '📄'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{item.title}</p>
                          <p className="text-xs text-gray-400">
                            {meta?.label} · {item.created_at.slice(0, 10)}
                          </p>
                        </div>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.is_published ? 'bg-green-400' : 'bg-gray-300'}`} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 전체 최근 활동 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-900 mb-4">최근 활동 타임라인</h2>
        <div className="space-y-3">
          {recent.map(item => {
            const cfg = AGENT_CONFIG[item.agent as AgentKey] ?? AGENT_CONFIG.MKT
            const meta = CONTENT_TYPE_META[item.content_type]
            return (
              <div key={item.id} className="flex items-start gap-4">
                <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm ${cfg.badgeClass}`}>
                  {cfg.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">
                    <span className={`font-bold ${cfg.textClass}`}>{cfg.label}</span>
                    {' — '}{meta?.icon} {item.title}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {meta?.label} · {item.region && item.item ? `${item.region} ${item.item} · ` : ''}
                    {item.created_at.slice(0, 10)}
                  </p>
                </div>
                <span className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  item.is_published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                }`}>
                  {item.is_published ? '발행완료' : '미발행'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function AgentCard({
  agentKey,
  stat,
  large = false,
}: {
  agentKey: AgentKey
  stat: { count: number; lastDate: string | null }
  large?: boolean
}) {
  const cfg = AGENT_CONFIG[agentKey]
  return (
    <Link href={`/admin/marketing/team/${agentKey}`}>
      <div className={`rounded-2xl border-2 ${cfg.bgClass} ${large ? 'px-8 py-5' : 'px-5 py-4'} hover:shadow-md transition-shadow cursor-pointer text-center`}>
        <span className={large ? 'text-4xl' : 'text-3xl'}>{cfg.icon}</span>
        <p className={`font-bold text-gray-900 mt-2 ${large ? 'text-lg' : 'text-base'}`}>{cfg.label}</p>
        <p className="text-xs text-gray-500">{cfg.role}</p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <span className={`text-xl font-bold ${cfg.textClass}`}>{stat.count}</span>
          <span className="text-xs text-gray-400">편</span>
        </div>
        {stat.lastDate && (
          <p className="text-xs text-gray-400 mt-1">
            마지막 활동: {stat.lastDate.slice(0, 10)}
          </p>
        )}
      </div>
    </Link>
  )
}
