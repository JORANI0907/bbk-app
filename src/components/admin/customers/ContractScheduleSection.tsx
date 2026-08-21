'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { CalendarDays, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { ScheduleAccordionRow, ScheduleAppRow } from './ScheduleAccordionRow'

interface UserLite { id: string; name: string }
interface WorkerLite { id: string; name: string }

interface Props {
  customerId?: string | null
  businessName: string
  phone: string
  users: UserLite[]
  workers: WorkerLite[]
  focusApplicationId?: string | null
  parentDriveFolderUrl?: string | null
  customerType?: string | null
}

/** '2026-08' → '2026년 8월' */
function fmtMonthLabel(key: string): string {
  const [y, m] = key.split('-')
  return `${y}년 ${parseInt(m, 10)}월`
}

/** ScheduleAppRow → 'YYYY-MM' (일자 미정은 '(미정)') */
function monthKeyOf(app: ScheduleAppRow): string {
  const d = app.construction_date
  if (!d) return '(미정)'
  return d.slice(0, 7)
}

/**
 * 정기딥케어 전용 "계약기간 투입 일정" 섹션.
 * MonthlyScheduleSection과 달리:
 *  - 월 이동 버튼 없음 → 계약기간 전체 일정 한 번에 조회
 *  - 상단 요약: 총 회수 · 완료 · 예정
 *  - 월별 그룹화 표시
 */
export function ContractScheduleSection({
  customerId, businessName, phone, users, workers,
  focusApplicationId, parentDriveFolderUrl, customerType,
}: Props) {
  const [apps, setApps] = useState<ScheduleAppRow[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!customerId && !phone && !businessName) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      // month 파라미터 없음 → 계약기간 전체 조회
      if (customerId) params.set('customer_id', customerId)
      else if (phone) params.set('phone', phone)
      else params.set('business_name', businessName)
      const res = await fetch(`/api/admin/applications?${params.toString()}`)
      if (!res.ok) throw new Error((await res.json()).error ?? '조회 실패')
      const body = await res.json()
      setApps(body.applications ?? [])
    } catch (e) {
      toast.error(`일정 조회 실패: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }, [customerId, phone, businessName])

  useEffect(() => { load() }, [load])

  const handleOptimisticUpdate = (id: string, patch: Partial<ScheduleAppRow>) => {
    setApps(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))
  }

  const handleDeleted = (id: string) => {
    setApps(prev => prev.filter(a => a.id !== id))
  }

  // 완료/예정 카운트 — completed_at 유무로 판단
  const { total, done, upcoming } = useMemo(() => {
    const total = apps.length
    const done = apps.filter(a => !!a.completed_at).length
    return { total, done, upcoming: total - done }
  }, [apps])

  // 월별 그룹화 (construction_date 오름차순 유지)
  const grouped = useMemo(() => {
    const map = new Map<string, ScheduleAppRow[]>()
    for (const app of apps) {
      const key = monthKeyOf(app)
      const arr = map.get(key)
      if (arr) arr.push(app)
      else map.set(key, [app])
    }
    // Map 삽입 순서 = construction_date asc 순서 → 자연스러운 시간순 그룹
    return Array.from(map.entries())
  }, [apps])

  return (
    <div className="border-2 border-purple-200 rounded-xl p-3 bg-purple-50/40">
      {/* 헤더: 타이틀 + 요약 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarDays size={14} className="text-purple-700" />
          <p className="text-xs font-semibold text-purple-900 uppercase tracking-wide">
            계약기간 투입 일정
          </p>
        </div>
        {!loading && total > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-text-primary">총 {total}회</span>
            <span className="text-text-tertiary">·</span>
            <span className="text-emerald-700">완료 {done}</span>
            <span className="text-text-tertiary">·</span>
            <span className="text-purple-700">예정 {upcoming}</span>
          </div>
        )}
      </div>

      {/* 본문 */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-text-tertiary">
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : total === 0 ? (
        <div className="text-center py-6 text-xs text-text-tertiary bg-surface-sunken/40 rounded-xl">
          생성된 일정이 없습니다. 방문 일정 섹션에서 [생성] 버튼을 눌러주세요.
        </div>
      ) : (
        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
          {grouped.map(([monthKey, monthApps]) => (
            <div key={monthKey} className="space-y-2">
              {/* 월 그룹 헤더 */}
              <div className="sticky top-0 z-10 bg-purple-50/95 backdrop-blur-sm py-1 flex items-center gap-2 border-b border-purple-100">
                <p className="text-xs font-bold text-purple-800">
                  {monthKey === '(미정)' ? '일자 미정' : fmtMonthLabel(monthKey)}
                </p>
                <span className="text-xs text-purple-600">
                  ({monthApps.length}회)
                </span>
              </div>

              {/* 월 내 회차 카드들 */}
              <div className="space-y-2">
                {monthApps.map(app => (
                  <ScheduleAccordionRow
                    key={app.id}
                    app={app}
                    users={users}
                    workers={workers}
                    onOptimisticUpdate={handleOptimisticUpdate}
                    onDelete={handleDeleted}
                    defaultExpanded={focusApplicationId === app.id}
                    parentDriveFolderUrl={parentDriveFolderUrl ?? null}
                    parentBusinessName={businessName}
                    customerType={customerType}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
