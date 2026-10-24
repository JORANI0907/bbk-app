'use client'

/**
 * 정기 진행 흐름 (정기딥/엔드 거래처 전용) — 2026-10-17 Phase B
 *
 * 1회성 진행흐름이 "5단계 선형(신청→예약금→작업→잔금→계산서)"이라면,
 * 정기는 매월·매년 N건 반복되므로 "타임라인 + 월별 상세 접기형" 구조로 표현한다.
 *
 * 설계 원칙:
 * - "진행흐름" 섹션 하나로 결제이력·방문일정·담당자 섹션을 흡수 (사장님 "복잡" 해결)
 * - 월간결제: 12칸 가로 바 (디폴트)
 * - 연간결제: 3년치 가로 바 (billing_cycle === '연간')
 * - 선택 월 localStorage 기억 (사장님 확정 "기억" 옵션)
 * - 디폴트 자동 펼침: 월간 = 이번 달, 연간 = 올해
 *
 * Phase B: Mock 데이터로 시각 확인
 * Phase C: service_billings + service_applications 실데이터 연결 예정
 */

import { useState, useMemo, useEffect } from 'react'
import {
  Wallet, Users, ChevronDown, ChevronRight,
  Check, Clock, AlertCircle, Trash2,
} from 'lucide-react'
import { VisitDetailModal, type VisitDetailData } from './VisitDetailModal'
import { BillingDetailModal, type BillingDetailData } from './BillingDetailModal'
import { MonthlyScheduleNotifyModal } from './MonthlyScheduleNotifyModal'
import { BillingNotifyModal } from './BillingNotifyModal'

// ─── 타입 ─────────────────────────────────────────────────────
type BillingStatus = 'paid' | 'pending' | 'overdue' | 'none'
type VisitStatus = 'done' | 'scheduled' | 'canceled' | 'none'

interface BillingItem {
  id: string
  label: string
  amount: number
  dueDate: string
  paidDate?: string
  status: Exclude<BillingStatus, 'none'>
  // Phase E: 모달 편집용
  billingType?: string
  billingPeriod?: string
  taxInvoiceIssued?: boolean
  // Phase H.5-rev: 결제링크 복사용
  paymentUrl?: string
}

interface VisitItem {
  id: string
  date: string
  worker: string
  status: Exclude<VisitStatus, 'none'>
  // Phase C: 모달 편집용 확장 필드 (API 에서 함께 반환)
  assignedTo?: string          // Phase F: 담당자 변경용 UUID
  constructionTime?: string
  progressStatus?: string
  paymentStatus?: string
  careScope?: string
  adminRequest?: string
  adminMemo?: string
  notificationSent?: boolean
  // Phase G1: 미니 진행흐름
  depositPaidAt?: string
  workCompletedAt?: string
  balancePaidAt?: string
  taxInvoiceIssued?: boolean
  // Phase G2: 알림 이력
  notificationLog?: Array<{ type: string; sent_at: string; method?: string }>
  // Phase H.5-rev: 월 결제 완료 여부 (service_billings)
  monthlyBillingPaid?: boolean
}

interface PeriodBundle {
  key: string         // '2026-10' 월간 | '2026' 연간
  year: number
  month: number | null  // null = 연간
  label: string       // '10월' or '2026년'
  billings: BillingItem[]
  visits: VisitItem[]
}

interface Props {
  customerType: '정기딥케어' | '정기엔드케어'
  billingCycle: '월간' | '연간' | null
  billingAmount: number | null
  businessName?: string
  customerId?: string  // Phase C 에서 실데이터 fetch 할 때 사용
}

