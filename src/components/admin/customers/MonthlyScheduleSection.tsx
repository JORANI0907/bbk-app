'use client'

import { useState, useEffect, useCallback } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { ScheduleAccordionRow, ScheduleAppRow } from './ScheduleAccordionRow'

interface UserLite { id: string; name: string }
interface WorkerLite { id: string; name: string }

interface Props {
  /** Phase 22 v8: customer_id 최우선 매칭 — 같은 phone/business_name을 공유하는 다른 유형 계약과 안전 분리 */
  customerId?: string | null
  /** 고객사명 (customer_id 없을 때 fallback) */
  businessName: string
  /** 고객 연락처 (customer_id 없을 때 fallback) */
  phone: string
  /** 담당자 후보 */
  users: UserLite[]
  /** 작업자 후보 */
  workers: WorkerLite[]
  /** Phase 27: 캘린더에서 진입 시 특정 월로 자동 이동 (YYYY-MM). 미지정 시 현재 월 */
  initialMonth?: string
  /** Phase 27: 캘린더에서 진입 시 이 application의 아코디언을 자동으로 펼침 */
  focusApplicationId?: string | null
  /** Phase 27-AI: 고객 마스터 Drive 폴더 URL — 회차 폴더를 그 하위로 생성 */
  parentDriveFolderUrl?: string | null
  /** Phase 27-AN: 고객 유형 (정기딥/엔드) → 각 회차 dropdown 이 유형별 템플릿만 노출 */
  customerType?: string | null
}

function currentMonthStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmtMonth(monthStr: string): string {
  const [y, m] = monthStr.split('-')
  return `${y}년 ${parseInt(m, 10)}월`
}

/**
 * Phase 2: 고객 상세페이지 내 "이번달 일정" 섹션.
 * 해당 고객의 service_applications를 월 단위로 조회하고 아코디언 편집 UI를 제공.
 */
export function MonthlyScheduleSection({ customerId, businessName, phone, users, workers, initialMonth, focusApplicationId, parentDriveFolderUrl, customerType }: Props) {
  const [month, setMonth] = useState(initialMonth ?? currentMonthStr())

  // Phase 27: initialMonth가 나중에 바뀌면 (예: 캘린더에서 다른 월 회차 선택) 그 월로 이동
  useEffect(() => {
    if (initialMonth && initialMonth !== month) {
      setMonth(initialMonth)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMonth])
  const [apps, setApps] = useState<ScheduleAppRow[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!customerId && !phone && !businessName) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ month })
      // Phase 22 v8: customer_id 최우선 (같은 phone 공유하는 다른 유형 계약 분리 안전)
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
  }, [month, customerId, phone, businessName])

  useEffect(() => { load() }, [load])

  const handleOptimisticUpdate = (id: string, patch: Partial<ScheduleAppRow>) => {
    setApps(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))
  }

  // Phase 7-K: 개별 일정 삭제 후 리스트에서 옵티미스틱 제거 (자식 row가 API 호출 완료 후 콜)
  const handleDeleted = (id: string) => {
    setApps(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="border-2 border-brand-200 rounded-xl p-3 bg-brand-50/40">
      {/* Phase 22: 이번달 일정 섹션 — 파스텔 cyan 테두리+배경 (다른 섹션과 시각 구분) */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-brand-700" />
          <p className="text-xs font-semibold text-brand-900 uppercase tracking-wide">
            이번달 일정
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="w-6 h-6 flex items-center justify-center rounded-md text-text-secondary hover:bg-surface-sunken"
            aria-label="지난달"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs font-medium text-text-primary w-20 text-center">
            {fmtMonth(month)}
          </span>
          <button
            onClick={() => setMonth(shiftMonth(month, 1))}
            className="w-6 h-6 flex items-center justify-center rounded-md text-text-secondary hover:bg-surface-sunken"
            aria-label="다음달"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* 본문 */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-text-tertiary">
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : apps.length === 0 ? (
        <div className="text-center py-6 text-xs text-text-tertiary bg-surface-sunken/40 rounded-xl">
          이 달에 예정된 일정이 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {apps.map(app => (
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
      )}
    </div>
  )
}
