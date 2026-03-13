'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RealtimeChannel } from '@supabase/supabase-js'

type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

interface UseRealtimeOptions {
  table: string
  filter?: string
  event?: RealtimeEvent
  onData: (payload: { new: Record<string, unknown>; old: Record<string, unknown>; eventType: string }) => void
}

export function useRealtime({ table, filter, event = '*', onData }: UseRealtimeOptions) {
  const supabase = createClient()

  useEffect(() => {
    const channelName = `${table}_${filter ?? 'all'}_${Date.now()}`
    const channel: RealtimeChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event,
          schema: 'public',
          table,
          filter,
        },
        (payload) => {
          onData({
            new: payload.new as Record<string, unknown>,
            old: payload.old as Record<string, unknown>,
            eventType: payload.eventType,
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, filter, event]) // eslint-disable-line react-hooks/exhaustive-deps
}

export function useScheduleRealtime(onUpdate: (schedule: Record<string, unknown>) => void) {
  return useRealtime({
    table: 'service_schedules',
    event: 'UPDATE',
    onData: ({ new: updated }) => onUpdate(updated),
  })
}
