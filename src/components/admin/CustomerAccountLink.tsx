'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Link2, Link2Off, Users } from 'lucide-react'

type Candidate = {
  id: string
  business_name: string
  customer_type: string | null
  user_id: string | null
  business_number: string | null
  contact_phone: string | null
}

interface Props {
  customerId: string
  accountUserId: string | null
  linkedLabel?: string | null
  /** 이 고객이 소유한 포털 계정 표시용 라벨 (예: "홍길동 · 010-1234-5678"). 미생성 시 null */
  ownerAccountLabel?: string | null
  /** 계정 통합(다른 고객 계정 병합) UI 노출 여부. 기본 true (정기케어에서만 의미 있음) */
  showMerger?: boolean
  onUpdated: (nextAccountUserId: string | null) => void
}

export function CustomerAccountLink({
  customerId, accountUserId, linkedLabel, ownerAccountLabel = null, showMerger = true, onUpdated,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!expanded || accountUserId) return
    setLoading(true)
    fetch(`/api/admin/customers/${customerId}/account-link`)
      .then(r => r.json())
      .then(j => setCandidates((j.candidates ?? []) as Candidate[]))
      .catch(() => setCandidates([]))
      .finally(() => setLoading(false))
  }, [expanded, accountUserId, customerId])

  async function apply(nextAccountUserId: string | null) {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/account-link`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_user_id: nextAccountUserId }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error ?? '실패')
      onUpdated(nextAccountUserId)
      toast.success(nextAccountUserId ? '계정 통합 완료' : '통합 해제 완료')
      setExpanded(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '실패')
    } finally {
      setSubmitting(false)
    }
  }

  const isLinked = !!accountUserId

  return (
    <div className="rounded-lg border border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Users size={14} className="text-indigo-600 shrink-0" />
        <span className="text-xs font-semibold text-indigo-900">고객 계정</span>
        {/* 통합 UI 노출 시에만 도움말 물음표 표시 */}
        {showMerger && (
          <span
            className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-indigo-300 text-[10px] text-indigo-500 cursor-help bg-white/60"
            title="같은 사업장이 다른 유형의 정기 계약도 이용 중이라면, 이 계약을 그 계정에 통합해 한 로그인으로 함께 보이게 할 수 있습니다."
          >?</span>
        )}
        {isLinked && showMerger && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-600 text-white font-semibold">
            통합됨
          </span>
        )}
      </div>

      {/* Phase 22 v3: 포털 계정 표시 — 생성완료 시 실제 계정 정보(이름·전화) 노출 (계정관리에서 수정 시 자동 반영) */}
      <div className="flex items-center gap-1.5 rounded-md border border-indigo-200 bg-white/70 px-2.5 py-1">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ownerAccountLabel ? 'bg-green-500' : 'bg-gray-400'}`} />
        {ownerAccountLabel ? (
          <span className="text-xs font-medium text-text-primary truncate">{ownerAccountLabel}</span>
        ) : (
          <span className="text-xs text-text-tertiary">포털 계정 미생성</span>
        )}
      </div>

      {/* 계정 통합 UI (정기케어만) */}
      {showMerger && (isLinked ? (
        <>
          {linkedLabel ? (
            <div className="flex items-center gap-1.5 rounded-md border border-indigo-200 bg-white px-2.5 py-1.5">
              <Link2 size={12} className="text-indigo-600 shrink-0" />
              <span className="text-xs font-semibold text-indigo-700 truncate">{linkedLabel}</span>
            </div>
          ) : (
            <p className="text-[11px] text-text-secondary leading-normal">
              대상 계정 정보를 찾을 수 없음 (삭제됨)
            </p>
          )}
          <button
            type="button"
            onClick={() => apply(null)}
            disabled={submitting}
            className="inline-flex items-center justify-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-md border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
          >
            <Link2Off size={12} />
            통합 해제
          </button>
        </>
      ) : (
        <>
          {!expanded ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex items-center justify-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-md border border-border bg-surface text-text-primary hover:bg-surface-sunken"
            >
              <Link2 size={12} />
              다른 계정에 통합
            </button>
          ) : (
            <div className="flex flex-col gap-1.5">
              {loading ? (
                <p className="text-[11px] text-text-tertiary">후보 조회 중...</p>
              ) : candidates.length === 0 ? (
                <p className="text-[11px] text-text-tertiary">
                  사업자번호·연락처가 같은 다른 정기 계약이 없습니다.
                </p>
              ) : (
                candidates.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={submitting || !c.user_id}
                    onClick={() => c.user_id && apply(c.user_id)}
                    className="flex items-center justify-between gap-2 text-left text-[11px] px-2.5 py-2 rounded-md border border-border bg-surface hover:bg-surface-sunken disabled:opacity-50"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold text-text-primary">{c.business_name}</span>
                      {c.customer_type && (
                        <span className="ml-1 text-text-tertiary">· {c.customer_type}</span>
                      )}
                    </span>
                    <span className="text-brand-600 font-semibold shrink-0">이 계정에 통합 →</span>
                  </button>
                ))
              )}
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="text-[11px] text-text-tertiary self-start hover:text-text-secondary"
              >
                취소
              </button>
            </div>
          )}
        </>
      ))}
    </div>
  )
}
