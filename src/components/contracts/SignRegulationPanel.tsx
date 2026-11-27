'use client'

import { Check, ChevronRight } from 'lucide-react'

export interface SignRegulationDoc {
  code: string
  title: string
  /** "CP-03 예약 취소·변경 및 환불 정책 (제1판, 2026-12-01 시행)" */
  label: string
  /** 열람용으로 렌더된 HTML (앵커·시행일 치환 완료) */
  html: string
}

interface SignRegulationPanelProps {
  docs: SignRegulationDoc[]
  /** 끝까지 읽고 확인을 누른 문서 코드 */
  readCodes: string[]
  onOpen: (doc: SignRegulationDoc) => void
}

/**
 * 서명 화면의 "준거 문서" 목록. 각 문서는 읽기 창을 열어 끝까지 읽은 뒤에만 확인 처리된다.
 * 규정은 공개 페이지가 없고, 서명 링크를 받은 고객만 여기서 읽는다.
 */
export default function SignRegulationPanel({ docs, readCodes, onOpen }: SignRegulationPanelProps) {
  if (docs.length === 0) return null

  return (
    <div className="bg-surface rounded-2xl shadow-soft border border-border-subtle overflow-hidden">
      <div className="p-4 border-b border-border-subtle">
        <p className="text-sm font-medium text-text-secondary">준거 문서</p>
        <p className="text-xs text-text-tertiary mt-0.5 break-keep">
          계약서에 적지 않은 세부 규칙은 아래 문서에 따릅니다. 각 문서를 열어 끝까지 읽고 확인해 주세요. 완료된 계약서와 함께 보내 드립니다.
        </p>
      </div>
      <ul className="divide-y divide-border-subtle">
        {docs.map((d) => {
          const done = readCodes.includes(d.code)
          return (
            <li key={d.code}>
              <button
                type="button"
                onClick={() => onOpen(d)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-sunken/60 transition-colors"
              >
                <span className="min-w-0">
                  <span className="text-sm text-text-primary font-medium break-keep">{d.title}</span>
                  <span className="block text-xs text-text-tertiary mt-0.5">{d.label}</span>
                </span>
                {done ? (
                  <span className="flex-shrink-0 inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-state-success-bg text-state-success font-medium shadow-soft">
                    <Check size={12} /> 확인 완료
                  </span>
                ) : (
                  <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-xs px-3 py-1.5 rounded-full bg-brand-100 text-brand-800 font-medium shadow-card">
                    읽기 <ChevronRight size={14} />
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
