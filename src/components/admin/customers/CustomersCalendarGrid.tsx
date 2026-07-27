'use client'

/**
 * Phase 27: 고객관리 탭의 월별 캘린더 뷰.
 *
 * 배정관리 캘린더와 동일 데이터 소스(service_applications)를 사용하지만,
 * 셀 클릭 시 신청서 상세가 아니라 해당 고객(customer_id)의 세부화면을 오픈하고
 * 정기딥/엔드케어의 경우 이번달 일정 섹션의 해당 회차 아코디언이 자동으로 펼쳐진다.
 *
 * 사용자 확정 규칙:
 * - customer_id NULL(미등록 신청서)은 캘린더에 표시 안 함
 * - 일반일정 유형은 표시
 * - 다음달 미리보기 없음
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { getScheduleToday } from '@/lib/schedule-today'
import { computeAppAmount, fmtAmount } from './calendar-amount'

// ─── 타입 ─────────────────────────────────────────────────────

export interface CalendarApp {
  id: string
  customer_id: string | null
  business_name: string
  service_type: string | null
  construction_date: string | null
  status: string | null
  address: string | null
  assigned_to: string | null
  // Phase 27-E: 금액 계산용 필드
  supply_amount?: number | null
  vat?: number | null
  payment_method?: string | null
  // Phase 27-G: customer_id NULL 케이스에서 신청서를 customer-like로 변환 시 사용
  owner_name?: string | null
  phone?: string | null
  phone_2?: string | null
  email?: string | null
  business_number?: string | null
  account_number?: string | null
  platform_nickname?: string | null
  elevator?: string | null
  building_access?: string | null
  access_method?: string | null
  business_hours_start?: string | null
  business_hours_end?: string | null
  parking?: string | null
  request_notes?: string | null
  admin_notes?: string | null
  admin_request_notes?: string | null
  care_scope?: string | null
  construction_time?: string | null
  deposit?: number | null
  balance?: number | null
  drive_folder_url?: string | null
}

interface Props {
  /** 클릭한 회차의 customer_id로 세부화면 열기 (부모가 처리) */
  onSelectApp: (app: CalendarApp) => void
  /**
   * Phase 27-C: 리스트 상단 유형 필터를 공유.
   * 비어있으면 전체 표시, 값이 있으면 service_type이 이 Set에 있는 것만.
   * 리스트뷰와 캘린더뷰 간 필터 상태 유지되어 UX 통일.
   */
  filterTypes?: Set<string>
}

// ─── 유틸 ─────────────────────────────────────────────────────

function currentYearMonth(): { year: number; month: number } {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() }
}