// ─── Mock 데이터 생성 ────────────────────────────────────────
function buildMockMonthlyYear(year: number, currentYear: number, currentMonth: number): PeriodBundle[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const isPast = year < currentYear || (year === currentYear && month < currentMonth)
    const isCurrent = year === currentYear && month === currentMonth
    const monthStr = `${year}-${String(month).padStart(2, '0')}`
    const empty = year > currentYear || (year === currentYear && month > currentMonth + 1)
    return {
      key: monthStr,
      year, month,
      label: `${month}월`,
      billings: empty ? [] : [{
        id: `b-${monthStr}`,
        label: `${month}월 정기 청구`,
        amount: 500000,
        dueDate: `${monthStr}-05`,
        paidDate: isPast ? `${monthStr}-05` : undefined,
        status: isPast ? 'paid' : isCurrent ? 'pending' : 'pending',
      }],
      visits: empty ? [] : [{
        id: `v-${monthStr}`,
        date: `${monthStr}-15`,
        worker: '조라니',
        status: isPast ? 'done' : 'scheduled',
      }],
    }
  })
}

function buildMockAnnual(currentYear: number): PeriodBundle[] {
  return [-1, 0, 1].map(offset => {
    const year = currentYear + offset
    const isPast = offset < 0
    const isCurrent = offset === 0
    return {
      key: String(year),
      year, month: null,
      label: `${year}년`,
      billings: offset > 0 ? [] : [{
        id: `b-${year}`,
        label: `${year}년 연간 정기 청구`,
        amount: 6000000,
        dueDate: `${year}-03-15`,
        paidDate: isPast ? `${year}-03-15` : undefined,
        status: isPast ? 'paid' : isCurrent ? 'pending' : 'pending',
      }],
      visits: offset > 0
        ? []
        : Array.from({ length: isPast ? 12 : 8 }, (_, i) => ({
            id: `v-${year}-${i + 1}`,
            date: `${year}-${String(i + 1).padStart(2, '0')}-15`,
            worker: '조라니',
            status: isPast ? 'done' as const : i < 8 ? 'done' as const : 'scheduled' as const,
          })),
    }
  })
}

// ─── 상태별 색상 토큰 ─────────────────────────────────────────
interface StatusColor { dot: string; bg: string; text: string; label: string }

