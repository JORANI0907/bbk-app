'use client'

/** 개정 이력 목록 + 두 버전 고른 뒤 신구조문 대비표 */
import { useState } from 'react'
import { Badge, Button, Select } from '@/components/ui'
import RegulationDiffTable from '@/components/regulations/RegulationDiffTable'
import type { VersionMeta } from './useRegulationDetail'

interface RegulationHistoryPanelProps {
  versions: VersionMeta[]
  currentVersionId: string | null
  fetchVersionHtml: (versionId: string) => Promise<string | null>
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '-')

export default function RegulationHistoryPanel({ versions, currentVersionId, fetchVersionHtml }: RegulationHistoryPanelProps) {
  const published = versions.filter((v) => v.status === 'published')
  const [beforeId, setBeforeId] = useState(published[1]?.id ?? '')
  const [afterId, setAfterId] = useState(versions[0]?.id ?? '')
  const [diff, setDiff] = useState<{ before: string; after: string } | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const compare = async () => {
    if (!beforeId || !afterId || beforeId === afterId) return
    setIsBusy(true)
    const [before, after] = await Promise.all([fetchVersionHtml(beforeId), fetchVersionHtml(afterId)])
    setIsBusy(false)
    if (before !== null && after !== null) setDiff({ before, after })
  }

  const label = (v: VersionMeta) => `제${v.version_no}판${v.status === 'draft' ? ' (편집본)' : ''}${v.effective_date ? ` · ${v.effective_date}` : ''}`

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border-subtle rounded-2xl divide-y divide-border-subtle">
        {versions.map((v) => (
          <div key={v.id} className="px-4 py-3 md:px-6 flex flex-col md:flex-row md:items-center gap-2">
            <div className="flex items-center gap-2 flex-wrap flex-1">
              <span className="text-sm font-semibold">제{v.version_no}판</span>
              {v.status === 'draft' && <Badge variant="warning">편집본</Badge>}
              {v.id === currentVersionId && <Badge variant="success">시행 중</Badge>}
              <span className="text-xs text-text-secondary break-keep">{v.change_summary || '-'}</span>
            </div>
            <div className="text-xs text-text-tertiary md:text-right">
              <p>시행일 {v.effective_date ?? '-'}</p>
              <p>{v.status === 'published' ? `발행 ${fmt(v.published_at)}` : `수정 ${fmt(v.updated_at)}`}</p>
            </div>
          </div>
        ))}
      </div>

      {versions.length >= 2 && (
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row gap-2 md:items-end">
            <Select label="현행(이전)" value={beforeId} onChange={(e) => setBeforeId(e.target.value)} fullWidth>
              <option value="">선택</option>
              {versions.map((v) => <option key={v.id} value={v.id}>{label(v)}</option>)}
            </Select>
            <Select label="개정(이후)" value={afterId} onChange={(e) => setAfterId(e.target.value)} fullWidth>
              <option value="">선택</option>
              {versions.map((v) => <option key={v.id} value={v.id}>{label(v)}</option>)}
            </Select>
            <Button onClick={compare} isLoading={isBusy} disabled={!beforeId || !afterId || beforeId === afterId}>신구조문 대비</Button>
          </div>
          {diff && <RegulationDiffTable beforeHtml={diff.before} afterHtml={diff.after} />}
        </div>
      )}
    </div>
  )
}
