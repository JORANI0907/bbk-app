'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { AlertTriangle, Clock, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface AttendanceAlertRow {
  id: string
  application_id: string
  alert_type: 'late_arrival' | 'late_departure' | 'overrun'
  detected_at: string
}

interface ApplicationSummary {
  business_name: string | null
  construction_time: string | null
}

const ALERT_META: Record<
  AttendanceAlertRow['alert_type'],
  { label: string; emoji: string; icon: typeof AlertTriangle; tone: string }
> = {
  late_arrival:   { label: '출근 지연', emoji: '🚨', icon: AlertTriangle, tone: 'border-red-400 bg-red-50' },
  late_departure: { label: '퇴근 지연', emoji: '⏰', icon: Clock,          tone: 'border-amber-400 bg-amber-50' },
  overrun:        { label: '소요 초과', emoji: '⚡', icon: Zap,             tone: 'border-orange-400 bg-orange-50' },
}

/**
 * 관리자 레이아웃에 삽입되는 인앱 배너.
 * attendance_alerts 테이블의 INSERT 이벤트를 실시간 구독하여 관리자에게 즉시 알림.
 */
export function AttendanceAlertToaster() {
  const router = useRouter()
  const supabase = useRef(createClient()).current

  useEffect(() => {
    const channel = supabase
      .channel('attendance_alerts_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'attendance_alerts',
        },
        async (payload) => {
          const row = payload.new as AttendanceAlertRow
          const meta = ALERT_META[row.alert_type]
          if (!meta) return

          // 현장 정보 조회 (배너에 표시)
          let appInfo: ApplicationSummary | null = null
          try {
            const { data } = await supabase
              .from('service_applications')
              .select('business_name, construction_time')
              .eq('id', row.application_id)
              .maybeSingle()
            appInfo = data as ApplicationSummary | null
          } catch {
            /* 조용히 실패 */
          }

          const Icon = meta.icon
          const businessName = appInfo?.business_name ?? '(현장명 없음)'
          const timeLabel = appInfo?.construction_time ?? ''

          toast.custom(
            (t) => (
              <button
                onClick={() => {
                  toast.dismiss(t.id)
                  router.push('/admin/live')
                }}
                className={`w-full max-w-md text-left rounded-2xl border-2 shadow-modal p-4 flex items-start gap-3 transition-transform hover:scale-[1.01] active:scale-[0.99] ${meta.tone}`}
                style={{ backgroundColor: '#fff' }}
              >
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-soft">
                  <Icon size={20} className="text-red-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-text-primary leading-tight">
                    {meta.emoji} {meta.label} 감지
                  </p>
                  <p className="text-sm font-semibold text-text-primary mt-1 truncate">
                    {businessName}
                  </p>
                  {timeLabel && (
                    <p className="text-xs text-text-tertiary mt-0.5">예정 {timeLabel}</p>
                  )}
                  <p className="text-[11px] text-brand-600 font-semibold mt-1.5">
                    탭하여 라이브 대시보드 열기 →
                  </p>
                </div>
              </button>
            ),
            { duration: 10_000, position: 'top-right' },
          )
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [router, supabase])

  return null
}