const BILLING_COLORS: Record<BillingStatus, StatusColor> = {
  paid:    { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', label: '완료' },
  pending: { dot: 'bg-amber-400',   bg: 'bg-amber-50',   text: 'text-amber-700',   label: '대기' },
  overdue: { dot: 'bg-rose-500',    bg: 'bg-rose-50',    text: 'text-rose-700',    label: '지연' },
  none:    { dot: 'bg-slate-200',   bg: 'bg-slate-50',   text: 'text-slate-400',   label: '미생성' },
}

const VISIT_COLORS: Record<VisitStatus, StatusColor> = {
  done:      { dot: 'bg-sky-500',    bg: 'bg-sky-50',    text: 'text-sky-700',    label: '완료' },
  scheduled: { dot: 'bg-indigo-400', bg: 'bg-indigo-50', text: 'text-indigo-700', label: '예정' },
  canceled:  { dot: 'bg-rose-500',   bg: 'bg-rose-50',   text: 'text-rose-700',   label: '취소' },
  none:      { dot: 'bg-slate-200',  bg: 'bg-slate-50',  text: 'text-slate-400',  label: '미생성' },
}

function billingStatusOf(items: BillingItem[]): BillingStatus {
  if (items.length === 0) return 'none'
  if (items.some(i => i.status === 'overdue')) return 'overdue'
  if (items.every(i => i.status === 'paid')) return 'paid'
  return 'pending'
}

function visitStatusOf(items: VisitItem[]): VisitStatus {
  if (items.length === 0) return 'none'
  if (items.some(i => i.status === 'canceled')) return 'canceled'
  if (items.every(i => i.status === 'done')) return 'done'
  return 'scheduled'
}

const LS_PREFIX = 'bbk_regular_progress_'  // 선택 월 기억용

// ─── 메인 컴포넌트 ────────────────────────────────────────────
export default function RegularProgressFlow({
  customerType, billingCycle, billingAmount, businessName, customerId,
}: Props) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const isAnnual = billingCycle === '연간'

  // 연도 토글 (월간결제 전용 — 연간은 3년 통째로 표시)
  const availableYears = useMemo(
    () => [currentYear - 1, currentYear, currentYear + 1],
    [currentYear],
  )
  const [selectedYear, setSelectedYear] = useState(currentYear)

  // 선택 월 기억 (localStorage)
  const defaultExpandedKey = isAnnual
    ? String(currentYear)
    : `${selectedYear}-${String(currentMonth).padStart(2, '0')}`

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set([defaultExpandedKey])
    try {
      const stored = window.localStorage.getItem(`${LS_PREFIX}expanded`)
      if (stored) return new Set(JSON.parse(stored) as string[])
    } catch { /* ignore */ }
    return new Set([defaultExpandedKey])
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(`${LS_PREFIX}expanded`, JSON.stringify([...expanded]))
    } catch { /* ignore */ }
  }, [expanded])

  // 투입일정 세부편집 모달 state
  const [visitModalData, setVisitModalData] = useState<VisitDetailData | null>(null)
  // 결제 세부편집 모달 state (Phase E)
  const [billingModalData, setBillingModalData] = useState<BillingDetailData | null>(null)
  // 알림 발송 이력 섹션 접기 (G2-rev: 총괄 마스터 레벨)
  const [showNotifHistory, setShowNotifHistory] = useState(false)
  // Phase I.1: 월별 일정 안내 SMS 발송 모달 ('YYYY-MM' 또는 null)
  const [monthlyNotifyMonth, setMonthlyNotifyMonth] = useState<string | null>(null)
  // Phase I.1-rev: 결제 안내 SMS 발송 모달 (BillingNotifyModal)
  const [billingNotifyMonth, setBillingNotifyMonth] = useState<string | null>(null)

  // Phase C: 실데이터 fetch
  const [fetchedPeriods, setFetchedPeriods] = useState<PeriodBundle[] | null>(null)
  const [availableAssignees, setAvailableAssignees] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    if (!customerId) { setFetchedPeriods(null); return }
    setLoading(true)
    const yearToFetch = isAnnual ? currentYear : selectedYear
    const cycleParam = isAnnual ? '연간' : '월간'
    fetch(`/api/admin/customers/${customerId}/regular-progress?year=${yearToFetch}&cycle=${encodeURIComponent(cycleParam)}`)
      .then(res => res.ok ? res.json() : Promise.reject(new Error('fetch 실패')))
      .then((data: {
        periods: PeriodBundle[]
        availableAssignees?: { id: string; name: string }[]
      }) => {
        setFetchedPeriods(data.periods ?? [])
        setAvailableAssignees(data.availableAssignees ?? [])
      })
      .catch(() => setFetchedPeriods([]))
      .finally(() => setLoading(false))
  }, [customerId, selectedYear, isAnnual, currentYear, refreshTick])

  // 투입일정 삭제 — 관리자·고객·작업자 모든 화면에서 사라지도록
  // service_applications soft delete + service_schedules cascade + work_assignments hard delete
  // (DELETE /api/admin/applications 가 전부 처리)
  async function handleVisitDelete(id: string, date: string, worker: string) {
    if (typeof window === 'undefined') return
    const ok = window.confirm(
      `${date} (${worker}) 투입일정을 삭제하시겠습니까?\n` +
      `관리자·고객·작업자 모든 화면에서 사라지며, 작업자 배정은 영구 삭제됩니다.`
    )
    if (!ok) return
    try {
      const res = await fetch(`/api/admin/applications?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        window.alert(`삭제 실패: ${data?.error ?? res.statusText}`)
        return
      }
      setRefreshTick(t => t + 1)
    } catch (e) {
      window.alert(`삭제 실패: ${e instanceof Error ? e.message : '네트워크 오류'}`)
    }
  }

  // 실데이터 있으면 실데이터, 없으면 Mock (customerId 미제공 등 fallback)
  const periods = useMemo<PeriodBundle[]>(() => {
    if (fetchedPeriods !== null) return fetchedPeriods
    if (isAnnual) return buildMockAnnual(currentYear)
    return buildMockMonthlyYear(selectedYear, currentYear, currentMonth)
  }, [fetchedPeriods, isAnnual, selectedYear, currentYear, currentMonth])

  const isMockMode = fetchedPeriods === null

  // 총괄 알림 발송 이력 집계 (최신순)
  const allNotifications = useMemo(() => {
    const flat: Array<{ type: string; sent_at: string; visitDate: string }> = []
    for (const p of periods) {
      for (const v of p.visits) {
        if (!Array.isArray(v.notificationLog)) continue
        for (const log of v.notificationLog) {
          if (log?.type && log?.sent_at) {
            flat.push({ type: log.type, sent_at: log.sent_at, visitDate: v.date })
          }
        }
      }
    }
    return flat.sort((a, b) => b.sent_at.localeCompare(a.sent_at))
  }, [periods])

  const togglePeriod = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const timelineUnit = isAnnual ? '연도' : '월'
  const timelineTitle = isAnnual
    ? '📊 3년 타임라인 (연간 결제)'
    : `📊 ${selectedYear}년 월별 타임라인`

  return (
    <>
    <div className="rounded-2xl border border-brand-200 overflow-hidden bg-white">
      {/* ─── 헤더: 계약 요약 + 연도 토글(월간만) ───────── */}
      <div className="px-4 py-3 border-b border-brand-100 bg-brand-50/40">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-sm font-bold text-text-primary">📊 진행 흐름</span>
            <span className="text-text-tertiary">·</span>
            <span className="text-xs font-semibold text-brand-700">{customerType}</span>
            {billingCycle && (
              <>
                <span className="text-text-tertiary">·</span>
                <span className="text-xs text-text-secondary">{billingCycle} 결제</span>
              </>
            )}
            {billingAmount && (
              <>
                <span className="text-text-tertiary">·</span>
                <span className="text-xs font-bold text-brand-700">
                  {billingAmount.toLocaleString('ko-KR')}원
                </span>
              </>
            )}
          </div>
          {!isAnnual && (
            <div className="inline-flex items-center gap-0.5 bg-white border border-brand-200 rounded-lg p-0.5">
              {availableYears.map(y => (
                <button
                  key={y}
                  onClick={() => setSelectedYear(y)}
                  className={`
                    px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors duration-150
                    ${y === selectedYear
                      ? 'bg-brand-500 text-white'
                      : 'text-text-secondary hover:bg-brand-50'}
                  `}
                >
                  {y}
                </button>
              ))}
            </div>
          )}
        </div>
        {businessName && (
          <p className="text-[11px] text-text-tertiary mt-1">
            {businessName}
            {loading && ' · 데이터 불러오는 중...'}
            {isMockMode && !loading && ' · 샘플 데이터 표시 (customerId 미연결)'}
          </p>
        )}
      </div>

      {/* ─── 타임라인 2트랙 ──────────────────────────── */}
      <div className="px-4 py-3 border-b border-brand-100">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-[11px] font-semibold text-text-secondary">{timelineTitle}</h3>
          <div className="hidden sm:flex items-center gap-2 text-[10px] text-text-tertiary">
            <LegendDot color="bg-emerald-500" label="완료" />
            <LegendDot color="bg-amber-400"  label="대기" />
            <LegendDot color="bg-rose-500"   label="지연" />
            <LegendDot color="bg-slate-200"  label="미생성" />
          </div>
        </div>

        <div className="space-y-2">
          <TimelineTrack
            icon={<Wallet size={12} />}
            label="결제"
            periods={periods}
            selector={(p) => billingStatusOf(p.billings)}
            colors={BILLING_COLORS}
            onPeriodClick={(key) => togglePeriod(key)}
          />
          <TimelineTrack
            icon={<Users size={12} />}
            label="투입"
            periods={periods}
            selector={(p) => visitStatusOf(p.visits)}
            colors={VISIT_COLORS}
            onPeriodClick={(key) => togglePeriod(key)}
          />
        </div>
      </div>

      {/* ─── 알림 발송 이력 (총괄 마스터) ─────────────── */}
      <div className="px-4 py-2.5 border-b border-brand-100 bg-slate-50/30">
        <button
          type="button"
          onClick={() => setShowNotifHistory(v => !v)}
          className="w-full flex items-center gap-2 py-0.5 text-[11px] font-semibold text-text-secondary hover:text-text-primary transition-colors"
        >
          <span>📜 알림 발송 이력</span>
          <span className="text-text-tertiary font-normal">({allNotifications.length}건)</span>
          <span className="ml-auto">
            {showNotifHistory ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </button>
        {showNotifHistory && (
          <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
            {allNotifications.length === 0 ? (
              <p className="text-[11px] text-text-tertiary py-2 pl-5">
                아직 발송된 알림이 없습니다.
              </p>
            ) : (
              allNotifications.slice(0, 50).map((n, i) => (
                <NotifHistoryRow key={i} notification={n} />
              ))
            )}
            {allNotifications.length > 50 && (
              <p className="text-[10px] text-text-tertiary text-center pt-1">
                최근 50건만 표시 (전체 {allNotifications.length}건)
              </p>
            )}
          </div>
        )}
      </div>

      {/* ─── 월별 상세 카드 ──────────────────────────── */}
      <div className="px-4 py-3 bg-slate-50/40 space-y-1.5">
        <h3 className="text-[11px] font-semibold text-text-secondary mb-1">
          📅 {timelineUnit}별 상세
        </h3>
        {periods.map(p => {
          const isOpen = expanded.has(p.key)
          const bStatus = billingStatusOf(p.billings)
          const vStatus = visitStatusOf(p.visits)
          const bColor = BILLING_COLORS[bStatus]
          const vColor = VISIT_COLORS[vStatus]
          const isCurrent = p.month !== null
            ? (p.year === currentYear && p.month === currentMonth)
            : (p.year === currentYear)
          return (
            <article
              key={p.key}
              className={`
                bg-white rounded-xl border overflow-hidden transition-shadow duration-150
                ${isCurrent ? 'border-brand-300 shadow-sm' : 'border-gray-200 hover:shadow-sm'}
              `}
            >
              <button
                onClick={() => togglePeriod(p.key)}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-50 transition-colors duration-150"
              >
                <span className="text-text-tertiary">
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <span className={`text-xs font-semibold ${isCurrent ? 'text-brand-700' : 'text-text-primary'}`}>
                  {/* 2026-10-19: 연간(p.month===null) 은 label 이 이미 'YYYY년' 이라 year 중복 제거 */}
                  {p.month !== null ? `${p.year}년 ${p.label}` : p.label}
                </span>
                {isCurrent && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-100 text-brand-700">
                    이번 {timelineUnit}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                  <StatusBadge icon={<Wallet size={10} />} color={bColor} count={p.billings.length} />
                  <StatusBadge icon={<Users size={10} />} color={vColor} count={p.visits.length} />
                </div>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 pt-0 space-y-3 border-t border-gray-100">
                  {/* Phase I.1 + I.1-rev: 월별 SMS 발송 버튼 2종 (결제 안내 위, 일정 안내 아래) */}
                  {p.month !== null && customerId && (
                    <div className="pt-3 space-y-1.5">
                      <button
                        type="button"
                        onClick={() => setBillingNotifyMonth(p.key)}
                        className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                      >
                        💰 {p.month}월 결제 안내 SMS (미리보기)
                      </button>
                      <button
                        type="button"
                        onClick={() => setMonthlyNotifyMonth(p.key)}
                        className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold text-brand-700 border border-brand-200 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors"
                      >
                        📱 {p.month}월 일정 안내 SMS 발송
                      </button>
                    </div>
                  )}
                  <SubSection
                    icon={<Wallet size={11} />}
                    title="결제이력"
                    count={p.billings.length}
                    empty="아직 생성되지 않은 결제입니다."
                  >
                    {p.billings.map(b => (
                      <BillingRow
                        key={b.id}
                        item={b}
                        onClick={() => setBillingModalData({
                          id: b.id,
                          billingType: b.billingType ?? 'monthly',
                          billingPeriod: b.billingPeriod ?? '',
                          amount: b.amount,
                          dueDate: b.dueDate,
                          paidDate: b.paidDate,
                          status: b.status,
                          taxInvoiceIssued: b.taxInvoiceIssued ?? false,
                          paymentUrl: b.paymentUrl,
                        })}
                      />
                    ))}
                    {/* Phase H.5: 추가 결제 수동 생성 */}
                    <button
                      type="button"
                      onClick={() => setBillingModalData({
                        id: '',  // 빈 id = 신규 생성 모드
                        billingType: 'onetime',
                        billingPeriod: p.key,
                        amount: 0,
                        dueDate: new Date().toISOString().slice(0, 10),
                        status: 'pending',
                        taxInvoiceIssued: false,
                      })}
                      className="w-full py-1.5 text-[10px] font-semibold text-brand-700 border border-dashed border-brand-200 bg-brand-50/40 rounded-lg hover:bg-brand-50 transition-colors"
                    >
                      + 결제 추가
                    </button>
                  </SubSection>
                  <SubSection
                    icon={<Users size={11} />}
                    title="투입일정"
                    count={p.visits.length}
                    empty="아직 생성되지 않은 방문입니다."
                  >
                    {p.visits.map(v => {
                      const weekday = ['일','월','화','수','목','금','토'][new Date(v.date).getDay()]
                      return (
                        <VisitRow
                          key={v.id}
                          item={v}
                          onClick={() => setVisitModalData({
                            id: v.id,
                            date: v.date,
                            weekday,
                            worker: v.worker,
                            assignedTo: v.assignedTo,
                            additionalWorkers: [],
                            constructionTime: v.constructionTime ?? '',
                            progressStatus: v.progressStatus
                              ?? (v.status === 'done' ? '작업완료'
                                : v.status === 'canceled' ? '취소' : '예정'),
                            paymentStatus: v.paymentStatus ?? '미정',
                            careScope: v.careScope ?? '',
                            adminRequest: v.adminRequest ?? '',
                            adminMemo: v.adminMemo ?? '',
                            notificationSent: v.notificationSent ?? (v.status === 'done'),
                            depositPaidAt: v.depositPaidAt,
                            workCompletedAt: v.workCompletedAt,
                            balancePaidAt: v.balancePaidAt,
                            taxInvoiceIssued: v.taxInvoiceIssued,
                            notificationLog: v.notificationLog,
                          })}
                          onDelete={() => handleVisitDelete(v.id, v.date, v.worker)}
                        />
                      )
                    })}
                  </SubSection>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </div>

    <VisitDetailModal
      open={visitModalData !== null}
      onClose={() => setVisitModalData(null)}
      data={visitModalData}
      availableAssignees={availableAssignees}
      onSave={async (id, patch) => {
        const res = await fetch('/api/admin/applications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...patch }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err?.error ?? '저장 실패')
        }
        setRefreshTick(t => t + 1)
      }}
    />

    <BillingDetailModal
      open={billingModalData !== null}
      onClose={() => setBillingModalData(null)}
      data={billingModalData}
      onSave={async (id, patch) => {
        const res = await fetch('/api/admin/billings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...patch }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err?.error ?? '저장 실패')
        }
        setRefreshTick(t => t + 1)
      }}
      onDelete={async (id) => {
        const res = await fetch(`/api/admin/billings?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err?.error ?? '삭제 실패')
        }
        setRefreshTick(t => t + 1)
      }}
      onCreate={async (payload) => {
        if (!customerId) throw new Error('고객 ID 가 없습니다.')
        const res = await fetch('/api/admin/billings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: customerId,
            billing_type: payload.billingType,
            billing_period: payload.billingPeriod,
            amount: payload.amount,
            due_date: payload.dueDate,
            status: payload.status,
            tax_invoice_issued: payload.taxInvoiceIssued,
            service_type: customerType,
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err?.error ?? '추가 실패')
        }
        setRefreshTick(t => t + 1)
      }}
    />

    {/* Phase I.1: 월별 일정 안내 SMS 발송 모달 (레거시 MonthlyScheduleNotifyModal 재사용) */}
    {monthlyNotifyMonth && customerId && (
      <MonthlyScheduleNotifyModal
        customerId={customerId}
        businessName={businessName ?? ''}
        customerType={customerType}
        initialMonth={monthlyNotifyMonth}
        onClose={() => setMonthlyNotifyMonth(null)}
        onSent={() => {
          setMonthlyNotifyMonth(null)
          setRefreshTick(t => t + 1)
        }}
      />
    )}

    {/* Phase I.1-rev: 결제 안내 SMS 발송 모달 (텍스트 미리보기 포함) */}
    {billingNotifyMonth && customerId && (
      <BillingNotifyModal
        customerId={customerId}
        month={billingNotifyMonth}
        customerName={businessName ?? ''}
        customerType={customerType}
        onClose={() => setBillingNotifyMonth(null)}
        onSent={() => {
          setBillingNotifyMonth(null)
          setRefreshTick(t => t + 1)
        }}
      />
    )}
    </>
  )
}

