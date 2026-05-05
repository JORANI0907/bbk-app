'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, X } from 'lucide-react'

interface ChangeNotice {
  id: string
  status: string
  admin_memo: string | null
  extra_data: {
    preferred_date?: string
    original_date?: string
  } | null
  checked_at: string | null
}

function formatKoreanDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

export function ScheduleChangeNoticeBar() {
  const [notices, setNotices] = useState<ChangeNotice[]>([])

  useEffect(() => {
    fetch('/api/customer/change-notices')
      .then(r => r.json())
      .then(json => setNotices(json.data ?? []))
      .catch(() => {})
  }, [])

  async function dismiss(id: string) {
    setNotices(prev => prev.filter(n => n.id !== id))
    fetch('/api/admin/requests', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'mark_read' }),
    }).catch(() => {})
  }

  if (notices.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {notices.map(notice => {
        const isApproved = notice.status === 'approved' || notice.status === 'done'
        const preferredDate = notice.extra_data?.preferred_date
        return (
          <div
            key={notice.id}
            className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-xs leading-relaxed ${
              isApproved
                ? 'bg-state-success-bg text-state-success'
                : 'bg-state-warning-bg text-state-warning'
            }`}
          >
            {isApproved ? (
              <CheckCircle size={13} className="shrink-0 mt-0.5" />
            ) : (
              <XCircle size={13} className="shrink-0 mt-0.5" />
            )}
            <div className="flex-1 break-keep">
              <span className="font-semibold">
                {isApproved ? '일정 변경이 승인되었습니다.' : '일정 변경 요청이 반려되었습니다.'}
              </span>
              {preferredDate && isApproved && (
                <span className="opacity-80">
                  {' '}변경일: {formatKoreanDate(preferredDate)}
                </span>
              )}
              {notice.admin_memo && (
                <span className="block opacity-70 mt-0.5">{notice.admin_memo}</span>
              )}
            </div>
            <button
              onClick={() => dismiss(notice.id)}
              className="shrink-0 mt-0.5 opacity-50 hover:opacity-90 transition-opacity"
              aria-label="닫기"
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
