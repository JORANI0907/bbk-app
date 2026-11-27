'use client'

import { formatRegulationLabel, type RegulationDocSnapshot } from '@/lib/contract-regulation-vars'

/** 고객이 서명 때 체크한 확인 항목 기록 (agree 라우트가 스냅샷에 저장) */
export interface AgreementRecord {
  key: string
  label: string
  checked_at: string
  ip?: string
}

export interface ContractSnapshotMeta {
  html?: string
  regulation_docs?: RegulationDocSnapshot[]
  agreements?: AgreementRecord[]
}

interface ContractRegulationRefsProps {
  snapshot: ContractSnapshotMeta | null
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/**
 * 관리자 계약 상세의 "준거 문서" 카드 — 이 계약이 참조한 규정(서명 당시 판)과
 * 고객이 서명 전 체크한 확인 항목·시각을 보여 준다. 옛 계약(참조 없음)은 표시하지 않는다.
 */
export default function ContractRegulationRefs({ snapshot }: ContractRegulationRefsProps) {
  const docs = snapshot?.regulation_docs ?? []
  const agreements = snapshot?.agreements ?? []
  if (docs.length === 0 && agreements.length === 0) return null

  return (
    <div className="bg-surface rounded-2xl shadow-soft border border-border-subtle p-5 space-y-4">
      {docs.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-text-primary">준거 문서</p>
          <p className="text-xs text-text-tertiary">계약 생성 시점의 판이 계약서에 고정되어 있습니다. 완료 PDF 뒤에 별첨으로 붙습니다.</p>
          <ul className="space-y-1.5">
            {docs.map((d) => (
              <li key={d.code} className="text-sm">
                <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-brand-100 text-brand-800 font-medium mr-2">{d.code}</span>
                <span className="text-text-primary">{d.title}</span>
                <span className="block text-xs text-text-tertiary mt-0.5">
                  {formatRegulationLabel(d).replace(`${d.code} ${d.title} `, '')}
                  {d.status === 'draft' && (
                    <span className="ml-1.5 inline-block text-xs px-1.5 py-0.5 rounded bg-state-warning-bg text-state-warning">초안 기준</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {agreements.length > 0 && (
        <div className="space-y-2 border-t border-border-subtle pt-3">
          <p className="text-sm font-semibold text-text-primary">고객 확인 기록</p>
          <ul className="space-y-1.5">
            {agreements.map((a) => (
              <li key={a.key} className="text-xs text-text-secondary">
                <span className="text-state-success mr-1">✓</span>{a.label}
                <span className="block text-text-tertiary">{formatDateTime(a.checked_at)}{a.ip ? ` · IP ${a.ip}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
