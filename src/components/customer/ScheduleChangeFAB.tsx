'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Button } from '@/components/ui'
import { CheckCircle } from 'lucide-react'

type Step = 'idle' | 'info' | 'form'

interface UpcomingSchedule {
  id: string
  scheduled_date: string
  items_this_visit: { id?: string; name: string }[] | null
  status: string
}

const CONTACT_NUMBER = '031-759-4877'

export function ScheduleChangeFAB() {
  const [step, setStep] = useState<Step>('idle')
  const [schedules, setSchedules] = useState<UpcomingSchedule[]>([])
  const [loadingSchedules, setLoadingSchedules] = useState(false)

  const [selectedScheduleId, setSelectedScheduleId] = useState('')
  const [preferredDate, setPreferredDate] = useState('')
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (step !== 'form') return
    if (schedules.length > 0) return
    setLoadingSchedules(true)
    fetch('/api/customer/schedules')
      .then(r => r.json())
      .then(json => setSchedules(json.data ?? []))
      .catch(() => {})
      .finally(() => setLoadingSchedules(false))
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  function reset() {
    setStep('idle')
    setDone(false)
    setSelectedScheduleId('')
    setPreferredDate('')
    setReason('')
  }

  const canSubmit = selectedScheduleId !== '' && preferredDate !== ''

  async function handleSubmit() {
    if (!canSubmit) return
    setSending(true)
    try {
      const sel = schedules.find(s => s.id === selectedScheduleId)
      const originalDate = sel
        ? format(new Date(sel.scheduled_date), 'yyyy년 M월 d일 (EEE)', { locale: ko })
        : '미정'

      const content =
        `[일정변경요청]\n기존 방문일: ${originalDate}\n희망 날짜: ${preferredDate}` +
        (reason.trim() ? `\n사유: ${reason.trim()}` : '')

      const res = await fetch('/api/admin/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'schedule_change',
          content,
          extra_data: {
            schedule_id: selectedScheduleId,
            original_date: sel?.scheduled_date,
            preferred_date: preferredDate,
            reason: reason.trim(),
          },
        }),
      })

      if (res.ok) {
        setDone(true)
        setTimeout(reset, 2200)
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* FAB 버튼 */}
      <button
        onClick={() => setStep('info')}
        className="fixed bottom-24 right-4 z-40 w-14 h-14 rounded-full bg-brand-600 text-white shadow-modal flex items-center justify-center active:scale-95 transition-transform hover:bg-brand-700"
        aria-label="일정 변경 요청"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
          <line x1="12" y1="14" x2="12" y2="18"/>
          <line x1="10" y1="16" x2="14" y2="16"/>
        </svg>
      </button>

      {/* 안내 모달 (중앙) */}
      {step === 'info' && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={reset}
        >
          <div
            className="bg-surface rounded-2xl w-full max-w-sm shadow-modal overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <h3 className="text-base font-bold text-text-primary">일정 변경 안내</h3>
              <button
                onClick={reset}
                className="text-text-tertiary hover:text-text-primary text-lg leading-none transition-colors"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div className="px-5 pb-4 flex flex-col gap-3">
              <p className="text-sm text-text-secondary leading-relaxed">
                일정 변경은{' '}
                <span className="font-semibold text-text-primary">방문일 7일 전</span>
                까지 가능하며, 이내 변경을 원할 경우 고객센터로 직접 연락 바랍니다.
              </p>
              <a
                href={`tel:${CONTACT_NUMBER.replace(/-/g, '')}`}
                className="flex items-center gap-2.5 bg-surface-sunken rounded-xl px-4 py-3 active:scale-[0.98] transition-transform"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-brand-600 shrink-0">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 11 19.79 19.79 0 0 1 1.62 2.27 2 2 0 0 1 3.62.01h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 7.91a16 16 0 0 0 6 6l.82-.82a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.6 16.92z"/>
                </svg>
                <span className="text-sm font-semibold text-brand-600">{CONTACT_NUMBER}</span>
                <span className="text-xs text-text-tertiary ml-auto">고객센터</span>
              </a>
            </div>

            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={reset}
                className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold text-text-secondary hover:bg-surface-sunken transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => setStep('form')}
                className="flex-1 py-3 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 일정 변경 요청 폼 (하단 시트) */}
      {step === 'form' && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
          onClick={reset}
        >
          <div
            className="bg-surface rounded-t-3xl w-full max-w-lg px-5 pt-4 pb-8 flex flex-col gap-5"
            onClick={e => e.stopPropagation()}
          >
            {/* 드래그 핸들 */}
            <div className="flex justify-center">
              <div className="w-10 h-1 bg-border rounded-full" />
            </div>

            {done ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <CheckCircle size={48} className="text-state-success" />
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
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-sunken text-text-tertiary transition-colors"
                    aria-label="닫기"
                  >
                    ✕
                  </button>
                </div>

                {loadingSchedules ? (
                  <div className="py-8 text-center text-sm text-text-tertiary">일정을 불러오는 중...</div>
                ) : schedules.length === 0 ? (
                  <div className="py-8 text-center flex flex-col gap-2">
                    <p className="text-sm font-semibold text-text-primary">예정된 일정이 없습니다</p>
                    <p className="text-xs text-text-tertiary">변경할 예정 일정이 없습니다.</p>
                  </div>
                ) : (
                  <>
                    {/* Step 1 */}
                    <div>
                      <p className="text-xs font-semibold text-text-secondary mb-2">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand-600 text-white text-[10px] mr-1.5">1</span>
                        변경할 예정 일정 선택
                      </p>
                      <select
                        value={selectedScheduleId}
                        onChange={e => setSelectedScheduleId(e.target.value)}
                        className={`w-full border rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-surface transition-colors ${
                          selectedScheduleId ? 'border-brand-600 text-text-primary' : 'border-border text-text-tertiary'
                        }`}
                      >
                        <option value="">예정 일정을 선택하세요</option>
                        {schedules.map(s => (
                          <option key={s.id} value={s.id}>
                            {format(new Date(s.scheduled_date), 'yyyy년 M월 d일 (EEE)', { locale: ko })}
                            {s.items_this_visit && s.items_this_visit.length > 0
                              ? ` · ${s.items_this_visit.map(i => i.name).join(', ')}`
                              : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Step 2 */}
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
                        className={`w-full border rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 transition-colors ${
                          preferredDate ? 'border-brand-600 text-text-primary' : 'border-border text-text-tertiary'
                        }`}
                      />
                    </div>

                    {/* 사유 (선택) */}
                    <div>
                      <p className="text-xs font-semibold text-text-secondary mb-2">
                        변경 사유{' '}
                        <span className="font-normal text-text-tertiary">(선택)</span>
                      </p>
                      <textarea
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        rows={2}
                        placeholder="변경 사유를 입력해주세요."
                        className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none placeholder:text-text-tertiary"
                      />
                    </div>

                    <Button
                      onClick={handleSubmit}
                      disabled={sending || !canSubmit}
                      isLoading={sending}
                      variant="primary"
                      className="w-full py-3.5 font-bold rounded-xl active:scale-[0.98]"
                    >
                      {sending ? '전송 중...' : '변경 요청 보내기'}
                    </Button>

                    {!canSubmit && (
                      <p className="text-center text-xs text-text-tertiary -mt-3">
                        일정과 희망 날짜를 모두 선택해주세요
                      </p>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