function toMonthStr(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function fmtMonthKr(year: number, month: number): string {
  return `${year}년 ${month + 1}월`
}

const DAYS_KR = ['일', '월', '화', '수', '목', '금', '토']

// 유형별 색상 (CustomersManagementView와 일관성 유지)
const TYPE_ROW_BG: Record<string, string> = {
  '1회성케어':    'bg-emerald-50 border-emerald-200',
  '정기딥케어':   'bg-cyan-50 border-cyan-200',
  '정기엔드케어': 'bg-purple-50 border-purple-200',
  '일반일정':     'bg-stone-50 border-stone-200',
}
const TYPE_TEXT: Record<string, string> = {
  '1회성케어':    'text-emerald-800',
  '정기딥케어':   'text-cyan-800',
  '정기엔드케어': 'text-purple-800',
  '일반일정':     'text-stone-700',
}

// ─── 컴포넌트 ─────────────────────────────────────────────────

export function CustomersCalendarGrid({ onSelectApp, filterTypes }: Props) {
  const [{ year, month }, setYm] = useState(currentYearMonth())
  const [apps, setApps] = useState<CalendarApp[]>([])
  const [loading, setLoading] = useState(false)
  const [modalDate, setModalDate] = useState<string | null>(null)

  const monthStr = toMonthStr(year, month)

  // Phase 27-C: 유형 필터 적용 (비어있으면 전체)
  const visibleApps = useMemo(() => {
    if (!filterTypes || filterTypes.size === 0) return apps
    return apps.filter(a => a.service_type && filterTypes.has(a.service_type))
  }, [apps, filterTypes])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Phase 27-B: 배정관리 Phase 9-E와 동일한 병합 규칙
      //   (1) service_applications 월별 — 정상 신청서(1회성/정기딥/정기엔드/일반일정)
      //   (2) customers 테이블 — service_applications 없는 신규 1회성 (관리자 직접 등록)
      //   business_name + 날짜 조합으로 중복 제거
      const [appsRes, custRes] = await Promise.all([
        fetch(`/api/admin/applications?month=${monthStr}`),
        fetch('/api/admin/customers'),
      ])
      if (!appsRes.ok) {
        const body = await appsRes.json().catch(() => ({}))
        throw new Error(body?.error ?? '신청서 조회 실패')
      }
      const appsBody = await appsRes.json()
      const rawApps = (appsBody.applications ?? []) as CalendarApp[]
      // Phase 27-D: customer_id NULL도 포함 (신청서 유입 회차 — 아직 고객 등록 안 된 상태).
      // 시공일자(construction_date)가 있는 회차는 실제 스케줄된 작업이므로 캘린더에 반드시 표시.
      // 셀 클릭 시 customer_id 없으면 '서비스관리 탭에서 확인' 안내로 처리.
      const filteredApps = rawApps.filter(a => !!a.construction_date)

      // 병합용 기존 키 세트 (business_name::YYYY-MM-DD)
      const existingKeys = new Set(
        filteredApps.map(a => `${a.business_name}::${a.construction_date!.slice(0, 10)}`),
      )

      // customers 조회 — 신규 1회성 병합용 (custRes 실패해도 신청서 뷰는 정상 표시)
      let mergedCustomers: CalendarApp[] = []
      if (custRes.ok) {
        const custBody = await custRes.json()
        type CustRow = {
          id: string
          business_name: string
          customer_type: string | null
          next_visit_date: string | null
          address: string | null
          assigned_user_id: string | null
        }
        const custs = ((custBody.customers ?? []) as CustRow[])
        const [y, m] = monthStr.split('-').map(Number)
        const monthStart = `${monthStr}-01`
        const nextMonth = m === 12 ? `${y + 1}-01-01` : `${monthStr.slice(0, 5)}${String(m + 1).padStart(2, '0')}-01`

        mergedCustomers = custs
          .filter(c =>
            c.customer_type === '1회성케어' &&
            c.next_visit_date &&
            c.next_visit_date >= monthStart &&
            c.next_visit_date < nextMonth &&
            !existingKeys.has(`${c.business_name}::${c.next_visit_date.slice(0, 10)}`),
          )
          .map(c => ({
            // customer: 접두사로 마킹 — 셀 클릭 시 customer_id로 세부화면 열기 (기존 로직 그대로 동작)
            id: `customer:${c.id}`,
            customer_id: c.id,
            business_name: c.business_name,
            service_type: '1회성케어',
            construction_date: c.next_visit_date,
            status: null,
            address: c.address,
            assigned_to: c.assigned_user_id,
          }))
      }

      setApps([...filteredApps, ...mergedCustomers])
    } catch (e) {
      toast.error(`캘린더 조회 실패: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }, [monthStr])

  useEffect(() => { load() }, [load])

  // 날짜별로 그룹핑 (필터 적용된 visibleApps 기준)
  const dayMap = useMemo(() => {
    const map: Record<string, CalendarApp[]> = {}
    for (const a of visibleApps) {
      if (!a.construction_date) continue
      const d = a.construction_date.slice(0, 10)
      if (!map[d]) map[d] = []
      map[d].push(a)
    }
    return map
  }, [visibleApps])

  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = getScheduleToday()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  // Phase 27-E: 7개씩 주 단위로 배열 분할 (각 주 하단에 합계 라인 삽입 위함)
  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    const wk = cells.slice(i, i + 7)
    while (wk.length < 7) wk.push(null)
    weeks.push(wk)
  }

  // Phase 27-E: 금액 매핑 (일자 기준)
  const dayAmountMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const a of visibleApps) {
      if (!a.construction_date) continue
      const d = a.construction_date.slice(0, 10)
      map[d] = (map[d] ?? 0) + computeAppAmount(a)
    }
    return map
  }, [visibleApps])

  const monthAmount = useMemo(() =>
    visibleApps.reduce((s, a) => s + computeAppAmount(a), 0)
  , [visibleApps])

  const prevMonth = () => {
    setYm(prev => {
      const d = new Date(prev.year, prev.month - 1, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }
  const nextMonth = () => {
    setYm(prev => {
      const d = new Date(prev.year, prev.month + 1, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }
  const goToday = () => setYm(currentYearMonth())

  const totalCount = visibleApps.length
  const filteredIndicator = filterTypes && filterTypes.size > 0
    ? ` (${Array.from(filterTypes).join(',')})`
    : ''

  return (
    <div className="space-y-3">
      {/* 헤더: 월 이동 + 오늘 + 카운트 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="w-8 h-8 flex items-center justify-center rounded-md text-text-secondary hover:bg-surface-sunken"
            aria-label="지난달"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-text-primary w-24 text-center">
            {fmtMonthKr(year, month)}
          </span>
          <button
            onClick={nextMonth}
            className="w-8 h-8 flex items-center justify-center rounded-md text-text-secondary hover:bg-surface-sunken"
            aria-label="다음달"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={goToday}
            className="ml-1 text-xs px-2.5 py-1 rounded-md border border-border text-text-secondary hover:bg-surface-sunken"
          >
            오늘
          </button>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 size={14} className="animate-spin text-text-tertiary" />}
          <span className="text-xs text-text-tertiary">
            이번달 <b className="text-text-primary">{totalCount}</b>건
            {filteredIndicator && <span className="text-brand-600 ml-1">{filteredIndicator}</span>}
          </span>
        </div>
      </div>

      {/* 캘린더 그리드 */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border-subtle">
          {DAYS_KR.map(d => (
            <div key={d} className={`text-center py-2.5 text-xs font-semibold
              ${d === '일' ? 'text-red-500' : d === '토' ? 'text-brand-500' : 'text-text-secondary'}`}>
              {d}
            </div>
          ))}
        </div>
        {/* Phase 27-E: 주별 렌더링 — 각 주 하단에 얇은 합계 라인 삽입 */}
        {weeks.map((week, wIdx) => {
          // 주 범위 계산 (첫날~마지막날) + 주간 합계
          const validDays = week.filter((d): d is number => d !== null)
          const first = validDays[0]
          const last = validDays[validDays.length - 1]
          const weekAmount = validDays.reduce((sum, d) => {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
            return sum + (dayAmountMap[dateStr] ?? 0)
          }, 0)
          const rangeLabel = first && last
            ? `${month + 1}.${first} ~ ${month + 1}.${last}`
            : ''

          return (
            <div key={wIdx}>
              <div className="grid grid-cols-7 auto-rows-[5rem] sm:auto-rows-[7rem]">
                {week.map((day, i) => {
                  if (!day) {
                    return <div key={`e-${wIdx}-${i}`} className="border-r border-b border-border-subtle bg-surface-sunken/40" />
                  }
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const dayApps = dayMap[dateStr] ?? []
                  const dayAmount = dayAmountMap[dateStr] ?? 0
                  const isToday = dateStr === todayStr
                  const dow = i
                  const hasApps = dayApps.length > 0

                  return (
                    <div
                      key={day}
                      onClick={() => hasApps && setModalDate(dateStr)}
                      className={`border-r border-b border-border-subtle p-1.5 flex flex-col gap-0.5
                        ${isToday ? 'bg-brand-50' : (dow === 0 || dow === 6) ? 'bg-surface-sunken/50' : ''}
                        ${hasApps ? 'cursor-pointer hover:bg-brand-50/40 transition-colors' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full shrink-0
                          ${isToday ? 'bg-brand-600 text-white' : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-brand-500' : 'text-text-primary'}`}>
                          {day}
                        </div>
                        {dayAmount > 0 && (
                          <span className="text-[9px] font-semibold text-emerald-700 leading-tight whitespace-nowrap truncate">
                            {dayAmount.toLocaleString('ko-KR')}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5 overflow-hidden">
                        {dayApps.slice(0, 3).map(app => {
                          const bg = TYPE_ROW_BG[app.service_type ?? ''] ?? 'bg-surface-sunken border-border-subtle'
                          const txt = TYPE_TEXT[app.service_type ?? ''] ?? 'text-text-primary'
                          return (
                            <div key={app.id}
                              className={`px-1.5 py-0.5 rounded-md border ${bg}`}>
                              <p className={`text-[10px] font-semibold truncate leading-tight ${txt}`}>
                                {app.business_name}
                              </p>
                            </div>
                          )
                        })}
                        {dayApps.length > 3 && (
                          <div className="text-[10px] text-text-tertiary px-1 font-medium">+{dayApps.length - 3}건</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              {weekAmount > 0 && (
                <div className="flex items-center justify-end px-3 py-1 border-b border-border-subtle bg-emerald-50/60">
                  <span className="text-[11px] font-semibold text-emerald-700">
                    {rangeLabel} · 총액 {fmtAmount(weekAmount)}
                  </span>
                </div>
              )}
            </div>
          )
        })}
        {/* 월간 총액 (푸터) */}
        {monthAmount > 0 && (
          <div className="flex justify-between items-center px-4 py-3 border-t border-border bg-emerald-50">
            <span className="text-sm font-bold text-emerald-800">{year}년 {month + 1}월 총액</span>
            <span className="text-sm font-bold text-emerald-700">{fmtAmount(monthAmount)}</span>
          </div>
        )}
      </div>

      {/* 일자별 모달 — 여러 건일 때 개별 선택 */}
      {modalDate && (
        <DayAppsModal
          dateStr={modalDate}
          apps={dayMap[modalDate] ?? []}
          onSelect={(app) => { setModalDate(null); onSelectApp(app) }}
          onClose={() => setModalDate(null)}
        />
      )}
    </div>
  )
}

// ─── 일자별 목록 모달 ─────────────────────────────────────────

function DayAppsModal({
  dateStr, apps, onSelect, onClose,
}: {
  dateStr: string
  apps: CalendarApp[]
  onSelect: (app: CalendarApp) => void
  onClose: () => void
}) {
  const date = new Date(dateStr + 'T00:00:00')
  const dow = DAYS_KR[date.getDay()]
  const label = `${date.getMonth() + 1}월 ${date.getDate()}일 (${dow})`

  // apps 1개면 자동 선택 (모달 스킵)
  useEffect(() => {
    if (apps.length === 1) {
      onSelect(apps[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (apps.length <= 1) return null

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-text-primary">{label} 일정</h3>
            <p className="text-[11px] text-text-tertiary">{apps.length}건</p>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary text-xl leading-none">×</button>
        </div>
        <div className="p-3 space-y-1.5 overflow-y-auto">
          {apps.map(app => {
            const bg = TYPE_ROW_BG[app.service_type ?? ''] ?? 'bg-surface-sunken border-border-subtle'
            const txt = TYPE_TEXT[app.service_type ?? ''] ?? 'text-text-primary'
            return (
              <button key={app.id}
                onClick={() => onSelect(app)}
                className={`w-full text-left border rounded-xl p-3 transition-all hover:brightness-95 ${bg}`}>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${txt} bg-white/60`}>
                    {app.service_type ?? '-'}
                  </span>
                  <span className={`text-sm font-semibold ${txt}`}>{app.business_name}</span>
                </div>
                {app.address && (
                  <p className="text-[11px] text-text-tertiary truncate">{app.address}</p>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
