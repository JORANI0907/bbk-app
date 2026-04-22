'use client'

import { AGENT_DEFINITIONS } from '@/lib/agent-graph-data'

function formatRelativeTime(iso: string | null) {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금 전'
  if (mins < 60) return `${mins}분 전`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}시간 전`
  return `${Math.floor(hrs / 24)}일 전`
}

interface AgentStatusGridProps {
  activeSessions: Set<string>
  todayCounts: Record<string, number>
  lastActiveTimes: Record<string, string>
  onAgentClick?: (agentId: string) => void
}

export function AgentStatusGrid({
  activeSessions,
  todayCounts,
  lastActiveTimes,
  onAgentClick,
}: AgentStatusGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {AGENT_DEFINITIONS.map((agent) => {
        const isActive = activeSessions.has(agent.agentId)
        const count = todayCounts[agent.agentId] ?? 0
        const lastTime = lastActiveTimes[agent.agentId] ?? null
        const relTime = formatRelativeTime(lastTime)

        return (
          <button
            key={agent.agentId}
            onClick={() => onAgentClick?.(agent.agentId)}
            className={`
              text-left bg-white rounded-xl border p-3 transition-all hover:shadow-sm active:scale-[0.98]
              ${isActive ? 'border-green-300 bg-green-50' : 'border-gray-100'}
            `}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-lg leading-none">{agent.icon}</span>
              <span className="text-xs font-bold text-gray-900 truncate flex-1">{agent.displayName}</span>
              {isActive ? (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-[10px] font-semibold text-green-600">활성</span>
                </span>
              ) : (
                <span className="text-[10px] text-gray-400">유휴</span>
              )}
            </div>
            <p className="text-[10px] text-gray-500 truncate mb-2">{agent.role}</p>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400">
                오늘 <span className="font-bold text-violet-600">{count}</span>회
              </span>
              {relTime && (
                <span className="text-[10px] text-gray-400">{relTime}</span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
