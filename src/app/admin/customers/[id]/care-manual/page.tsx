'use client'

/**
 * 케어매뉴얼 편집 페이지 (관리자) — 2026-11-03 구역(탭) 구조로 전면 개편
 *   데이터 로드 → normalizeCareManual 로 v2 변환 → CareManualEditor
 *   직원(worker) 은 읽기 전용 뷰어.
 */

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { CareManualV2 } from '@/types/care-manual'
import { normalizeCareManual } from '@/types/care-manual'
import { CareManualEditor } from '@/components/care-manual/CareManualEditor'
import { CareManualViewer } from '@/components/care-manual/CareManualViewer'

export default function CareManualEditPage() {
  const params = useParams<{ id: string }>()
  const id = Array.isArray(params.id) ? params.id[0] : params.id
  const router = useRouter()

  const [manual, setManual] = useState<CareManualV2 | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerType, setCustomerType] = useState('')
  const [readOnly, setReadOnly] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => { if (d?.user?.role === 'worker') setReadOnly(true) }).catch(() => {})
  }, [])

  // 브라우저 뒤로가기도 세부화면이 열린 채로 돌아가도록
  useEffect(() => {
    history.pushState(null, '')
    const onPop = () => router.push(`/admin/customers?detail=${id}`)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [id, router])

  const load = useCallback(async () => {
    if (!id) { toast.error('잘못된 주소입니다 (고객 id 없음)'); return }
    try {
      const res = await fetch(`/api/admin/customers/${id}/care-manual?t=${Date.now()}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
      const data = await res.json().catch(() => ({})) as { manual?: unknown; sections?: unknown; business_name?: string; customer_type?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? '불러오기 실패')
      setManual(normalizeCareManual(data.manual ?? data.sections))
      setCustomerName(data.business_name ?? '')
      setCustomerType(data.customer_type ?? '')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '불러오기 실패')
      setManual(normalizeCareManual(null))
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
      <div className="mb-4 flex items-center gap-3">
        <button type="button" onClick={() => router.push(`/admin/customers?detail=${id}`)} className="rounded-lg p-1.5 text-text-secondary hover:bg-surface-sunken" aria-label="고객관리로">
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0">
          <p className="truncate text-xs text-text-tertiary">{customerName}{customerType ? ` · ${customerType}` : ''}</p>
          <h1 className="text-xl font-bold leading-tight text-text-primary">케어매뉴얼{readOnly ? ' (보기)' : ''}</h1>
        </div>
      </div>

      {manual === null ? (
        <div className="flex h-64 items-center justify-center text-text-tertiary"><Loader2 size={22} className="animate-spin" /></div>
      ) : readOnly ? (
        <CareManualViewer manual={manual} emptyHint="관리자가 작성하면 여기에 표시됩니다." />
      ) : (
        <CareManualEditor key={id} customerId={id} initial={manual} />
      )}
    </div>
  )
}
