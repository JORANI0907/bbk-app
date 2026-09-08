'use client'

/**
 * 정기딥/정기엔드 예약확정알림 발송 모달.
 * 사용자가 년/월을 선택하면 그 월의 회차 목록을 미리보기로 보여주고,
 * 발송 버튼 클릭 시 /api/admin/customers/notify 로 target_month 파라미터를 실어 요청.
 * 서버가 그 월의 회차를 조회해 {{시공일정_리스트}} / {{시공월}} 변수를 채워 SMS 발송.
 */

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, X, Send, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  customerId: string
  businessName: string
  /** '정기딥케어' | '정기엔드케어' — 이 두 유형만 대상 */
  customerType: string
  /** 초기 선택 월 (YYYY-MM). 클릭한 월 헤더 값. */
  initialMonth: string
  onClose: () => void
  /** 발송 성공 후 콜백 (선택 사항) */
  onSent?: () => void
}

const WEEKDAY_KR = ['일', '월', '화', '수', '목', '금', '토']

/** 'YYYY-MM' + N개월 → 'YYYY-MM' */
function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** '2026-09' → '2026년 9월' */
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m, 10)}월`
}

/** '2026-09-03' → '9/3(목)' */
function fmtShort(d: string): string {
  const [y, m, dd] = d.split('-').map(Number)
  const dow = WEEKDAY_KR[new Date(y, m - 1, dd).getDay()]
  return `${m}/${dd}(${dow})`
}

export function MonthlyScheduleNotifyModal({
  customerId, businessName, customerType, initialMonth, onClose, onSent,
}: Props) {
  const [selectedMonth, setSelectedMonth] = useState(initialMonth)
  const [sending, setSending] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [monthDates, setMonthDates] = useState<string[]>([])

  // ESC 로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sending) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, sending])

  // 선택된 월이 바뀔 때마다 해당 월의 회차 목록 API 로 조회 (부모 컨텍스트와 무관하게 정확한 미리보기).
  // 서버 발송 로직도 같은 조건 (customer_id + month) 으로 조회하므로 미리보기 = 실제 발송 내용 정합.
  useEffect(() => {
    let cancelled = false
    async function fetchPreview() {
      setLoadingPreview(true)
      try {
        const params = new URLSearchParams({ customer_id: customerId, month: selectedMonth })
        const res = await fetch(`/api/admin/applications?${params.toString()}`)
        if (!res.ok) throw new Error((await res.json()).error ?? '미리보기 조회 실패')
        const body = await res.json()
        if (cancelled) return
        const seen = new Set<string>()
        const dates: string[] = []
        for (const app of (body.applications ?? []) as Array<{ construction_date: string | null }>) {
          const d = app.construction_date
          if (!d || !d.startsWith(selectedMonth)) continue
          if (seen.has(d)) continue
          seen.add(d)
          dates.push(d)
        }
        dates.sort()
        setMonthDates(dates)
      } catch (e) {
        if (!cancelled) {
          setMonthDates([])
          toast.error(e instanceof Error ? e.message : '미리보기 조회 실패')
        }
      } finally {
        if (!cancelled) setLoadingPreview(false)
      }
    }
    void fetchPreview()
    return () => { cancelled = true }
  }, [customerId, selectedMonth])

  const scheduleListStr = monthDates.map(fmtShort).join(', ')
  const monthLabelStr = `${parseInt(selectedMonth.split('-')[1], 10)}월`

  // 정기딥/정기엔드 접미사
  const templateType = customerType === '정기딥케어'
    ? '예약확정알림_정기딥'
    : '예약확정알림_정기엔드'

  const handleSend = async () => {
    if (monthDates.length === 0) {
      toast.error('선택한 월에 회차가 없습니다.')
      return
    }
    if (!confirm(
      `${businessName}\n${monthLabel(selectedMonth)} 예약확정알림을 발송합니다.\n\n일정: ${scheduleListStr}\n\n계속하시겠습니까?`,
    )) return

    setSending(true)
    try {
      const res = await fetch('/api/admin/customers/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          type: templateType,
          method: 'manual',
          target_month: selectedMonth,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '발송 실패')
      toast.success(`${monthLabel(selectedMonth)} 예약확정알림 발송 완료`)
      onSent?.()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '발송 실패')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !sending) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-md overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div>
            <p className="text-sm font-semibold text-text-primary">예약확정알림 발송</p>
            <p className="text-xs text-text-tertiary mt-0.5 truncate">{businessName}</p>
          </div>
          <button
            onClick={onClose}
            disabled={sending}
            className="p-1 rounded-md hover:bg-surface-sunken transition-colors disabled:opacity-40"
            aria-label="닫기"
          >
            <X size={16} className="text-text-tertiary" />
          </button>
        </div>

        {/* 본문 */}
        <div className="p-5 space-y-4">
          {/* 년월 선택 */}
          <div>
            <p className="text-xs font-medium text-text-secondary mb-2">발송 대상 월</p>
            <div className="flex items-center justify-center gap-3 bg-surface-sunken/60 rounded-lg py-2">
              <button
                onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}
                disabled={sending}
                className="p-1.5 rounded-md hover:bg-white transition-colors disabled:opacity-40"
                aria-label="이전 달"
              >
                <ChevronLeft size={16} className="text-text-secondary" />
              </button>
              <span className="text-sm font-semibold text-text-primary min-w-[110px] text-center">
                {monthLabel(selectedMonth)}
              </span>
              <button
                onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}
                disabled={sending}
                className="p-1.5 rounded-md hover:bg-white transition-colors disabled:opacity-40"
                aria-label="다음 달"
              >
                <ChevronRight size={16} className="text-text-secondary" />
              </button>
            </div>
          </div>

          {/* 미리보기 */}
          <div>
            <p className="text-xs font-medium text-text-secondary mb-2">
              발송될 일정 미리보기 {loadingPreview ? '' : `(${monthDates.length}회)`}
            </p>
            <div className="bg-brand-50/50 border border-brand-100 rounded-lg p-3 min-h-[80px]">
              {loadingPreview ? (
                <div className="flex items-center justify-center py-4 text-text-tertiary">
                  <Loader2 size={16} className="animate-spin" />
                </div>
              ) : monthDates.length === 0 ? (
                <p className="text-xs text-text-tertiary text-center py-4">
                  이 월에 회차가 없습니다.
                </p>
              ) : (
                <>
                  <p className="text-sm text-text-primary leading-relaxed break-keep">
                    {scheduleListStr}
                  </p>
                  <p className="text-[10px] text-text-tertiary mt-2">
                    * 문자 본문에 <code className="text-brand-700">{'{{시공일정_리스트}}'}</code> 변수로 삽입됨.
                    <br />
                    * 문자알림관리 &gt; {customerType} 탭에서 <b>{templateType}</b> 템플릿의 본문에 이 변수가 있어야 반영됩니다.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 액션 */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-border-subtle bg-surface-sunken/30">
          <button
            onClick={onClose}
            disabled={sending}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-text-secondary border border-border-subtle hover:bg-white transition-colors disabled:opacity-40"
          >
            취소
          </button>
          <button
            onClick={handleSend}
            disabled={sending || monthDates.length === 0}
            className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            <Send size={13} />
            {sending ? '발송 중…' : '발송'}
          </button>
        </div>
      </div>
    </div>
  )
}