// ─── 서브 컴포넌트 ────────────────────────────────────────────

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`w-1.5 h-1.5 rounded-full ${color}`}></span>
      {label}
    </span>
  )
}

function TimelineTrack({
  icon, label, periods, selector, colors, onPeriodClick,
}: {
  icon: React.ReactNode
  label: string
  periods: PeriodBundle[]
  selector: (p: PeriodBundle) => BillingStatus | VisitStatus
  colors: Record<string, StatusColor>
  onPeriodClick: (key: string) => void
}) {
  const cols = periods.length
  const gridClass = cols === 3 ? 'grid-cols-3' : 'grid-cols-12'
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 w-12 shrink-0 text-[11px] font-semibold text-text-secondary">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`flex-1 grid ${gridClass} gap-1`}>
        {periods.map(p => {
          const status = selector(p)
          const color = colors[status]
          return (
            <button
              key={p.key}
              onClick={() => onPeriodClick(p.key)}
              title={`${p.year}년 ${p.label} · ${color.label}`}
              className="group flex flex-col items-center gap-0.5 py-1 rounded hover:bg-slate-100 transition-colors duration-150"
            >
              <span className={`
                w-3 h-3 rounded-full ${color.dot}
                ring-2 ring-white group-hover:scale-125 transition-transform duration-150
              `}></span>
              <span className="text-[9px] text-text-tertiary">{p.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StatusBadge({ icon, color, count }: {
  icon: React.ReactNode
  color: StatusColor
  count: number
}) {
  const text = count > 0 ? `${count}건 ${color.label}` : color.label
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${color.bg} ${color.text}`}>
      {icon}
      {text}
    </span>
  )
}

function SubSection({ icon, title, count, empty, children }: {
  icon: React.ReactNode
  title: string
  count: number
  empty: string
  children: React.ReactNode
}) {
  return (
    <div className="pt-2.5">
      <h4 className="text-[11px] font-semibold text-text-secondary mb-1.5 flex items-center gap-1">
        {icon} {title} ({count}건)
      </h4>
      {count === 0 ? (
        <p className="text-[11px] text-text-tertiary py-1.5 pl-4">{empty}</p>
      ) : (
        <div className="space-y-1">{children}</div>
      )}
    </div>
  )
}

function BillingRow({ item, onClick }: { item: BillingItem; onClick?: () => void }) {
  const color = BILLING_COLORS[item.status]
  const icon = item.status === 'paid'
    ? <Check size={12} />
    : item.status === 'overdue'
    ? <AlertCircle size={12} />
    : <Clock size={12} />
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 bg-slate-50 rounded-lg border border-gray-100 hover:bg-white hover:border-brand-200 hover:shadow-sm transition-all duration-150 text-left cursor-pointer"
    >
      <span className={`flex items-center justify-center w-6 h-6 rounded-full ${color.bg} ${color.text}`}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-text-primary truncate">{item.label}</p>
        <p className="text-[10px] text-text-tertiary">
          기한 {item.dueDate}
          {item.paidDate && ` · 완료 ${item.paidDate}`}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-bold text-text-primary">
          {item.amount.toLocaleString('ko-KR')}원
        </p>
        <p className={`text-[10px] font-semibold ${color.text}`}>{color.label}</p>
      </div>
    </button>
  )
}

function VisitRow({ item, onClick, onDelete }: {
  item: VisitItem
  onClick?: () => void
  onDelete?: () => void
}) {
  const color = VISIT_COLORS[item.status]
  const icon = item.status === 'done'
    ? <Check size={12} />
    : item.status === 'canceled'
    ? <AlertCircle size={12} />
    : <Clock size={12} />
  const weekday = ['일','월','화','수','목','금','토'][new Date(item.date).getDay()]
  return (
    // 외부 div로 감싸 메인 영역 + 삭제 버튼을 형제 button 으로 배치
    // (button 중첩 방지)
    <div className="w-full flex items-stretch gap-1">
      <button
        type="button"
        onClick={onClick}
        className="flex-1 flex flex-col gap-1.5 px-2.5 py-2 bg-slate-50 rounded-lg border border-gray-100 hover:bg-white hover:border-brand-200 hover:shadow-sm transition-all duration-150 text-left cursor-pointer"
      >
        {/* 상단: 날짜·작업자·상태 */}
        <div className="flex items-center gap-2.5 w-full">
          <span className={`flex items-center justify-center w-6 h-6 rounded-full ${color.bg} ${color.text}`}>
            {icon}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text-primary">
              {item.date} ({weekday})
            </p>
            <p className="text-[10px] text-text-tertiary">작업자 {item.worker}</p>
          </div>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${color.bg} ${color.text}`}>
            {color.label}
          </span>
        </div>
        {/* 하단: 미니 진행흐름 (Phase G1-row + H.5-rev) */}
        {/* 정기케어의 "잔금" 은 월 service_billings.status='paid' 와 동기화 (monthlyBillingPaid) */}
        <div className="flex items-center gap-1 pl-8 flex-wrap">
          <MiniStep done={!!item.depositPaidAt}        label="예약금" />
          <MiniStep done={!!item.workCompletedAt}      label="작업" />
          <MiniStep done={!!item.balancePaidAt || !!item.monthlyBillingPaid} label="잔금" />
          <MiniStep done={item.taxInvoiceIssued === true} label="계산서" />
        </div>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 flex items-center justify-center w-8 bg-slate-50 rounded-lg border border-gray-100 text-text-tertiary hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors"
          aria-label="투입일정 삭제"
          title="이 투입일정 삭제 (관리자·고객·작업자 모든 화면에서 사라집니다)"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
}

function NotifHistoryRow({ notification }: {
  notification: { type: string; sent_at: string; visitDate: string }
}) {
  const dateLabel = (() => {
    try {
      return new Date(notification.sent_at).toLocaleString('ko-KR', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    } catch { return notification.sent_at.slice(0, 16).replace('T', ' ') }
  })()
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 bg-white rounded-md border border-gray-100">
      <Check size={11} className="text-teal-600 shrink-0" />
      <span className="text-[11px] font-medium text-text-primary flex-1 truncate">
        {notification.type}
      </span>
      <span className="text-[10px] text-text-tertiary shrink-0">
        {notification.visitDate} 방문
      </span>
      <span className="text-[10px] text-text-tertiary shrink-0">
        · {dateLabel}
      </span>
    </div>
  )
}

function MiniStep({ done, label }: { done: boolean; label: string }) {
  return (
    <span
      title={`${label}: ${done ? '완료' : '대기'}`}
      className={`inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded font-semibold ${
        done
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-gray-100 text-gray-400'
      }`}
    >
      {done ? '✓' : '○'} {label}
    </span>
  )
}
