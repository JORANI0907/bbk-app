'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AGENT_CONFIG } from '@/lib/marketing-agents'

interface TodayStats {
  agent: string
  count: number
}

export function MarketingAgentSummary() {
  const router = useRouter()
  const [stats, setStats] = useState<TodayStats[]>([])
  const [totalToday, setTotalToday] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    void supabase
      .from('marketing_contents')
      .select('agent')
      .gte('created_at', today.toISOString())
      .then(({ data }) => {
        if (!data) { setLoading(false); return }

        const counts: Record<string, number> = {}
        for (const row of data) {
          counts[row.agent] = (counts[row.agent] ?? 0) + 1
        }
        const result = Object.entries(counts).map(([agent, count]) => ({ agent, count }))
        setStats(result)
        setTotalToday(data.length)
        setLoading(false)
      })
  }, [])

  return (
    <div className="space-y-4">
      {/* 요약 배너 */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-bold text-amber-800">마케팅 AI 에이전트 팀</p>
            <p className="text-xs text-amber-600">LEADER · MKT · DSN · STR · INSTA</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-amber-700">{loading ? '—' : totalToday}</p>
            <p className="text-[10px] text-amber-600">오늘 생성</p>
          </div>
        </div>

        {/* 에이전트별 오늘 활동 */}
        <div className="grid grid-cols-4 gap-2">
          {Object.entries(AGENT_CONFIG).map(([key, cfg]) => {
            const found = stats.find(s => s.agent === key)
            return (
              <div key={key} className={`rounded-xl border p-2 text-center ${cfg.bgClass}`}>
                <p className="text-lg leading-none mb-1">{cfg.icon}</p>
                <p className={`text-[10px] font-bold ${cfg.textClass}`}>{cfg.label}</p>
                <p className={`text-base font-bold ${cfg.textClass}`}>{found?.count ?? 0}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* 바로가기 */}
      <div className="space-y-2">
        <button
          onClick={() => router.push('/admin/marketing')}
          className="w-full flex items-center justify-between px-4 py-3 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span>📣</span>
            <span className="text-sm font-semibold">마케팅 팀 대시보드</span>
          </div>
          <span className="text-sm opacity-80">→</span>
        </button>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '블로그', icon: '📝', path: '/admin/marketing/blog' },
            { label: '인스타', icon: '📸', path: '/admin/marketing/instagram' },
            { label: '썸네일', icon: '🖼', path: '/admin/marketing/content' },
          ].map(({ label, icon, path }) => (
            <button
              key={label}
              onClick={() => router.push(path)}
              className="flex flex-col items-center gap-1 py-3 bg-white border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <span className="text-xl">{icon}</span>
              <span className="text-xs text-gray-600 font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 마케팅 일정 안내 */}
      <div className="bg-white border border-gray-100 rounded-xl p-3">
        <p className="text-xs font-semibold text-gray-700 mb-2">📅 콘텐츠 발행 일정</p>
        <div className="space-y-1">
          {[
            { day: '월요일', content: '블로그 + 인스타 포스팅' },
            { day: '수요일', content: '블로그 + 인스타 포스팅' },
            { day: '금요일', content: '블로그 + 인스타 포스팅' },
          ].map(({ day, content }) => (
            <div key={day} className="flex items-center gap-2 text-xs">
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full w-14 text-center shrink-0">
                {day}
              </span>
              <span className="text-gray-500">{content}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
