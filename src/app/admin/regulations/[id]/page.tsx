'use client'

/**
 * 규정 상세 (관리자): 편집 / 미리보기 / 개정이력 탭 + 발행·PDF·기본정보.
 *   - 본문은 항상 draft 에만 쓴다. 시행본은 읽기 전용.
 *   - 시행본이 있고 draft 가 없으면 "개정 시작"으로 새 draft 를 만든다.
 */
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Badge, Button, Modal, ScrollToTopButton, SectionHeader, Spinner, Textarea } from '@/components/ui'
import ContractEditor, { extractBodyContent, wrapWithBbkCss } from '@/components/contracts/ContractEditor'
import RegulationViewer from '@/components/regulations/RegulationViewer'
import RegulationHistoryPanel from '@/components/regulations/admin/RegulationHistoryPanel'
import PublishModal from '@/components/regulations/admin/PublishModal'
import MetaModal from '@/components/regulations/admin/MetaModal'
import { useRegulationDetail } from '@/components/regulations/admin/useRegulationDetail'
import { CATEGORY_LABELS, STATUS_LABELS, VISIBILITY_LABELS, validateArticleNumbers } from '@/lib/regulations/articles'
import { downloadRegulationPdf } from '@/lib/regulations/pdf'

type Tab = 'edit' | 'preview' | 'history'
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'edit', label: '편집' }, { key: 'preview', label: '미리보기' }, { key: 'history', label: '개정 이력' },
]

