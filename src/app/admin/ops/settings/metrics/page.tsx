'use client'

/**
 * 지표(metrics_config) 설정 페이지
 * PLAN v2 §3.6
 *
 * 17개 시드 목록 · alive/show_on_dashboard 토글 + target_value 편집
 * 라이브 변경 (PATCH) — 저장 버튼 없이 즉시 반영
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ArrowLeft, Gauge } from 'lucide-react'

interface Metric {
  key: string
  function_code: string
  label: string
  unit: string
  target_value: number | null
  direction: string
  cycle: string
  show_on_dashboard: boolean
  alive: boolean
  calculation: string
  sort_order: number
}

export default function MetricsSettingsPage() {
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/ops/settings/metrics')
      .then(r => r.json())
      .then(j => { if (j.ok) setMetrics(j.metrics) })
      .catch(() => toast.error('로드 실패'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const patchOne = async (key: string, body: Partial<Metric>) => {
    try {
      const res = await fetch('/api/admin/ops/settings/metrics', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, ...body }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error ?? '실패')
      setMetrics(prev => prev.map(m => m.key === key ? { ...m, ...body } : m))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (loading) return <div className="p-6 text-center text-text-tertiary text-sm">불러오는 중…</div>

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div className="flex items-center gap-2">
        <Link href="/admin" className="text-text-tertiary hover:text-brand-600"><ArrowLeft size={18} /></Link>
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2"><Gauge size={20} /> 지표 설정</h1>
      </div>
      <p className="text-xs text-text-tertiary">활성 지표만 대시보드/보고서에 노출됩니다. 목표값은 이달 성과 판정에 사용됩니다.</p>

      <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden divide-y divide-border-subtle">
        {metrics.map(m => (
          // Phase 27-BE: 모바일에서 라벨은 첫 줄 단독, 컨트롤 3종(활성·대시보드·목표)은
          //   다음 줄로 자연 wrap. 데스크톱(sm+)은 기존 한 줄 배치 유지.
          <div key={m.key} className="p-3 flex flex-wrap items-center gap-3">
            <div className="min-w-0 w-full sm:w-auto sm:flex-1">
              <p className="text-sm font-semibold text-text-primary truncate">{m.label}</p>
              <p className="text-xs text-text-tertiary">{m.function_code} · {m.cycle} · {m.calculation}</p>
            </div>

            <label className="flex items-center gap-1 text-xs text-text-secondary">
              <input type="checkbox" checked={m.alive} onChange={e => patchOne(m.key, { alive: e.target.checked })} />
              활성
            </label>
            <label className="flex items-center gap-1 text-xs text-text-secondary">
              <input type="checkbox" checked={m.show_on_dashboard} onChange={e => patchOne(m.key, { show_on_dashboard: e.target.checked })} />
              대시보드
            </label>

            <div className="flex items-center gap-1">
              <span className="text-xs text-text-tertiary">목표</span>
              <input
                type="number"
                step="any"
                defaultValue={m.target_value ?? ''}
                onBlur={e => {
                  const v = e.target.value === '' ? null : Number(e.target.value)
                  if (v !== m.target_value) patchOne(m.key, { target_value: v })
                }}
                className="w-20 px-2 py-1 rounded border border-border bg-surface text-sm text-right"
              />
              <span className="text-xs text-text-secondary w-8">{m.unit}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
