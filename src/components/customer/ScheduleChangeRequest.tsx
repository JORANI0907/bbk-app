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

  const canSubmit = selectedScheduleId !== '' && preferredDate !== ''

  const reset = () => {
    setOpen(false)
    setDone(false)
    setSelectedScheduleId('')
    setPreferredDate('')
    setReason('')
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSending(true)
    try {
      const selectedSchedule = upcomingSchedules.find(s => s.id === selectedScheduleId)
      const originalDate = selectedSchedule
        ? format(new Date(selectedSchedule.scheduled_date), 'yyyy년 M월 d일 (EEE)', { locale: ko })
        : '미정'

      const content =
        `[일정변경요청]\n` +
        `기존 방문일: ${originalDate}\n` +
        `희망 날짜: ${preferredDate}\n` +
        (reason.trim() ? `사유: ${reason.trim()}` : '')

      const res = await fetch('/api/customer/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })

      if (res.ok) {
        setDone(true)
        setTimeout(reset, 2200)
      }
    } finally {
      setSending(false)
    }
  }

  // 예정 일정 없으면 버튼 비노출
  if (upcomingSchedules.length === 0) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 border border-brand-200 rounded-2xl text-sm font-semibold text-brand-600 hover:bg-brand-50 active:scale-[0.98] transition-all"
      >
        📅 일정 변경 요청
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center">
          <div className="bg-surface rounded-t-3xl w-full max-w-lg px-5 pt-5 pb-8 flex flex-col gap-5">

            {done ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <span className="text-4xl">✅</span>
                <p className="font-bold text-text-primary">요청이 전달되었습니다</p>
                <p className="text-sm text-text-secondary text-center">담당자가 확인 후 연락드리겠습니다.</p>
              </div>
            ) : (
              <>
                {/* 헤더 */}
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-text-primary">일정 변경 요청</h3>
                  <button
                    onClick={reset}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-sunken text-text-tertiary text-lg"
                  >
                    ✕
                  </button>
                </div>

                {/* Step 1: 변경할 일정 선택 */}
                <div>
                  <p className="text-xs font-semibold text-text-secondary mb-2">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand-600 text-white text-[10px] mr-1.5">1</span>
                    변경할 예정 일정 선택
                  </p>
                  <select
                    value={selectedScheduleId}
                    onChange={e => setSelectedScheduleId(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface transition-colors ${
                      selectedScheduleId ? 'border-brand-600 text-text-primary' : 'border-border text-text-tertiary'
                    }`}
                  >
                    <option value="">예정 일정을 선택하세요</option>
                    {upcomingSchedules.map(s => (
                      <option key={s.id} value={s.id}>
                        {format(new Date(s.scheduled_date), 'yyyy년 M월 d일 (EEE)', { locale: ko })}
                        {s.items_this_visit?.length > 0
                          ? ` · ${s.items_this_visit.map((i: { name: string }) => i.name).join(', ')}`
                          : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Step 2: 희망 날짜 선택 */}
                <div>
                  <p className="text-xs font-semibold text-text-secondary mb-2">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand-600 text-white text-[10px] mr-1.5">2</span>
                    희망 날짜 선택
                  </p>
                  <input
                    type="date"
                    value={preferredDate}
                    onChange={e => setPreferredDate(e.target.value)}
                    min={format(new Date(), 'yyyy-MM-dd')}
                    className={`w-full border rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                      preferredDate ? 'border-brand-600 text-text-primary' : 'border-border text-text-tertiary'
                    }`}
                  />
                </div>

                {/* 사유 (선택) */}
                <div>
                  <p className="text-xs font-semibold text-text-secondary mb-2">변경 사유 <span className="font-normal text-text-tertiary">(선택)</span></p>
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    rows={2}
                    placeholder="변경 사유를 입력해주세요."
                    className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-text-tertiary"
                  />
                </div>

                {/* 전송 버튼 */}
                <button
                  onClick={handleSubmit}
                  disabled={sending || !canSubmit}
                  className="w-full py-3.5 bg-brand-600 text-white font-bold rounded-xl disabled:opacity-40 active:scale-[0.98] transition-all"
                >
                  {sending ? '전송 중...' : '변경 요청 보내기'}
                </button>

                {!canSubmit && (
                  <p className="text-center text-xs text-text-tertiary -mt-3">
                    일정과 희망 날짜를 모두 선택해주세요
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
