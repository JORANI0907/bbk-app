'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { AlertCircle, Download, Send, ExternalLink, RefreshCw } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { todayYmdKst, type HometaxRow } from '@/lib/hometax-csv'
import {
  fetchBoltaMode, saveHometaxCsv, requestBoltaIssue, recheckBoltaRequested, summarizeIssueResult,
  type BoltaMode as ClientBoltaMode,
} from '@/lib/tax-invoice-issue-client'
import {
  buildHometaxRow, candidateKey, issueDeadlineOf, paidDateOf, toYmd, ymdToDateInput,
  type RowCandidate, type RowSupplier,
} from '@/lib/tax-invoice-rows'

/**
 * "계산서" 버튼 → 발행 방식 선택 모달 (2026-11-28)
 *
 *  - 선택 건 미리보기 + 작성일자(입금일) 확인·수정
 *  - [홈택스 CSV 생성]  기존 동작 (Google Sheets 저장, 실패 시 로컬 다운로드)
 *  - [볼타로 발행]      /api/admin/tax-invoice/issue → 웹훅이 발행완료 처리
 */

export interface ModalCandidate extends RowCandidate {
  is_valid: boolean
  missing_fields: string[]
  tax_invoice_issued: boolean
  draft_issue_status: 'draft' | 'requested' | 'issued' | 'failed' | null
  draft_failure_message: string | null
  draft_tax_invoice_url: string | null
}

interface IssueResult {
  source: string
  source_id: string
  status: 'requested' | 'failed' | 'skipped' | 'uncertain'
  message: string
}

interface Props {
  open: boolean
  onClose: () => void
  candidates: ModalCandidate[]
  suppliers: RowSupplier[]
  supplier: RowSupplier
  /** 볼타 발행 요청 후 목록 새로고침 */
  onIssued: () => void
}

type BoltaMode = ClientBoltaMode | 'loading'

const fmtKr = (n: number) => n.toLocaleString('ko-KR')

function useBoltaMode(open: boolean): BoltaMode {
  const [mode, setMode] = useState<BoltaMode>('loading')
  useEffect(() => {
    if (!open) return
    setMode('loading')
    void fetchBoltaMode().then(setMode)
  }, [open])
  return mode
}

function ModeBadge({ mode }: { mode: BoltaMode }) {
  if (mode === 'loading') return <Badge>볼타 확인 중…</Badge>
  if (mode === 'test') return <Badge variant="info">볼타 테스트 모드 · 국세청 미전송</Badge>
  if (mode === 'live') return <Badge variant="warning">볼타 실제 발행 · 국세청 전송</Badge>
  return <Badge variant="danger">볼타 미설정</Badge>
}

function RowDateBadge({ paidYmd, writtenYmd, today }: { paidYmd: string | null; writtenYmd: string; today: string }) {
  if (!paidYmd) return <Badge variant="warning">입금일 없음 · 오늘로 대체</Badge>
  if (today > issueDeadlineOf(paidYmd)) {
    const d = issueDeadlineOf(paidYmd)
    return <Badge variant="danger">기한 초과 ({d.slice(4, 6)}/{d.slice(6, 8)})</Badge>
  }
  if (writtenYmd !== paidYmd) return <Badge variant="info">수정됨</Badge>
  return <Badge variant="success">입금일</Badge>
}

function RowIssueBadge({ c }: { c: ModalCandidate }) {
  if (c.tax_invoice_issued || c.draft_issue_status === 'issued') return <Badge variant="success">발행완료</Badge>
  if (c.draft_issue_status === 'requested') return <Badge variant="warning">요청됨 · 결과 대기</Badge>
  if (c.draft_issue_status === 'failed') {
    return <Badge variant="danger" className="max-w-[180px] truncate" >실패 · {c.draft_failure_message ?? '사유 없음'}</Badge>
  }
  if (!c.is_valid) return <Badge variant="danger">누락: {c.missing_fields.join(', ')}</Badge>
  return <Badge>미발행</Badge>
}

const RESULT_LABEL: Record<IssueResult['status'], { label: string; variant: 'success' | 'danger' | 'default' | 'warning' }> = {
  requested: { label: '접수', variant: 'success' },
  failed: { label: '실패', variant: 'danger' },
  skipped: { label: '건너뜀', variant: 'default' },
  uncertain: { label: '확인 필요', variant: 'warning' },
}