export default function RegulationDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const { detail, isLoading, isBusy, saveDraft, startRevision, publish, updateMeta, remove, fetchVersionHtml } = useRegulationDetail(id)

  const [tab, setTab] = useState<Tab>('edit')
  const [html, setHtml] = useState('')
  const [notes, setNotes] = useState('')
  const [dirty, setDirty] = useState(false)
  const [previewDraft, setPreviewDraft] = useState(true)
  const [showPublish, setShowPublish] = useState(false)
  const [showMeta, setShowMeta] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  useEffect(() => {
    if (!detail) return
    setHtml(detail.draft?.html_body ?? detail.current?.html_body ?? '')
    setNotes(detail.draft?.review_notes ?? '')
    setDirty(false)
    if (!detail.draft) setTab(detail.current ? 'preview' : 'edit')
  }, [detail])

  const handleEditorChange = useCallback((full: string) => {
    setHtml(extractBodyContent(full))
    setDirty(true)
  }, [])

  const handleSave = async () => {
    const check = validateArticleNumbers(html)
    if (check.missing.length || check.duplicated.length) {
      toast(`조 번호 확인: 빠짐 ${check.missing.map((n) => `제${n}조`).join(', ') || '없음'} / 중복 ${check.duplicated.join(', ') || '없음'}`, { icon: '⚠️' })
    }
    if (await saveDraft(html, notes)) setDirty(false)
  }

  const handlePdf = async () => {
    if (!detail) return
    const useDraft = previewDraft && detail.draft
    const body = useDraft ? html : detail.current?.html_body ?? html
    const version = useDraft ? detail.draft : detail.versions.find((v) => v.id === detail.current?.id)
    try {
      await downloadRegulationPdf({
        code: detail.regulation.code, title: detail.regulation.title, htmlBody: body,
        effectiveDate: version?.effective_date ?? null, versionNo: version?.version_no ?? null,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PDF 생성에 실패했습니다.')
    }
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>
  if (!detail) return <p className="text-sm text-text-tertiary">규정을 찾을 수 없습니다.</p>

  const { regulation, draft, current, versions } = detail
  const currentMeta = versions.find((v) => v.id === current?.id) ?? null
  const previewBody = previewDraft && draft ? html : current?.html_body ?? html
  const previewMeta = previewDraft && draft ? draft : currentMeta
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-6">
      <SectionHeader
        level="page"
        title={
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-mono text-text-tertiary">{regulation.code}</span>
            <span>{regulation.title}</span>
            <Badge variant={regulation.status === 'active' ? 'success' : regulation.status === 'draft' ? 'warning' : 'default'}>{STATUS_LABELS[regulation.status]}</Badge>
          </span>
        }
        subtitle={`${CATEGORY_LABELS[regulation.category]} · ${VISIBILITY_LABELS[regulation.visibility]}${currentMeta ? ` · 제${currentMeta.version_no}판 시행 ${currentMeta.effective_date ?? '-'}` : ' · 미발행'}${draft ? ` · 편집본 제${draft.version_no}판` : ''}`}
        action={
          <div className="flex gap-2 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/regulations')}>목록</Button>
            <Button variant="secondary" size="sm" onClick={() => setShowMeta(true)}>기본 정보</Button>
            <Button variant="secondary" size="sm" onClick={handlePdf}>PDF 다운로드</Button>
            {draft ? (
              <Button size="sm" onClick={() => setShowPublish(true)} disabled={dirty || isBusy} title={dirty ? '먼저 편집본을 저장하세요' : undefined}>발행</Button>
            ) : (
              <Button size="sm" onClick={startRevision} isLoading={isBusy}>개정 시작</Button>
            )}
          </div>
        }
      />

      <div className="inline-flex gap-1 bg-surface-sunken rounded-xl p-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-brand-100 text-brand-800 shadow-soft' : 'text-text-secondary hover:text-text-primary hover:bg-surface'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'edit' && (
        draft ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-text-secondary break-keep">
                조는 <code className="text-text-primary">제N조 (제목)</code> 굵게, 항은 ①②③, 호는 1. 2. 3., 장은 제목2(H2)로 씁니다. 부칙의 <code>{'{{시행일}}'}</code>은 발행 시 자동으로 바뀝니다.
              </p>
              <div className="flex items-center gap-2">
                {dirty && <span className="text-xs text-state-warning">저장되지 않은 변경</span>}
                <Button size="sm" onClick={handleSave} isLoading={isBusy} disabled={!dirty}>편집본 저장</Button>
              </div>
            </div>
            <ContractEditor value={wrapWithBbkCss(html)} onChange={handleEditorChange} />
            <details className="bg-state-warning-bg border border-border-subtle rounded-2xl p-4" open={!!notes}>
              <summary className="text-sm font-semibold cursor-pointer break-keep">
                검토 메모 — 발행 전 확인할 것 {notes ? `(${notes.split(/\n+/).filter(Boolean).length}줄)` : '(없음)'}
              </summary>
              <p className="text-xs text-text-secondary mt-2 break-keep">
                원고 작성 시 남긴 노무사 확인·사장님 결정 항목입니다. 본문의 <code>[확인: …]</code> 표시를 채우고 지운 뒤, 처리한 메모 줄도 지우면 됩니다. 편집본 저장 시 함께 저장됩니다.
              </p>
              <Textarea
                className="mt-3"
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setDirty(true) }}
                autosize
                fullWidth
                placeholder="확인 필요 항목을 한 줄에 하나씩"
              />
            </details>
          </div>
        ) : (
          <div className="bg-surface border border-border-subtle rounded-2xl p-8 text-center">
            <p className="text-sm font-semibold">시행 중인 본문은 직접 수정할 수 없습니다.</p>
            <p className="text-xs text-text-tertiary mt-1 break-keep">개정 시작을 누르면 현재 본문을 복사한 새 편집본이 만들어집니다.</p>
            <Button className="mt-4" size="sm" onClick={startRevision} isLoading={isBusy}>개정 시작</Button>
          </div>
        )
      )}

      {tab === 'preview' && (
        <div className="space-y-3">
          {draft && current && (
            <div className="inline-flex gap-1 bg-surface-sunken rounded-xl p-1">
              <button onClick={() => setPreviewDraft(true)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${previewDraft ? 'bg-brand-100 text-brand-800 shadow-soft' : 'text-text-secondary'}`}>편집본</button>
              <button onClick={() => setPreviewDraft(false)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${!previewDraft ? 'bg-brand-100 text-brand-800 shadow-soft' : 'text-text-secondary'}`}>시행본</button>
            </div>
          )}
          <RegulationViewer
            code={regulation.code}
            title={regulation.title}
            htmlBody={previewBody}
            effectiveDate={previewMeta?.effective_date ?? null}
            versionNo={previewMeta?.version_no ?? null}
            isDraft={!!(previewDraft && draft)}
          />
        </div>
      )}

      {tab === 'history' && (
        <RegulationHistoryPanel versions={versions} currentVersionId={regulation.current_version_id} fetchVersionHtml={fetchVersionHtml} />
      )}

      <div className="pt-6 border-t border-border-subtle">
        <Button variant="ghost" size="sm" className="text-state-danger" onClick={() => setShowDelete(true)}>규정 삭제</Button>
      </div>

      <ScrollToTopButton />

      {showPublish && draft && (
        <PublishModal
          open={showPublish}
          onClose={() => setShowPublish(false)}
          defaultDate={draft.effective_date ?? today}
          defaultSummary={draft.change_summary ?? (current ? '' : '제정')}
          versionNo={draft.version_no}
          onPublish={publish}
        />
      )}
      {showMeta && <MetaModal open={showMeta} onClose={() => setShowMeta(false)} meta={regulation} onSave={updateMeta} />}
      <Modal
        open={showDelete}
        onClose={() => setShowDelete(false)}
        title="규정 삭제"
        description="목록에서 사라지고 이력은 보관됩니다. 되돌리려면 DB에서 복구해야 합니다."
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowDelete(false)}>취소</Button>
            <Button variant="danger" isLoading={isBusy} onClick={async () => { if (await remove()) router.push('/admin/regulations') }}>삭제</Button>
          </div>
        }
      >
        <p className="text-sm">{regulation.code} {regulation.title} 을(를) 삭제할까요?</p>
      </Modal>
    </div>
  )
}
