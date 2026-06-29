'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { CircularGauge } from '@/components/customer/CircularGauge'
import { CustomerIndices, CustomerGrade } from '@/lib/customer-indices'

export interface BranchSummary {
  customerId: string
  businessName: string
  address: string
  grade: CustomerGrade | null
  nextVisitDate: string | null
  indices: CustomerIndices
}

const GRADE_BADGE: Record<CustomerGrade, string> = {
  '화이트': 'bg-slate-100 text-slate-700 border-slate-200',
  '블루': 'bg-sky-100 text-sky-800 border-sky-200',
  '블랙': 'bg-slate-900 text-white border-slate-900',
}

function formatNextVisit(date: string | null): string {
  if (!date) return '미정'
  const [, m, d] = date.slice(0, 10).split('-')
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`
}

export function BranchCard({ branch }: { branch: BranchSummary }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/franchise/switch-branch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: branch.customerId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '전환 실패')
      router.push('/customer')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '전환에 실패했습니다.')
      setLoading(false)
    }
  }

  const { comfortIndex, outerComfortIndex, progressPct } = branch.indices

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="group text-left w-full bg-surface border border-border-subtle rounded-2xl p-4 shadow-soft hover:shadow-card hover:border-border active:scale-[0.99] transition-all disabled:opacity-60"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-text-primary truncate group-hover:text-brand-600 transition-colors">
            {branch.businessName}
          </p>
          <p className="text-[11px] text-text-tertiary truncate mt-0.5 break-keep">
            {branch.address}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {branch.grade && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${GRADE_BADGE[branch.grade]}`}>
              {branch.grade}
            </span>
          )}
          <svg className="w-4 h-4 text-text-tertiary group-hover:text-brand-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border-subtle">
        <CircularGauge
          variant="light"
          size={56}
          strokeWidth={6}
          pct={comfortIndex}
          displayTop={comfortIndex !== null ? `${comfortIndex}` : '-'}
          displaySub="점"
          title="쾌적"
        />
        <CircularGauge
          variant="light"
          size={56}
          strokeWidth={6}
          pct={outerComfortIndex}
          displayTop={outerComfortIndex !== null ? `${outerComfortIndex}` : '-'}
          displaySub="점"
          title="범위 외"
        />
        <CircularGauge
          variant="light"
          size={56}
          strokeWidth={6}
          pct={progressPct}
          displayTop={progressPct !== null ? `${progressPct}` : '-'}
          displaySub="%"
          title="진행률"
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px]">
        <span className="text-text-tertiary">다음 방문</span>
        <span className="font-semibold text-text-secondary">{formatNextVisit(branch.nextVisitDate)}</span>
      </div>
    </button>
  )
}
