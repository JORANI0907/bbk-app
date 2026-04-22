'use client'

import dynamic from 'next/dynamic'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAgentActivity } from '@/hooks/useAgentActivity'
import { AgentActivityFeed } from '@/components/admin/automation/AgentActivityFeed'
import { AgentStatusGrid } from '@/components/admin/automation/AgentStatusGrid'

// react-flow는 SSR 미지원 → dynamic import
const AgentGraph = dynamic(
  () => import('@/components/admin/automation/AgentGraph').then(m => m.AgentGraph),
  { ssr: false, loading: () => (
    <div className="w-full h-[420px] rounded-2xl border border-gray-200 bg-gray-50 flex items-center justify-center">
      <div className="text-center text-gray-400">
        <p className="text-3xl mb-2">🔄</p>
        <p className="text-sm">그래프 로딩 중...</p>
      </div>
    </div>
  )},
)

type ViewTab = 'graph' | 'feed'

export default function AgentsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<ViewTab>('graph')
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)

  const { recentLogs, activeSessions, todayCounts, isConnected } = useAgentActivity()

  // 마지막 활동 시간 집계
  const lastActiveTimes = useMemo(() => {
    const times: Record<string, string> = {}
    for (const log of recentLogs) {
      if (log.agent_type && !times[log.agent_type]) {
        times[log.agent_type] = log.created_at
      }
    }
    return times
  }, [recentLogs])

  const activeCount = activeSessions.size
  const todayTotal = Object.values(todayCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 shrink-0">
        <button
          onClick={() => router.back()}
          className="w-8 h-8 flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
          aria-label="뒤로"
        >
          ←
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-900">에이전트 현황</h1>
          <p className="text-xs text-gray-400 mt-0.5">Claude Code 에이전트 구성 및 실시간 활동</p>
        </div>
      </div>

      {/* 통계 배너 */}
      <div className="px-4 pb-3 shrink-0">
        <div className="bg-violet-50 rounded-xl p-4 grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-violet-600 font-medium">총 에이전트</p>
            <p className="text-xl font-bold text-violet-700">10개</p>
          </div>
          <div>
            <p className="text-xs text-green-600 font-medium">현재 활성</p>
            <p className="text-xl font-bold text-green-700">{activeCount}개</p>
          </div>
          <div>
            <p className="text-xs text-blue-600 font-medium">오늘 실행</p>
            <p className="text-xl font-bold text-blue-700">{todayTotal}회</p>
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="px-4 pb-2 shrink-0">
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          <button
            onClick={() => setActiveTab('graph')}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
              activeTab === 'graph' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            🗺 관계도 · 상태
          </button>
          <button
            onClick={() => setActiveTab('feed')}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors relative ${
              activeTab === 'feed' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            ⚡ 실시간 활동
            {activeCount > 0 && (
              <span className="absolute top-1.5 right-2 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">

        {activeTab === 'graph' && (
          <>
            {/* 에이전트 관계 그래프 */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">에이전트 관계도</p>
              <AgentGraph
                activeSessions={activeSessions}
                todayCounts={todayCounts}
                onNodeClick={setSelectedAgent}
              />
              {selectedAgent && (
                <div className="mt-2 px-3 py-2 bg-violet-50 border border-violet-100 rounded-xl text-xs text-violet-700">
                  선택: <strong>{selectedAgent}</strong>
                </div>
              )}
            </div>

            {/* 에이전트 상태 카드 */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">에이전트 상태</p>
              <AgentStatusGrid
                activeSessions={activeSessions}
                todayCounts={todayCounts}
                lastActiveTimes={lastActiveTimes}
                onAgentClick={setSelectedAgent}
              />
            </div>
          </>
        )}

        {activeTab === 'feed' && (
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">실시간 활동 피드</p>
            <AgentActivityFeed logs={recentLogs} isConnected={isConnected} />
          </div>
        )}
      </div>
    </div>
  )
}
