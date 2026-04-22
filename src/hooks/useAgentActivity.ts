'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface AgentLog {
  id: string
  session_id: string
  agent_type: string | null
  parent_agent_id: string | null
  event_type: string
  tool_name: string | null
  cwd: string | null
  message: string | null
  duration_ms: number | null
  created_at: string
}

export interface AgentActivityState {
  recentLogs: AgentLog[]
  activeSessions: Set<string>
  todayCounts: Record<string, number>
  isConnected: boolean
}

export function useAgentActivity(): AgentActivityState {
  const [recentLogs, setRecentLogs] = useState<AgentLog[]>([])
  const [activeSessions, setActiveSessions] = useState<Set<string>>(new Set())
  const [todayCounts, setTodayCounts] = useState<Record<string, number>>({})
  const [isConnected, setIsConnected] = useState(false)

  const addLog = useCallback((log: AgentLog) => {
    setRecentLogs(prev => [log, ...prev].slice(0, 60))

    if (log.event_type === 'SubagentStart') {
      setActiveSessions(prev => new Set(prev).add(log.session_id))
    } else if (log.event_type === 'SubagentStop' || log.event_type === 'Stop' || log.event_type === 'StopFailure') {
      setActiveSessions(prev => {
        const next = new Set(prev)
        next.delete(log.session_id)
        return next
      })
    }

    if (log.agent_type) {
      setTodayCounts(prev => ({
        ...prev,
        [log.agent_type!]: (prev[log.agent_type!] ?? 0) + 1,
      }))
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()

    // 오늘 로그 초기 로드
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    void supabase
      .from('agent_activity_logs')
      .select('*')
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })
      .limit(60)
      .then(({ data }) => {
        if (!data) return
        setRecentLogs(data)

        // 오늘 활동 횟수 집계
        const counts: Record<string, number> = {}
        for (const log of data) {
          if (log.agent_type) {
            counts[log.agent_type] = (counts[log.agent_type] ?? 0) + 1
          }
        }
        setTodayCounts(counts)
      })

    // Realtime 구독
    const channel = supabase
      .channel('agent-activity-logs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agent_activity_logs' },
        (payload) => { addLog(payload.new as AgentLog) },
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED')
      })

    return () => { void supabase.removeChannel(channel) }
  }, [addLog])

  return { recentLogs, activeSessions, todayCounts, isConnected }
}
