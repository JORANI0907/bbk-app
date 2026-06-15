'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'

interface LoginLog {
  id: string
  login_at: string
  success: boolean
  ip_address: string | null
  failure_msg: string | null
}

interface Props {
  userId: string
  userName: string
  onClose: () => void
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export default function LoginLogsDrawer({ userId, userName, onClose }: Props) {
  const [logs, setLogs] = useState<LoginLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/admin/users/${userId}/login-logs`)
      .then(r => r.json())
      .then(d => setLogs(d.logs ?? []))
      .finally(() => setLoading(false))
  }, [userId])

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-sm bg-white h-full flex flex-col shadow-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div>
            <h2 className="font-bold text-text-primary">{userName}</h2>
            <p className="text-xs text-text-tertiary mt-0.5">로그인 기록 (최근 50건)</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="text-center py-10 text-text-tertiary text-sm">불러오는 중...</p>
          ) : logs.length === 0 ? (
            <p className="text-center py-10 text-text-tertiary text-sm">로그인 기록이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {logs.map(log => (
                <div key={log.id} className="flex items-start gap-3 py-2.5 border-b border-border-subtle last:border-0">
                  <span className={`mt-0.5 text-sm font-bold ${log.success ? 'text-state-success' : 'text-state-danger'}`}>
                    {log.success ? '●' : '✕'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-primary">
                      {log.success ? '로그인 성공' : '로그인 실패'}
                    </p>
                    <p className="text-xs text-text-secondary mt-0.5">{formatDate(log.login_at)}</p>
                    {log.ip_address && (
                      <p className="text-xs text-text-tertiary font-mono">{log.ip_address}</p>
                    )}
                    {!log.success && log.failure_msg && (
                      <p className="text-xs text-state-danger mt-0.5">{log.failure_msg}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
