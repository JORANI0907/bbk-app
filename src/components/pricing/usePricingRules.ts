'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import type { PricingConfig, PricingRuleRow, PricingServiceType } from '@/lib/pricing/types'

export type RuleState = Omit<PricingRuleRow, 'id' | 'created_at'> & { id: string | null; created_at: string | null }

interface ApiResult<T> { success: boolean; data?: T; error?: string }

async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
    return (await res.json()) as ApiResult<T>
  } catch {
    return { success: false, error: '네트워크 오류가 발생했습니다.' }
  }
}

/** 서비스 유형 4종의 현재 기준값 로드 + 새 버전 저장 + 이력 조회 */
export function usePricingRules() {
  const [rules, setRules] = useState<RuleState[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const reload = useCallback(async () => {
    const json = await call<RuleState[]>('/api/admin/pricing')
    if (json.success && json.data) setRules(json.data)
    else toast.error(json.error ?? '기준값을 불러오지 못했습니다.')
    setIsLoading(false)
  }, [])

  useEffect(() => { void reload() }, [reload])

  const save = useCallback(async (serviceType: PricingServiceType, config: PricingConfig, note: string) => {
    setIsSaving(true)
    const json = await call<PricingRuleRow>(`/api/admin/pricing/${serviceType}`, { method: 'PUT', body: JSON.stringify({ config, note }) })
    setIsSaving(false)
    if (!json.success) { toast.error(json.error ?? '저장에 실패했습니다.'); return false }
    toast.success(`제${json.data?.version_no}판으로 저장했습니다.`)
    await reload()
    return true
  }, [reload])

  const history = useCallback(async (serviceType: PricingServiceType) => {
    const json = await call<PricingRuleRow[]>(`/api/admin/pricing/${serviceType}`)
    if (!json.success) { toast.error(json.error ?? '이력을 불러오지 못했습니다.'); return [] }
    return json.data ?? []
  }, [])

  return { rules, isLoading, isSaving, save, history, reload }
}