export function IssueModeModal({ open, onClose, candidates, suppliers, supplier, onIssued }: Props) {
  const today = todayYmdKst()
  const mode = useBoltaMode(open)
  const [writtenDates, setWrittenDates] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<'csv' | 'bolta' | 'recheck' | null>(null)
  const [results, setResults] = useState<IssueResult[] | null>(null)
  const wasOpen = useRef(false)

  // 닫힘 → 열림 전환 시에만 초기화. 열린 상태에서 목록이 새로고침돼도 입력값·결과를 유지한다.
  useEffect(() => {
    if (open && !wasOpen.current) {
      setWrittenDates({})
      setResults(null)
      setBusy(null)
    }
    wasOpen.current = open
  }, [open])

  // 새로 들어온 행만 기본값(입금일 → 없으면 오늘) 채움. 사용자가 고친 값은 건드리지 않는다.
  useEffect(() => {
    if (!open) return
    setWrittenDates(prev => {
      const missing = candidates.filter(c => !(candidateKey(c) in prev))
      if (missing.length === 0) return prev
      const next = { ...prev }
      for (const c of missing) next[candidateKey(c)] = paidDateOf(c) ?? today
      return next
    })
  }, [open, candidates, today])

  const invalid = useMemo(() => candidates.filter(c => !c.is_valid), [candidates])
  const boltaTargets = useMemo(
    () => candidates.filter(c => c.is_valid && !c.tax_invoice_issued
      && c.draft_issue_status !== 'requested' && c.draft_issue_status !== 'issued'),
    [candidates],
  )
  const requestedTargets = useMemo(
    () => candidates.filter(c => c.draft_issue_status === 'requested'),
    [candidates],
  )
  const totals = useMemo(() => candidates.reduce(
    (acc, c) => ({ supply: acc.supply + c.supply_amount, vat: acc.vat + c.vat }),
    { supply: 0, vat: 0 },
  ), [candidates])

  const buildRows = (list: ModalCandidate[]): HometaxRow[] =>
    list.map(c => buildHometaxRow(c, writtenDates[candidateKey(c)] ?? today, suppliers, supplier))

  const setDate = (key: string, value: string) => {
    const ymd = toYmd(value)
    if (!ymd) return
    setWrittenDates(prev => ({ ...prev, [key]: ymd }))
  }

  // ── 홈택스 CSV (기존 동작 유지) ────────────────────────────
  const handleCsv = async () => {
    if (invalid.length > 0) { toast.error(`필수 정보 누락 ${invalid.length}건 — 편집 후 다시 시도`); return }
    setBusy('csv')
    const uploadingToast = toast.loading('Google Sheets로 저장 중...')
    try {
      const result = await saveHometaxCsv(buildRows(candidates), today)
      toast.dismiss(uploadingToast)
      if (result.ok) {
        toast.success(
          (t) => (
            <span className="flex items-center gap-2">
              <span>{result.count}건 Google Sheets 저장 완료</span>
              {result.webViewLink && (
                <a href={result.webViewLink} target="_blank" rel="noreferrer"
                  onClick={() => toast.dismiss(t.id)}
                  className="text-brand-600 underline text-xs">시트 열기</a>
              )}
            </span>
          ),
          { duration: 8000 },
        )
        onClose()
      } else {
        toast.error(`Sheets 저장 실패 — 로컬 CSV로 다운로드: ${result.error}`, { duration: 6000 })
      }
    } catch (e) {
      toast.dismiss(uploadingToast)
      toast.error(e instanceof Error ? e.message : 'CSV 생성 실패')
    } finally {
      setBusy(null)
    }
  }

  // ── 볼타 발행 ─────────────────────────────────────────────
  const handleBolta = async () => {
    if (invalid.length > 0) { toast.error(`필수 정보 누락 ${invalid.length}건 — 편집 후 다시 시도`); return }
    if (boltaTargets.length === 0) { toast.error('볼타로 발행할 수 있는 건이 없습니다 (이미 요청·발행됨)'); return }
    const liveNote = mode === 'live' ? '\n\n⚠️ 실제 발행입니다. 국세청에 전송되며 취소는 수정세금계산서로만 가능합니다.' : ''
    if (!confirm(`선택한 ${boltaTargets.length}건을 볼타로 발행 요청할까요?${liveNote}`)) return

    setBusy('bolta')
    try {
      const rows = buildRows(boltaTargets)
      const result = await requestBoltaIssue(
        boltaTargets.map((c, i) => ({ source: c.source, source_id: c.source_id, customer_id: c.customer_id, row: rows[i] })),
        supplier.id || null,
      )
      setResults(result.results as IssueResult[])
      toast.success(summarizeIssueResult(result), { duration: 6000 })
      onIssued()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '발행 요청 실패')
    } finally {
      setBusy(null)
    }
  }

  // ── 멈춘 요청 상태 재확인 ─────────────────────────────────
  const handleRecheck = async () => {
    if (requestedTargets.length === 0) return
    setBusy('recheck')
    try {
      const list = await recheckBoltaRequested(requestedTargets.map(c => ({ source: c.source, source_id: c.source_id })))
      const summary = list.map(r => `${nameOf(r)}: ${r.message}`).join(' · ')
      toast.success(summary || '확인할 건이 없습니다', { duration: 8000 })
      onIssued()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '상태 확인 실패')
    } finally {
      setBusy(null)
    }
  }

  const nameOf = (r: { source: string; source_id: string }) =>
    candidates.find(c => c.source === r.source && c.source_id === r.source_id)?.business_name ?? r.source_id

  const footer = results ? (
    <div className="flex justify-end">
      <Button variant="secondary" size="sm" onClick={onClose}>닫기</Button>
    </div>
  ) : (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-text-tertiary">
        CSV는 홈택스에 직접 올립니다. 볼타 발행은 결과가 오면 발행완료·고객 알림까지 자동 처리됩니다.
      </p>
      <div className="flex items-center gap-2">
        {requestedTargets.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleRecheck}
            disabled={busy !== null || mode === 'none' || mode === 'loading'}
            className="flex items-center gap-1.5"
            title="볼타 응답을 못 받아 '요청됨'으로 멈춘 건의 접수 여부를 확인합니다">
            <RefreshCw size={13} className={busy === 'recheck' ? 'animate-spin' : ''} />요청 상태 확인 ({requestedTargets.length})
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={handleCsv}
          disabled={busy !== null || candidates.length === 0}
          className="flex items-center gap-1.5">
          <Download size={13} />홈택스 CSV 생성
        </Button>
        <Button variant="primary" size="sm" onClick={handleBolta}
          disabled={busy !== null || mode === 'none' || mode === 'loading' || boltaTargets.length === 0}
          className="flex items-center gap-1.5">
          <Send size={13} />볼타로 발행 ({boltaTargets.length})
        </Button>
      </div>
    </div>
  )

  return (
    <Modal open={open} onClose={onClose} size="xl" title="세금계산서 발행 방식 선택"
      description={`선택 ${candidates.length}건 · 공급가액 ${fmtKr(totals.supply)}원 · 세액 ${fmtKr(totals.vat)}원`}
      footer={footer} disableOverlayClose={busy !== null}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ModeBadge mode={mode} />
          <span className="text-xs text-text-tertiary">작성일자는 입금일 기준. 없으면 오늘 날짜로 채우고 직접 고칠 수 있습니다.</span>
        </div>

        {results ? (
          <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
            {results.map(r => {
              const meta = RESULT_LABEL[r.status]
              return (
                <li key={`${r.source}:${r.source_id}`} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                  <span className="font-medium text-text-primary truncate">{nameOf(r)}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                    <span className="text-xs text-text-secondary max-w-[260px] truncate" title={r.message}>{r.message}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border-subtle">
            <table className="w-full min-w-[640px] text-xs">
              <thead className="bg-surface-sunken border-b border-border-subtle text-text-secondary">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">상호</th>
                  <th className="text-left px-2 py-2 font-medium whitespace-nowrap">사업자번호</th>
                  <th className="text-right px-2 py-2 font-medium whitespace-nowrap">공급가액</th>
                  <th className="text-right px-2 py-2 font-medium whitespace-nowrap">세액</th>
                  <th className="text-left px-2 py-2 font-medium whitespace-nowrap">작성일자</th>
                  <th className="text-left px-2 py-2 font-medium whitespace-nowrap">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {candidates.map(c => {
                  const key = candidateKey(c)
                  const paid = paidDateOf(c)
                  const written = writtenDates[key] ?? today
                  return (
                    <tr key={key}>
                      <td className="px-3 py-1.5 max-w-[200px]">
                        <div className="font-medium text-text-primary truncate">{c.business_name}</div>
                        <div className="text-text-tertiary truncate">{c.service_type ?? ''}{c.display_period ? ` · ${c.display_period}` : ''}</div>
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-text-secondary whitespace-nowrap">
                        {c.business_number || <span className="text-state-danger">누락</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtKr(c.supply_amount)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-text-tertiary whitespace-nowrap">{fmtKr(c.vat)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Input type="date" size="sm" fullWidth={false} id={`written-${key}`}
                            value={ymdToDateInput(written)}
                            onChange={e => setDate(key, e.target.value)}
                            className="h-8 text-xs w-36" aria-label={`${c.business_name} 작성일자`} />
                          <RowDateBadge paidYmd={paid} writtenYmd={written} today={today} />
                        </div>
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <RowIssueBadge c={c} />
                          {c.draft_tax_invoice_url && (
                            <a href={c.draft_tax_invoice_url} target="_blank" rel="noreferrer"
                              className="text-brand-600 hover:text-brand-700" title="볼타 계산서 보기">
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!results && invalid.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-state-danger">
            <AlertCircle size={12} />필수 정보가 빠진 {invalid.length}건이 있어 발행할 수 없습니다. 목록에서 편집 후 다시 선택하세요.
          </p>
        )}
      </div>
    </Modal>
  )
}
