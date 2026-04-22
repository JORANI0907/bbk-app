'use client'

import type { AgentLog } from '@/hooks/useAgentActivity'

const EVENT_STYLE: Record<string, { label: string; badge: string; dot: string }> = {
  SubagentStart: { label: '에이전트 시작',  badge: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  SubagentStop:  { label: '에이전트 완료',  badge: 'bg-gray-100 text-gray-500',    dot: 'bg-gray-400'  },
  Stop:          { label: '세션 완료',      badge: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-400'  },
  StopFailure:   { label: '오류 발생',      badge: 'bg-red-100 text-red-700',      dot: 'bg-red-500'   },
  SessionStart:  { label: '세션 시작',      badge: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500' },
  SessionEnd:    { label: '세션 종료',      badge: 'bg-gray-100 text-gray-400',    dot: 'bg-gray-300'  },
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ko-KR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

interface AgentActivityFeedProps {
  logs: AgentLog[]
  isConnected: boolean
}

export function AgentActivityFeed({ logs, isConnected }: AgentActivityFeedProps) {
  return (
    <div className="flex flex-col gap-2">
      {/* 연결 상태 */}
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}
        />
        <span className="text-xs text-gray-500">
          {isConnected ? 'Realtime 연결됨' : '연결 중...'}
        </span>
      </div>

      {/* 피드 */}
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {logs.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            <p className="text-2xl mb-2">🤖</p>
            <p>에이전트 활동을 기다리는 중...</p>
            <p className="text-xs mt-1">Claude Code를 실행하면 여기에 표시됩니다</p>
          </div>
        )}
        {logs.map((log) => {
          const style = EVENT_STYLE[log.event_type] ?? {
            label: log.event_type,
            badge: 'bg-gray-100 text-gray-600',
            dot: 'bg-gray-400',
          }
          return (
            <div key={log.id} className="flex items-start gap-3 bg-white rounded-xl border border-gray-100 p-3">
              <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${style.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${style.badge}`}>
                    {style.label}
                  </span>
                  {log.agent_type && (
                    <span className="text-[10px] font-medium text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                      {log.agent_type}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400 ml-auto">{formatTime(log.created_at)}</span>
                </div>
                {log.message && (
                  <p className="text-xs text-gray-600 truncate">{log.message}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
