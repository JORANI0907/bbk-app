'use client'

import { useState, useEffect } from 'react'

interface Request {
  id: string
  content: string
  is_read: boolean
  created_at: string
}

interface Schedule {
  id: string
  scheduled_date: string
  worker_memo: string | null
  memo_visible: boolean
  status: string
}

interface Props {
  customerId: string
}

const fmt = (dateStr: string) => dateStr.slice(0, 10).replace(/-/g, '.')

export function CustomerRequestsPanel({ customerId }: Props) {
  const [requests, setRequests] = useState<Request[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [tab, setTab] = useState<'requests' | 'memos'>('requests')
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/admin/customers/${customerId}/requests`).then(r => r.json()),
      fetch(`/api/admin/customers/${customerId}/schedules-memo`).then(r => r.json()),
    ]).then(([reqData, schData]) => {
      setRequests(reqData.requests ?? [])
      setSchedules(schData.schedules ?? [])
    }).finally(() => setLoading(false))
  }, [customerId])

  const toggleMemo = async (scheduleId: string, current: boolean) => {
    setToggling(scheduleId)
    try {
      const res = await fetch(`/api/admin/schedules/${scheduleId}/toggle-memo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memo_visible: !current }),
      })
      if (res.ok) {
        setSchedules(prev =>
          prev.map(s => s.id === scheduleId ? { ...s, memo_visible: !current } : s)
        )
      }
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className="border-t border-gray-100 pt-4 mt-4">
      {/* 탭 */}
      <div className="flex gap-1 mb-4">
        <button
          onClick={() => setTab('requests')}
          className={`flex-1 text-xs font-medium py-2 rounded-lg transition-colors ${
            tab === 'requests' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          요청사항 이력 {requests.length > 0 && `(${requests.length})`}
        </button>
        <button
          onClick={() => setTab('memos')}
          className={`flex-1 text-xs font-medium py-2 rounded-lg transition-colors ${
            tab === 'memos' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          담당자 메모 관리
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-gray-400 text-center py-6">불러오는 중...</p>
      ) : tab === 'requests' ? (
        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
          {requests.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">요청사항이 없습니다.</p>
          ) : (
            requests.map(r => (
              <div key={r.id} className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">{fmt(r.created_at)}</p>
                <p className="text-xs text-gray-800 whitespace-pre-wrap">{r.content}</p>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
          {schedules.filter(s => s.worker_memo).length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">담당자 메모가 없습니다.</p>
          ) : (
            schedules
              .filter(s => s.worker_memo)
              .map(s => (
                <div key={s.id} className="bg-gray-50 rounded-xl p-3 flex gap-3 items-start">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 mb-1">{fmt(s.scheduled_date)}</p>
                    <p className="text-xs text-gray-800 whitespace-pre-wrap">{s.worker_memo}</p>
                  </div>
                  <button
                    onClick={() => toggleMemo(s.id, s.memo_visible)}
                    disabled={toggling === s.id}
                    className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${
                      s.memo_visible
                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                    }`}
                  >
                    {s.memo_visible ? '고객 공개 중' : '비공개'}
                  </button>
                </div>
              ))
          )}
        </div>
      )}
    </div>
  )
}
