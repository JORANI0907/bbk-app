'use client'

/** 관리자 편집기용: 이 고객의 점검 기록을 불러와 품목별 상태표를 만든다 (2026-11-08) */

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import type { CareManualV2 } from '@/types/care-manual'
import type { CareCheck } from '@/lib/care-manual-status'
import { computeManualStatuses, latestByItem } from '@/lib/care-manual-status'

/** 점검 기록 조회 — 실패하면 null (빈 배열과 구분해 "불러오지 못함"을 알린다) */
export async function fetchCareChecks(customerId: string): Promise<CareCheck[] | null> {
  try {
    const res = await fetch(`/api/admin/customers/${customerId}/care-manual/checks?t=${Date.now()}`, { cache: 'no-store' })
    const body = await res.json().catch(() => ({})) as { checks?: CareCheck[]; error?: string }
    if (!res.ok || !Array.isArray(body.checks)) throw new Error(body.error ?? `HTTP ${res.status}`)
    return body.checks
  } catch (e) {
    console.error('[care-manual] 점검 기록 조회 실패:', e instanceof Error ? e.message : e)
    return null
  }
}

export function useCareChecks(customerId: string, manual: CareManualV2) {
  const [checks, setChecks] = useState<CareCheck[]>([])
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    void fetchCareChecks(customerId).then(result => {
      if (!alive) return
      if (result === null) { setFailed(true); toast.error('점검 기록을 불러오지 못해 상태 색이 정확하지 않을 수 있습니다') }
      else setChecks(result)
    })
    return () => { alive = false }
  }, [customerId])
  const latest = useMemo(() => latestByItem(checks), [checks])
  const statuses = useMemo(() => computeManualStatuses(manual, latest), [manual, latest])
  return { latest, statuses, failed }
}
