'use client'

/** 관리자 규정 상세 — 데이터 로드와 저장·발행·메타 수정 호출을 한곳에 모은 훅 */
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import type { RegulationCategory, RegulationStatus, RegulationVisibility } from '@/lib/regulations/articles'

export interface RegulationMeta {
  id: string
  code: string
  title: string
  category: RegulationCategory
  visibility: RegulationVisibility
  summary: string | null
  status: RegulationStatus
  current_version_id: string | null
}

export interface VersionMeta {
  id: string
  version_no: number
  change_summary: string | null
  effective_date: string | null
  status: 'draft' | 'published'
  published_at: string | null
  updated_at: string
}

export interface RegulationDetail {
  regulation: RegulationMeta
  versions: VersionMeta[]
  draft: (VersionMeta & { html_body: string; review_notes: string | null }) | null
  current: { id: string; html_body: string } | null
}

interface ApiResult<T> { success: boolean; data?: T; error?: string }

async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
    return (await res.json()) as ApiResult<T>
  } catch {
    return { success: false, error: '네트워크 오류가 발생했습니다.' }
  }
}

export function useRegulationDetail(id: string) {
  const [detail, setDetail] = useState<RegulationDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)

  const reload = useCallback(async () => {
    const json = await call<RegulationDetail>(`/api/admin/regulations/${id}`)
    if (json.success && json.data) setDetail(json.data)
    else toast.error(json.error ?? '규정을 불러오지 못했습니다.')
    setIsLoading(false)
  }, [id])

  useEffect(() => { void reload() }, [reload])

  const run = useCallback(async (label: string, fn: () => Promise<ApiResult<unknown>>) => {
    setIsBusy(true)
    const json = await fn()
    setIsBusy(false)
    if (!json.success) { toast.error(json.error ?? `${label}에 실패했습니다.`); return false }
    toast.success(`${label} 완료`)
    await reload()
    return true
  }, [reload])

  const saveDraft = useCallback((htmlBody: string, reviewNotes?: string) =>
    run('편집본 저장', () => call(`/api/admin/regulations/${id}/draft`, {
      method: 'PUT',
      body: JSON.stringify({ html_body: htmlBody, ...(reviewNotes !== undefined ? { review_notes: reviewNotes } : {}) }),
    })),
  [id, run])

  const startRevision = useCallback(() =>
    run('개정 편집본 생성', () => call(`/api/admin/regulations/${id}/draft`, { method: 'PUT', body: JSON.stringify({ change_summary: '' }) })),
  [id, run])

  const publish = useCallback((effectiveDate: string, changeSummary: string, force = false) =>
    run('발행', () => call(`/api/admin/regulations/${id}/publish`, {
      method: 'POST', body: JSON.stringify({ effective_date: effectiveDate, change_summary: changeSummary, force }),
    })),
  [id, run])

  const updateMeta = useCallback((patch: Partial<RegulationMeta>) =>
    run('수정', () => call(`/api/admin/regulations/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })),
  [id, run])

  const remove = useCallback(() =>
    run('삭제', () => call(`/api/admin/regulations/${id}`, { method: 'DELETE' })),
  [id, run])

  const fetchVersionHtml = useCallback(async (versionId: string): Promise<string | null> => {
    const json = await call<{ html_body: string }>(`/api/admin/regulations/${id}/versions/${versionId}`)
    if (!json.success || !json.data) { toast.error(json.error ?? '버전을 불러오지 못했습니다.'); return null }
    return json.data.html_body
  }, [id])

  return { detail, isLoading, isBusy, reload, saveDraft, startRevision, publish, updateMeta, remove, fetchVersionHtml }
}
