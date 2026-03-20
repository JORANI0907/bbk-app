'use client'

import { useState } from 'react'
import { ServiceSchedule } from '@/types/database'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

interface Props {
  upcomingSchedules: ServiceSchedule[]
}

export function ScheduleChangeRequest({ upcomingSchedules }: Props) {
  const [open, setOpen] = useState(false)
  const [selectedScheduleId, setSelectedScheduleId] = useState('')
  const [preferredDate, setPreferredDate] = useState('')
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async () => {
    if (!preferredDate && !reason.trim()) return
    setSending(true)
    try {
      const selectedSchedule = upcomingSchedules.find(s => s.id === selectedScheduleId)
      const originalDate = selectedSchedule
        ? format(new Date(selectedSchedule.scheduled_date), 'yyyy년 M월 d일 (EEE)', { locale: ko })
        : '미정'

      const content =
        `[일정변경요청]\n` +
        `기존 방문일: ${originalDate}\n` +
        (preferredDate ? `희망 날짜: ${preferredDate}\n` : '') +
        (reason.trim() ? `사유: ${reason.trim()}` : '')

      const res = await fetch('/api/customer/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })

      if (res.ok) {
        setDone(true)
        setTimeout(() => {
          setOpen(false)
          setDone(false)
          setSelectedScheduleId('')
          setPreferredDate('')
          setReason('')
        }, 2000)
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 border border-blue-200 rounded-2xl text-sm font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
      >
        📅 일정 변경 요청
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
            {done ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <span className="text-3xl">✅</span>
                <p className="font-semibold text-gray-900">요청이 전달되었습니다</p>
                <p className="text-xs text-gray-500 text-center">담당자가 확인 후 연락드리겠습니다.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-900">일정 변경 요청</h3>
                  <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
                </div>

                {upcomingSchedules.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">변경할 방문 일정</p>
                    <select
                      value={selectedScheduleId}
                      onChange={e => setSelectedScheduleId(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">선택 (선택사항)</option>
                      {upcomingSchedules.map(s => (
                        <option key={s.id} value={s.id}>
                          {format(new Date(s.scheduled_date), 'yyyy년 M월 d일 (EEE)', { locale: ko })}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <p className="text-xs text-gray-500 mb-1.5">희망 날짜</p>
                  <input
                    type="date"
                    value={preferredDate}
                    onChange={e => setPreferredDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <p className="text-xs text-gray-500 mb-1.5">변경 사유 (선택)</p>
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    rows={3}
                    placeholder="변경 사유를 입력해주세요..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={sending || (!preferredDate && !reason.trim())}
                  className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {sending ? '전송 중...' : '요청 보내기'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
