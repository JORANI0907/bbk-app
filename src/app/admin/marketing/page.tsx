'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AGENT_CONFIG, AGENT_KEYS, CONTENT_TYPE_META, type AgentKey } from '@/lib/marketing-agents'

interface MarketingStats {
  month: string
  blog_count: number
  insta_count: number
  blog_target: number
  insta_target: number
}

interface RecentContent {
  id: string
  agent: string
  content_type: string
  title: string
  region: string
  item: string
  is_published: boolean
  created_at: string
}

interface UnusedKeyword {
  region: string
  item: string
}

function ProgressBar({ count, target, label, color }: { count: number; target: number; label: string; color: string }) {
  const pct = target > 0 ? Math.min(Math.round((count / target) * 100), 100) : 0
  return (
    <div className="flex-1 bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <span className="text-lg font-bold text-gray-900">{count}<span className="text-sm font-normal text-gray-400">/{target}</span></span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2.5 mt-2">
        <div className={`h-2.5 rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-400 mt-1.5">{pct}% 달성</p>
    </div>
  )
}

function currentYM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function MarketingDashboard() {
  const supabase = createClient()
  const [stats, setStats] = useState<MarketingStats | null>(null)
  const [recentAll, setRecentAll] = useState<RecentContent[]>([])
  const [unusedKeywords, setUnusedKeywords] = useState<UnusedKeyword[]>([])
  const [agentCounts, setAgentCounts] = useState<Record<AgentKey, number>>({ LEADER: 0, MKT: 0, DSN: 0, STR: 0 })
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const ym = currentYM()

    const [statsRes, recentRes, keywordsRes] = await Promise.all([
      supabase.from('marketing_stats').select('*').eq('month', ym).single(),
      supabase.from('marketing_content')
        .select('id, agent, content_type, title, region, item, is_published, created_at')
        .order('created_at', { ascending: false })
        .limit(15),
      supabase.from('marketing_keywords').select('region, item').eq('is_used', false).limit(5),
    ])

    setStats(statsRes.data ?? { month: ym, blog_count: 0, insta_count: 0, blog_target: 20, insta_target: 20 })

    const items: RecentContent[] = recentRes.data ?? []
    setRecentAll(items)

    // 에이전트별 총 카운트
    const counts = { LEADER: 0, MKT: 0, DSN: 0, STR: 0 }
    for (const item of items) {
      const a = item.agent as AgentKey
      if (a in counts) counts[a]++
    }
    setAgentCounts(counts)

    setUnusedKeywords(keywordsRes.data ?? [])
    setLoading(false)
  }

  async function handleTrigger() {
    setTriggering(true)
    try {
      const res = await fetch('/api/marketing/trigger', { method: 'POST' })
      if (res.ok) setTimeout(loadAll, 2000)
    } catch { /* VPS 미연결 시 무시 */ }
    setTriggering(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const todayItems = recentAll.filter(r => r.created_at.slice(0, 10) === today())

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">마케팅 팀 대시보드</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </p>
        </div>
        <button
          onClick={handleTrigger}
          disabled={triggering}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          {triggering
            ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />생성 중...</>
            : <><span>✨</span>지금 콘텐츠 생성</>}
        </button>
      </div>

      {/* 에이전트 팀 현황 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">에이전트 팀</h2>
          <Link href="/admin/marketing/team" className="text-xs text-brand-600 font-semibold hover:underline">
            조직도 보기 →
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {AGENT_KEYS.map(key => {
            const cfg = AGENT_CONFIG[key]
            const todayCount = todayItems.filter(r => r.agent === key).length
            return (
              <Link key={key} href={`/admin/marketing/team/${key}`}>
                <div className={`rounded-2xl border-2 ${cfg.bgClass} p-4 hover:shadow-md transition-shadow`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{cfg.icon}</span>
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{cfg.label}</p>
                      <p className="text-xs text-gray-400">{cfg.role}</p>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-xl font-bold ${cfg.textClass}`}>{agentCounts[key]}</span>
                    <span className="text-xs text-gray-400">총 산출물</span>
                  </div>
                  {todayCount > 0 && (
                    <p className="text-xs text-gray-500 mt-1">오늘 +{todayCount}편</p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* 이번 달 목표 + 최근 활동 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* 이번 달 목표 */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">이번 달 목표</h2>
          <div className="flex gap-3">
            <ProgressBar count={stats?.blog_count ?? 0} target={stats?.blog_target ?? 20} label="블로그" color="bg-brand-500" />
            <ProgressBar count={stats?.insta_count ?? 0} target={stats?.insta_target ?? 20} label="인스타그램" color="bg-pink-500" />
          </div>

          {/* 추천 키워드 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-gray-900 mb-3">다음 추천 키워드</h3>
            {unusedKeywords.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">미사용 키워드가 없어요</p>
            ) : (
              <div className="space-y-2">
                {unusedKeywords.map((k, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 bg-blue-50 rounded-xl">
                    <span className="text-sm font-bold text-blue-600 w-5">{i + 1}</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{k.region}</p>
                      <p className="text-xs text-gray-500">{k.item}</p>
                    </div>
                    <span className="ml-auto text-xs text-blue-400 font-medium">미사용</span>
                  </div>
                ))}
              </div>
            )}
            <Link href="/admin/marketing/keywords" className="flex items-center justify-center gap-1 w-full mt-3 py-2 text-sm text-brand-600 font-semibold hover:bg-brand-50 rounded-xl transition-colors">
              전체 키워드 →
            </Link>
          </div>
        </div>

        {/* 최근 활동 피드 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">최근 활동</h2>
            <Link href="/admin/marketing/content" className="text-xs text-brand-600 hover:underline">전체 보기</Link>
          </div>
          {recentAll.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">📭</p>
              <p className="text-sm text-gray-400">아직 생성된 산출물이 없어요</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentAll.slice(0, 10).map(item => {
                const cfg = AGENT_CONFIG[item.agent as AgentKey] ?? AGENT_CONFIG.MKT
                const meta = CONTENT_TYPE_META[item.content_type]
                return (
                  <div key={item.id} className="flex items-start gap-3">
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs ${cfg.badgeClass}`}>
                      {cfg.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 truncate">
                        <span className={`font-semibold ${cfg.textClass}`}>{cfg.label}</span>
                        {' '}{meta?.icon} {item.title}
                      </p>
                      <p className="text-xs text-gray-400">{item.created_at.slice(0, 10)}</p>
                    </div>
                    <span className={`flex-shrink-0 w-2 h-2 rounded-full mt-1.5 ${item.is_published ? 'bg-green-400' : 'bg-gray-300'}`} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 채널 성과 */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">채널 성과</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { href: '/admin/marketing/blog', icon: '📝', label: '블로그', sub: 'Naver VIEW' },
            { href: '/admin/marketing/instagram', icon: '📸', label: '인스타그램', sub: 'Reach & Save' },
            { href: '/admin/marketing/place', icon: '📍', label: '네이버 플레이스', sub: '리뷰 & 전화' },
          ].map(item => (
            <Link key={item.href} href={item.href} className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4 hover:shadow-md hover:border-brand-200 transition-all group">
              <span className="text-2xl">{item.icon}</span>
              <p className="font-semibold text-gray-800 mt-2 group-hover:text-brand-600 transition-colors">{item.label}</p>
              <p className="text-xs text-gray-400">{item.sub}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
