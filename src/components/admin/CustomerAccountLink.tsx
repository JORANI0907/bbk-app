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
  onUpdated: (nextAccountUserId: string | null) => void
}

export function CustomerAccountLink({ customerId, accountUserId, onUpdated }: Props) {
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
    <div className="rounded-lg border border-border-subtle bg-surface-sunken/40 p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Users size={14} className="text-text-secondary shrink-0" />
        <span className="text-xs font-semibold text-text-primary">고객 계정 통합</span>
        {isLinked && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-100 text-brand-700 font-semibold">
            통합됨
          </span>
        )}
      </div>

      {isLinked ? (
        <>
          <p className="text-[11px] text-text-secondary leading-normal">
            이 계약은 다른 고객 계정 하나에 통합되어 있습니다. 해당 계정으로 로그인하면 이 계약의 일정도 함께 표시됩니다.
          </p>
          <button
            type="button"
            onClick={() => apply(null)}
            disabled={submitting}
            className="inline-flex items-center justify-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-md border border-border bg-surface text-text-primary hover:bg-surface-sunken disabled:opacity-50"
          >
            <Link2Off size={12} />
            통합 해제
          </button>
        </>
      ) : (
        <>
          <p className="text-[11px] text-text-secondary leading-normal">
            같은 사업장이 다른 유형의 정기 계약도 이용 중이라면, 이 계약을 그 계정에 통합해 한 로그인으로 함께 보이게 할 수 있습니다.
          </p>
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
      )}
    </div>
  )
}
