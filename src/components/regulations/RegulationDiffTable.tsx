'use client'

/** 신구조문 대비표: 조 단위로 "현행 / 개정" 을 나란히 보여준다. */
import { useMemo } from 'react'
import { Badge } from '@/components/ui'
import { diffArticles, type ArticleChange } from '@/lib/regulations/articles'

interface RegulationDiffTableProps {
  beforeHtml: string
  afterHtml: string
  beforeLabel?: string
  afterLabel?: string
}

const KIND_BADGE: Record<ArticleChange['kind'], { label: string; variant: 'info' | 'danger' | 'warning' }> = {
  added: { label: '신설', variant: 'info' },
  removed: { label: '삭제', variant: 'danger' },
  changed: { label: '개정', variant: 'warning' },
}

const CELL_CLASS = 'align-top p-3 text-xs leading-normal break-keep [&_p]:my-1 [&_strong]:font-semibold'

export default function RegulationDiffTable({ beforeHtml, afterHtml, beforeLabel = '현행', afterLabel = '개정' }: RegulationDiffTableProps) {
  const changes = useMemo(() => diffArticles(beforeHtml, afterHtml), [beforeHtml, afterHtml])

  if (changes.length === 0) {
    return <p className="text-sm text-text-tertiary py-6 text-center">조문 변경이 없습니다.</p>
  }

  return (
    <div className="overflow-x-auto border border-border-subtle rounded-2xl">
      <table className="w-full table-fixed text-sm">
        <thead className="bg-surface-sunken">
          <tr>
            <th className="w-24 p-3 text-left text-xs font-semibold text-text-secondary">조문</th>
            <th className="p-3 text-left text-xs font-semibold text-text-secondary">{beforeLabel}</th>
            <th className="p-3 text-left text-xs font-semibold text-text-secondary">{afterLabel}</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => (
            <tr key={c.id} className="border-t border-border-subtle">
              <td className="p-3 align-top">
                <p className="text-xs font-semibold">{c.number}</p>
                <Badge variant={KIND_BADGE[c.kind].variant} className="mt-1">{KIND_BADGE[c.kind].label}</Badge>
              </td>
              <td className={`${CELL_CLASS} ${c.kind === 'added' ? 'text-text-tertiary' : ''}`}>
                {c.before ? <div dangerouslySetInnerHTML={{ __html: c.before.html }} /> : <span>(신설)</span>}
              </td>
              <td className={`${CELL_CLASS} ${c.kind === 'removed' ? 'text-text-tertiary line-through' : ''}`}>
                {c.after ? <div dangerouslySetInnerHTML={{ __html: c.after.html }} /> : <span>(삭제)</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
