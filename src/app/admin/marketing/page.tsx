'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────

interface MarketingStats {
  month: string
  blog_count: number
  insta_count: number
  blog_target: number
  insta_target: number
}

interface TodayRun {
  id: string
  run_date: string
  status: string
  region: string | null
  item: string | null
  trigger_type: string
  started_at: string | null
  finished_at: string | null
  duration_sec: number | null
}

interface TodayContent {
  id: string
  content_type: string
  title: string
  region: string
  item: string
  is_published: boolean
}

interface UnusedKeyword {
  region: string
  item: string
}

interface WeeklyItem {
  run_date: string
  region: string | null
  item: string | null
  status: string
}

// ─── Helpers ──────────────────────────────────────────────────

function currentYM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function weekRange() {
  const d = new Date()
  const day = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return {
    from: monday.toISOString().slice(0, 10),
    to: sunday.toISOString().slice(0, 10),
  }
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
        <div
          className={`h-2.5 rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 mt-1.5">{pct}% 달성</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    success:  { label: '성공', cls: 'bg-green-100 text-green-700' },
    partial:  { label: '부분성공', cls: 'bg-yellow-100 text-yellow-700' },
    failed:   { label: '실패', cls: 'bg-red-100 text-red-700' },
    running:  { label: '실행중', cls: 'bg-blue-100 text-blue-700' },
    pending:  { label: '대기', cls: 'bg-gray-100 text-gray-500' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' }
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
}

// ─── Main Component ───────────────────────────────────────────

export default function MarketingDashboard() {
  const supabase = createClient()
  const [stats, setStats] = useState<MarketingStats | null>(null)
  const [todayRun, setTodayRun] = useState<TodayRun | null>(null)
  const [todayContents, setTodayContents] = useState<TodayContent[]>([])
  const [unusedKeywords, setUnusedKeywords] = useState<UnusedKeyword[]>([])
  const [weeklyRuns, setWeeklyRuns] = useState<WeeklyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    const ym = currentYM()
    const td = today()
    const { from, to } = weekRange()

    const [statsRes, runRes, contentsRes, keywordsRes, weeklyRes] = await Promise.all([
      supabase.from('marketing_stats').select('*').eq('month', ym).single(),
      supabase.from('marketing_runs').select('*').eq('run_date', td).order('created_at', { ascending: false }).limit(1).single(),
      supabase.from('marketing_content').select('id,content_type,title,region,item,is_published').gte('created_at', td).lt('created_at', td + 'T23:59:59'),
      supabase.from('marketing_keywords').select('region,item').eq('is_used', false).limit(5),
      supabase.from('marketing_runs').select('run_date,region,item,status').gte('run_date', from).lte('run_date', to).order('run_date'),
    ])

    setStats(statsRes.data ?? { month: ym, blog_count: 0, insta_count: 0, blog_target: 12, insta_target: 12 })
    setTodayRun(runRes.data ?? null)
    setTodayContents(contentsRes.data ?? [])
    setUnusedKeywords(keywordsRes.data ?? [])
    setWeeklyRuns(weeklyRes.data ?? [])
    setLoading(false)
  }

  async function handleTrigger() {
    setTriggering(true)
    try {
      const res = await fetch('/api/marketing/trigger', { method: 'POST' })
      if (res.ok) {
        setTimeout(loadAll, 2000)
      }
    } catch {
      // VPS 미연결 시 무시
    }
    setTriggering(false)
  }

  const blog = todayContents.find(c => c.content_type === 'blog')
  const insta = todayContents.find(c => c.content_type === 'insta')
  const image = todayContents.find(c => c.content_type === 'image_prompt')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">마케팅 대시보드</h1>
          <p className="text-sm text-gray-500 mt-0.5">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</p>
        </div>
        <button
          onClick={handleTrigger}
          disabled={triggering}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          {triggering ? (
            <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />생성 중...</>
          ) : (
            <><span>✨</span>지금 콘텐츠 생성</>
          )}
        </button>
      </div>

      {/* 이번 달 진행률 */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">이번 달 목표</h2>
        <div className="flex gap-4">
          <ProgressBar count={stats?.blog_count ?? 0} target={stats?.blog_target ?? 12} label="블로그" color="bg-brand-500" />
          <ProgressBar count={stats?.insta_count ?? 0} target={stats?.insta_target ?? 12} label="인스타그램" color="bg-pink-500" />
        </div>
      </div>

      {/* 오늘 콘텐츠 + 이번 주 + 미사용 키워드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* 오늘 콘텐츠 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">오늘 콘텐츠</h2>
            {todayRun && <StatusBadge status={todayRun.status} />}
          </div>
          {todayContents.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-3xl mb-2">📭</p>
              <p className="text-sm text-gray-400">아직 생성된 콘텐츠가 없어요</p>
              <p className="text-xs text-gray-300 mt-1">위 버튼으로 생성하거나<br/>오전 6시 자동 생성됩니다</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {[
                { key: 'blog', label: '블로그', icon: '📝', data: blog },
                { key: 'insta', label: '인스타', icon: '📸', data: insta },
                { key: 'image_prompt', label: '이미지', icon: '🎨', data: image },
              ].map(({ label, icon, data }) => (
                <div key={label} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <span className="text-lg">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-500">{label}</p>
                    {data ? (
                      <p className="text-sm font-medium text-gray-800 truncate">{data.region} {data.item}</p>
                    ) : (
                      <p className="text-sm text-gray-300">미생성</p>
                    )}
                  </div>
                  {data && (
                    data.is_published
                      ? <span className="text-xs text-green-600 font-semibold">발행완료</span>
                      : <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" />
                  )}
                </div>
              ))}
              <Link
                href="/admin/marketing/today"
                className="flex items-center justify-center gap-1.5 w-full mt-1 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition-colors"
              >
                자세히 보기 →
              </Link>
            </div>
          )}
        </div>

        {/* 이번 주 일정 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-4">이번 주 현황</h2>
          {weeklyRuns.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-3xl mb-2">📅</p>
              <p className="text-sm text-gray-400">이번 주 실행 내역이 없어요</p>
            </div>
          ) : (
            <div className="space-y-2">
              {weeklyRuns.map((r, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50">
                  <span className="text-xs font-bold text-gray-400 w-10 flex-shrink-0">
                    {new Date(r.run_date).toLocaleDateString('ko-KR', { weekday: 'short', month: 'numeric', day: 'numeric' })}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">
                      {r.region && r.item ? `${r.region} ${r.item}` : '—'}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>
          )}
          <Link href="/admin/marketing/calendar" className="flex items-center justify-center gap-1 w-full mt-3 py-2 text-sm text-brand-600 font-semibold hover:bg-brand-50 rounded-xl transition-colors">
            캘린더 보기 →
          </Link>
        </div>

        {/* 미사용 키워드 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-4">다음 추천 키워드</h2>
          {unusedKeywords.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">미사용 키워드가 없어요</p>
          ) : (
            <div className="space-y-2">
              {unusedKeywords.map((k, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl">
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
            전체 키워드 보기 →
          </Link>
        </div>
      </div>

      {/* 빠른 이동 */}
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
