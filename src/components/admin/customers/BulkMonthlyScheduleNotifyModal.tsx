'use client'

/**
 * 정기딥/정기엔드 일괄 예약확정알림 발송 모달.
 * MonthlyScheduleNotifyModal (단일 고객용) 의 다중 대상 버전.
 *
 * 사용:
 *  - 고객관리 리스트에서 정기딥 or 정기엔드 단일 유형만 체크 후 [일정 알림] 클릭
 *  - 년/월 선택 → 각 고객의 해당 월 회차 요약 표시 → 발송 시 각 customer 순차 API 호출
 *
 * 정책:
 *  - customer_type 은 모두 같은 유형이어야 함 (호출 측에서 검증)
 *  - 1회성/일반 or 유형 혼합은 호출 측에서 차단
 */

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, X, Send, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  customers: Array<{ id: string; business_name: string }>
  /** '정기딥케어' | '정기엔드케어' — 이 두 유형만 대상. 이미 호출 측에서 검증됨 */
  customerType: '정기딥케어' | '정기엔드케어'
  /** 초기 선택 월 (YYYY-MM). 기본은 다음 달 */
  initialMonth?: string
  onClose: () => void
  /** 발송 성공 후 콜백 (부모 refetch 등) */
  onSent?: () => void
}

interface PreviewRow {
  customerId: string
  businessName: string
  dates: string[]
}

const WEEKDAY_KR = ['일', '월', '화', '수', '목', '금', '토']

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function nextMonthYm(): string {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m, 10)}월`
}

function fmtShort(d: string): string {
  const [y, m, dd] = d.split('-').map(Number)
  const dow = WEEKDAY_KR[new Date(y, m - 1, dd).getDay()]
  return `${m}/${dd}(${dow})`
}

export function BulkMonthlyScheduleNotifyModal({
  customers, customerType, initialMonth, onClose, onSent,
}: Props) {
  const [selectedMonth, setSelectedMonth] = useState(initialMonth ?? nextMonthYm())
  const [sending, setSending] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [progress, setProgress] = useState<{ done: number; ok: number; fail: number } | null>(null)

  const templateType = customerType === '정기딥케어'
    ? '예약확정알림_월단위_정기딥'
    : '예약확정알림_월단위_정기엔드'

  // ESC 로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sending) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, sending])

  // 선택된 월 바뀔 때마다 각 고객의 해당 월 회차 미리보기 로드 (병렬).
  useEffect(() => {
    let cancelled = false
    async function fetchPreview() {
      setLoadingPreview(true)
      try {
        const rows = await Promise.all(customers.map(async c => {
          const params = new URLSearchParams({ customer_id: c.id, month: selectedMonth })
          const res = await fetch(`/api/admin/applications?${params.toString()}`)
          if (!res.ok) return { customerId: c.id, businessName: c.business_name, dates: [] as string[] }
          const body = await res.json()
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
          return { customerId: c.id, businessName: c.business_name, dates }
        }))
        if (cancelled) return
        setPreview(rows)
      } catch (e) {
        if (!cancelled) {
          setPreview([])
          toast.error(e instanceof Error ? e.message : '미리보기 조회 실패')
        }
      } finally {
        if (!cancelled) setLoadingPreview(false)
      }
    }
    void fetchPreview()
    return () => { cancelled = true }
  }, [customers, selectedMonth])

  // 발송할 회차가 하나라도 있는 고객만 발송 대상.
  const sendableRows = preview.filter(r => r.dates.length > 0)
  const skippedCount = preview.length - sendableRows.length

  const handleSend = async () => {
    if (sendableRows.length === 0) {
      toast.error('선택한 월에 발송할 회차가 있는 고객이 없습니다.')
      return
    }
    if (!confirm(
      `${customerType} ${sendableRows.length}건에 ${monthLabel(selectedMonth)} 예약확정알림을 발송합니다.` +
      (skippedCount > 0 ? `\n(회차 없어 skip: ${skippedCount}건)` : '') +
      `\n\n계속하시겠습니까?`
    )) return

    setSending(true)
    setProgress({ done: 0, ok: 0, fail: 0 })
    let ok = 0, fail = 0
    for (let i = 0; i < sendableRows.length; i++) {
      const row = sendableRows[i]
      try {
        const res = await fetch('/api/admin/customers/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: row.customerId,
            type: templateType,
            method: 'manual',
            target_month: selectedMonth,
          }),
        })
        if (res.ok) ok++
        else fail++
      } catch { fail++ }
      setProgress({ done: i + 1, ok, fail })
    }
    setSending(false)

    if (fail === 0) {
      toast.success(`${monthLabel(selectedMonth)} 예약확정알림 ${ok}건 발송 완료`)
    } else if (ok > 0) {
      toast(`${ok}건 성공, ${fail}건 실패`, { icon: '⚠️' })
    } else {
      toast.error(`전체 실패 (${fail}건)`)
    }
    onSent?.()
    if (fail === 0) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !sending) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div>
            <p className="text-sm font-semibold text-text-primary">일정 알림 (일괄 발송)</p>
            <p className="text-xs text-text-tertiary mt-0.5">{customerType} · {customers.length}건</p>
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
        <div className="p-5 space-y-4 overflow-y-auto">
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

          {/* 미리보기 (고객별 리스트) */}
          <div>
            <p className="text-xs font-medium text-text-secondary mb-2">
              고객별 발송 회차 미리보기 {loadingPreview ? '' : `(발송 ${sendableRows.length} · skip ${skippedCount})`}
            </p>
            <div className="bg-brand-50/50 border border-brand-100 rounded-lg p-3 min-h-[80px] max-h-[280px] overflow-y-auto space-y-1.5">
              {loadingPreview ? (
                <div className="flex items-center justify-center py-4 text-text-tertiary">
                  <Loader2 size={16} className="animate-spin" />
                </div>
              ) : preview.length === 0 ? (
                <p className="text-xs text-text-tertiary text-center py-4">고객이 없습니다.</p>
              ) : (
                preview.map(row => (
                  <div key={row.customerId} className="text-xs bg-white rounded-md px-2.5 py-1.5 border border-brand-100">
                    <p className="font-semibold text-text-primary truncate">{row.businessName}</p>
                    {row.dates.length === 0 ? (
                      <p className="text-[11px] text-text-tertiary mt-0.5">이 월에 회차 없음 (skip)</p>
                    ) : (
                      <p className="text-[11px] text-text-secondary mt-0.5 break-keep">{row.dates.map(fmtShort).join(', ')}</p>
                    )}
                  </div>
                ))
              )}
            </div>
            <p className="text-[10px] text-text-tertiary mt-2">
              * 전용 템플릿 <b>{templateType}</b> 사용.
              문자 본문에 <code className="text-brand-700">{'{{시공일정_리스트}}'}</code> · <code className="text-brand-700">{'{{시공월}}'}</code> 변수 포함.
            </p>
          </div>

          {/* 진행 상황 */}
          {progress && sending && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800">
              발송 중 · {progress.done}/{sendableRows.length}
              {(progress.ok > 0 || progress.fail > 0) && (
                <> · 성공 {progress.ok} · 실패 {progress.fail}</>
              )}
            </div>
          )}
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
            disabled={sending || sendableRows.length === 0}
            className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            <Send size={13} />
            {sending ? '발송 중…' : `${sendableRows.length}건 발송`}
          </button>
        </div>
      </div>
    </div>
  )
}
