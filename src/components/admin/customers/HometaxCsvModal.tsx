'use client'

/**
 * 홈택스 세금계산서 발행 모달 (2026-10-24 신설 · 2026-11-28 볼타 발행 분기 추가)
 *
 * - 고객관리 탭의 "홈택스" 버튼이 호출.
 * - props.customerIds 로 선택된 고객들의 미발행 발행대상(candidates) 조회.
 * - 1회성은 1고객당 1건, 정기딥/정기엔드는 월별 결제이력 여러 건.
 * - 고객별 아코디언: 접힌 상태에선 "N건 선택 / M건 중" 요약, 펼치면 결제이력 체크박스.
 * - 작성일자 = 입금일 (없으면 오늘, 칸에서 직접 수정).
 * - 푸터 두 갈래: [홈택스 CSV 생성] 기존 동작 / [볼타로 발행] API 발행 → 웹훅이 발행완료 처리.
 */

import { useEffect, useMemo, useState } from 'react'
import { X, ChevronDown, ChevronRight, Download, Send, RefreshCw, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { todayYmdKst } from '@/lib/hometax-csv'
import {
  buildHometaxRow, candidateKey, issueDeadlineOf, paidDateOf, toYmd, ymdToDateInput,
  type RowCandidate, type RowSupplier,
} from '@/lib/tax-invoice-rows'
import {
  fetchBoltaMode, saveHometaxCsv, requestBoltaIssue, recheckBoltaRequested, summarizeIssueResult,
  type BoltaMode,
} from '@/lib/tax-invoice-issue-client'

// candidates API 응답 중 이 모달이 쓰는 필드
interface Candidate extends RowCandidate {
  total_amount: number
  invoice_note?: string | null   // 2026-11-01: 혼합 결제 시 포함/제외 내역
  billing_period: string | null
  tax_invoice_issued: boolean
  is_valid: boolean
  missing_fields: string[]
  draft_issue_status: 'draft' | 'requested' | 'issued' | 'failed' | null
  draft_failure_message: string | null
  draft_tax_invoice_url: string | null
}

interface Supplier extends RowSupplier {
  is_default: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  /** 체크박스로 선택된 고객 id 리스트 */
  customerIds: string[]
}

type Busy = 'csv' | 'bolta' | 'recheck' | null

const rowKey = candidateKey
const fmtKr = (n: number) => n.toLocaleString('ko-KR')

function ModeBadge({ mode }: { mode: BoltaMode | 'loading' }) {
  if (mode === 'loading') return <Badge>볼타 확인 중…</Badge>
  if (mode === 'test') return <Badge variant="info">볼타 테스트 모드 · 국세청 미전송</Badge>
  if (mode === 'live') return <Badge variant="warning">볼타 실제 발행 · 국세청 전송</Badge>
  return <Badge variant="danger">볼타 미설정</Badge>
}

function DateBadge({ paidYmd, writtenYmd, today }: { paidYmd: string | null; writtenYmd: string; today: string }) {
  if (!paidYmd) return <Badge variant="warning">입금일 없음</Badge>
  const deadline = issueDeadlineOf(paidYmd)
  if (today > deadline) return <Badge variant="danger">기한 초과 ({deadline.slice(4, 6)}/{deadline.slice(6, 8)})</Badge>
  if (writtenYmd !== paidYmd) return <Badge variant="info">수정됨</Badge>
  return <Badge variant="success">입금일</Badge>
}

function IssueBadge({ c }: { c: Candidate }) {
  if (c.draft_issue_status === 'requested') return <Badge variant="warning">볼타 요청됨</Badge>
  if (c.draft_issue_status === 'failed') {
    return <Badge variant="danger" className="max-w-[160px] truncate">실패 · {c.draft_failure_message ?? '사유 없음'}</Badge>
  }
  if (!c.is_valid) return <Badge variant="danger">누락: {c.missing_fields.join(', ')}</Badge>
  return <Badge>미발행</Badge>
}

export function HometaxCsvModal({ open, onClose, customerIds }: Props) {
  const today = todayYmdKst()
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<Busy>(null)
  const [mode, setMode] = useState<BoltaMode | 'loading'>('loading')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [defaultSupplier, setDefaultSupplier] = useState<Supplier | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [expandedCustIds, setExpandedCustIds] = useState<Set<string>>(new Set())
  const [writtenDates, setWrittenDates] = useState<Record<string, string>>({})

  // 모달 열릴 때 데이터 fetch (전체 candidates + suppliers 조회 후 선택 고객만 필터)
  useEffect(() => {
    if (!open) return
    setLoading(true)
    setMode('loading')
    void fetchBoltaMode().then(setMode)
    Promise.all([
      fetch('/api/admin/tax-invoice/candidates').then(r => r.ok ? r.json() : Promise.reject(new Error('candidates fetch 실패'))),
      fetch('/api/admin/tax-invoice/suppliers').then(r => r.ok ? r.json() : Promise.reject(new Error('suppliers fetch 실패'))),
    ])
      .then(([cRes, sRes]: [{ candidates?: Candidate[] }, { suppliers?: Supplier[] }]) => {
        const all = (cRes.candidates ?? []) as Candidate[]
        const custSet = new Set(customerIds)
        // 선택 고객의 "미발행" 건만 노출
        const filtered = all.filter(c => c.customer_id && custSet.has(c.customer_id) && !c.tax_invoice_issued)
        setCandidates(filtered)

        const sups = (sRes.suppliers ?? []) as Supplier[]
        setSuppliers(sups)
        setDefaultSupplier(sups.find(s => s.is_default) ?? sups[0] ?? null)

        // 작성일자 기본값: 입금일 → 없으면 오늘
        const dates: Record<string, string> = {}
        for (const c of filtered) dates[rowKey(c)] = paidDateOf(c) ?? today
        setWrittenDates(dates)

        // 1회성(= 해당 고객의 candidate 가 1건) 은 자동 체크해 번거로움 제거.
        // 정기케어는 결제이력 여러 건이라 사용자가 세부 선택.
        const byCust = new Map<string, Candidate[]>()
        for (const c of filtered) {
          const k = c.customer_id ?? ''
          if (!byCust.has(k)) byCust.set(k, [])
          byCust.get(k)!.push(c)
        }
        const auto = new Set<string>()
        for (const [, list] of byCust) {
          if (list.length === 1 && list[0].draft_issue_status !== 'requested') auto.add(rowKey(list[0]))
        }
        setSelectedKeys(auto)
        setExpandedCustIds(new Set())
      })
      .catch(e => {
        toast.error(e instanceof Error ? e.message : '데이터 로딩 실패')
      })
      .finally(() => setLoading(false))
  }, [open, customerIds, today])

  // 고객 단위로 그룹화
  const groups = useMemo(() => {
    const m = new Map<string, Candidate[]>()
    for (const c of candidates) {
      const k = c.customer_id ?? 'unknown'
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(c)
    }
    // 정렬: 1회성 → 정기딥 → 정기엔드, 그 안에서 업체명
    const entries = Array.from(m.entries())
    const order = (t: string | null) => t === '1회성케어' ? 0 : t === '정기딥케어' ? 1 : 2
    entries.sort(([, a], [, b]) => {
      const oa = order(a[0]?.service_type ?? null)
      const ob = order(b[0]?.service_type ?? null)
      if (oa !== ob) return oa - ob
      return (a[0]?.business_name ?? '').localeCompare(b[0]?.business_name ?? '')
    })
    return entries
  }, [candidates])

  const picked = useMemo(() => candidates.filter(c => selectedKeys.has(rowKey(c))), [candidates, selectedKeys])
  const pickedInvalid = useMemo(() => picked.filter(c => !c.is_valid), [picked])
  const boltaTargets = useMemo(() => picked.filter(c => c.is_valid && c.draft_issue_status !== 'requested'), [picked])
  const requestedAll = useMemo(() => candidates.filter(c => c.draft_issue_status === 'requested'), [candidates])

  function toggleOne(key: string) {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  function toggleCustAll(cands: Candidate[], toCheck: boolean) {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      for (const c of cands) {
        if (toCheck) next.add(rowKey(c))
        else next.delete(rowKey(c))
      }
      return next
    })
  }
  function toggleExpand(custId: string) {
    setExpandedCustIds(prev => {
      const next = new Set(prev)
      if (next.has(custId)) next.delete(custId)
      else next.add(custId)
      return next
    })
  }
  function setDate(key: string, value: string) {
    const ymd = toYmd(value)
    if (!ymd) return
    setWrittenDates(prev => ({ ...prev, [key]: ymd }))
  }

  /** 선택 건 검증. 문제가 있으면 토스트 띄우고 false */
  function precheck(list: Candidate[]): list is Candidate[] & { length: number } {
    if (list.length === 0) { toast.error('먼저 발행 대상을 선택하세요.'); return false }
    if (!defaultSupplier) { toast.error('공급자 정보 없음 — 세금계산서 탭에서 공급자를 먼저 등록하세요.'); return false }
    if (pickedInvalid.length > 0) { toast.error(`필수 정보 누락 ${pickedInvalid.length}건 — 세금계산서 탭에서 편집 필요`); return false }
    return true
  }

  const buildRows = (list: Candidate[]) =>
    list.map(c => buildHometaxRow(c, writtenDates[rowKey(c)] ?? today, suppliers, defaultSupplier!))

  // ── 홈택스 CSV (기존 동작) ────────────────────────────────
  async function handleCsv() {
    if (!precheck(picked)) return
    setBusy('csv')
    const t = toast.loading('홈택스 CSV 생성 중...')
    try {
      const result = await saveHometaxCsv(buildRows(picked), today)
      toast.dismiss(t)
      if (result.ok) {
        toast.success(`${result.count}건 Google Sheets 저장 완료`, { duration: 6000 })
        onClose()
      } else {
        toast.error(`Sheets 저장 실패 — 로컬 CSV 로 다운로드 (${result.error})`, { duration: 5000 })
      }
    } catch (e) {
      toast.dismiss(t)
      toast.error(e instanceof Error ? e.message : 'CSV 생성 실패')
    } finally {
      setBusy(null)
    }
  }

  // ── 볼타 발행 ─────────────────────────────────────────────
  async function handleBolta() {
    if (!precheck(picked)) return
    if (boltaTargets.length === 0) { toast.error('볼타로 발행할 수 있는 건이 없습니다 (이미 요청됨)'); return }
    const liveNote = mode === 'live' ? '\n\n⚠️ 실제 발행입니다. 국세청에 전송되며 취소는 수정세금계산서로만 가능합니다.' : ''
    if (!confirm(`선택한 ${boltaTargets.length}건을 볼타로 발행 요청할까요?${liveNote}`)) return
    setBusy('bolta')
    try {
      const rows = buildRows(boltaTargets)
      const result = await requestBoltaIssue(
        boltaTargets.map((c, i) => ({ source: c.source, source_id: c.source_id, customer_id: c.customer_id, row: rows[i] })),
        defaultSupplier?.id ?? null,
      )
      toast.success(summarizeIssueResult(result), { duration: 6000 })
      const problems = result.results.filter(r => r.status !== 'requested')
      for (const r of problems) {
        const name = candidates.find(c => c.source === r.source && c.source_id === r.source_id)?.business_name ?? r.source_id
        toast(`${name}: ${r.message}`, { duration: 8000, icon: r.status === 'failed' ? '❌' : 'ℹ️' })
      }
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '발행 요청 실패')
    } finally {
      setBusy(null)
    }
  }

  // ── 멈춘 요청 상태 재확인 ─────────────────────────────────
  async function handleRecheck() {
    if (requestedAll.length === 0) return
    setBusy('recheck')
    try {
      const results = await recheckBoltaRequested(requestedAll.map(c => ({ source: c.source, source_id: c.source_id })))
      for (const r of results) {
        const name = candidates.find(c => c.source === r.source && c.source_id === r.source_id)?.business_name ?? r.source_id
        toast(`${name}: ${r.message}`, { duration: 8000 })
      }
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '상태 확인 실패')
    } finally {
      setBusy(null)
    }
  }

  if (!open) return null

  const totalSelected = selectedKeys.size
  const boltaDisabled = busy !== null || mode === 'none' || mode === 'loading' || boltaTargets.length === 0

  const renderDate = (c: Candidate) => {
    const key = rowKey(c)
    const written = writtenDates[key] ?? today
    return (
      <span className="flex items-center gap-1.5 shrink-0">
        <Input type="date" size="sm" fullWidth={false} id={`hometax-written-${key}`}
          value={ymdToDateInput(written)} onChange={e => setDate(key, e.target.value)}
          className="h-8 text-xs w-36" aria-label={`${c.business_name} 작성일자`} />
        <DateBadge paidYmd={paidDateOf(c)} writtenYmd={written} today={today} />
      </span>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={() => { if (busy === null) onClose() }}
    >
      <div
        className="bg-white rounded-2xl shadow-modal max-w-4xl w-full max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-text-primary">🧾 홈택스 세금계산서 발행</h3>
            <ModeBadge mode={mode} />
          </div>
          <button type="button" onClick={onClose} className="text-text-tertiary hover:text-text-primary" aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        {/* 안내 */}
        <div className="px-5 py-2 bg-amber-50/60 border-b border-amber-100 text-[11px] text-amber-800 leading-snug">
          선택한 고객들의 <b>미발행 결제이력</b>만 노출됩니다. 1회성케어는 1건이 자동 체크되어 있고,
          정기딥/정기엔드케어는 월별 결제이력을 펼쳐서 체크하세요.
          작성일자는 <b>입금일</b>로 채워지며 직접 고칠 수 있습니다.
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-text-tertiary text-center py-10">불러오는 중...</p>
          ) : groups.length === 0 ? (
            <div className="text-sm text-text-tertiary text-center py-10 leading-relaxed">
              발행 대상이 없습니다.<br />
              선택한 고객들의 미발행 결제이력이 없거나, 이미 세금계산서가 발행된 상태입니다.
            </div>
          ) : (
            <div className="space-y-2">
              {groups.map(([custId, cands]) => {
                const isExpanded = expandedCustIds.has(custId)
                const selectedCount = cands.filter(c => selectedKeys.has(rowKey(c))).length
                const first = cands[0]
                const allChecked = selectedCount === cands.length
                const isMultiBilling = cands.length > 1
                return (
                  <div key={custId} className="border border-border-subtle rounded-lg overflow-hidden bg-white">
                    {/* 아코디언 헤더 (고객 요약) */}
                    <div className="flex items-center gap-2 px-3 py-2 hover:bg-surface-sunken flex-wrap">
                      <button
                        type="button"
                        onClick={() => toggleExpand(custId)}
                        className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                      >
                        {isMultiBilling ? (
                          isExpanded ? <ChevronDown size={14} className="text-text-tertiary shrink-0" />
                                     : <ChevronRight size={14} className="text-text-tertiary shrink-0" />
                        ) : (
                          <span className="w-[14px] shrink-0" />
                        )}
                        <span className="text-sm font-medium text-text-primary truncate">{first.business_name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium shrink-0">
                          {first.service_type ?? '-'}
                        </span>
                      </button>
                      {isMultiBilling ? (
                        <span className="text-xs shrink-0">
                          <span className={selectedCount > 0 ? 'text-brand-600 font-semibold' : 'text-text-tertiary'}>
                            ✓ {selectedCount}건
                          </span>
                          <span className="text-text-tertiary"> / {cands.length}건</span>
                        </span>
                      ) : (
                        <>
                          {renderDate(first)}
                          <IssueBadge c={first} />
                          <label className="flex items-center gap-1 text-xs shrink-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedKeys.has(rowKey(first))}
                              onChange={() => toggleOne(rowKey(first))}
                              className="accent-brand-600"
                            />
                            <span className="text-text-tertiary">{fmtKr(first.total_amount)}원</span>
                          </label>
                        </>
                      )}
                    </div>
                    {!isMultiBilling && first.invoice_note && (
                      <p className="px-3 pb-2 -mt-1 text-[11px] text-amber-700 break-keep">ℹ️ {first.invoice_note}</p>
                    )}

                    {/* 아코디언 본문 (정기케어 등 다건) */}
                    {isMultiBilling && isExpanded && (
                      <div className="border-t border-border-subtle bg-surface-sunken/30">
                        <div className="px-3 py-1.5 flex items-center justify-end border-b border-border-subtle/60">
                          <button
                            type="button"
                            onClick={() => toggleCustAll(cands, !allChecked)}
                            className="text-[10px] text-brand-600 hover:text-brand-700 font-medium"
                          >
                            {allChecked ? '전부 해제' : '전부 선택'}
                          </button>
                        </div>
                        <div className="divide-y divide-border-subtle/60">
                          {cands.map(c => {
                            const key = rowKey(c)
                            return (
                              <div key={key} className="flex items-center gap-2 px-4 py-2 hover:bg-white flex-wrap">
                                <label className="flex items-center gap-2 cursor-pointer min-w-[200px]">
                                  <input
                                    type="checkbox"
                                    checked={selectedKeys.has(key)}
                                    onChange={() => toggleOne(key)}
                                    className="accent-brand-600"
                                  />
                                  <span className="text-sm text-text-primary">{c.display_period ?? c.construction_date ?? '-'}</span>
                                  <span className="text-sm text-text-primary font-medium">{fmtKr(c.total_amount)}원</span>
                                </label>
                                {renderDate(c)}
                                <IssueBadge c={c} />
                                {c.draft_tax_invoice_url && (
                                  <a href={c.draft_tax_invoice_url} target="_blank" rel="noreferrer"
                                    className="text-brand-600 hover:text-brand-700" title="볼타 계산서 보기">
                                    <ExternalLink size={12} />
                                  </a>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border-subtle bg-surface-sunken/30 flex-wrap">
          <span className="text-sm text-text-secondary">
            총 <b className="text-text-primary">{totalSelected}</b>건 선택
            {pickedInvalid.length > 0 && <span className="text-state-danger"> · 누락 {pickedInvalid.length}건</span>}
          </span>
          <div className="flex gap-2 flex-wrap">
            {requestedAll.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleRecheck}
                disabled={busy !== null || mode === 'none' || mode === 'loading'}
                className="flex items-center gap-1.5"
                title="볼타 응답을 못 받아 '요청됨'으로 멈춘 건의 접수 여부를 확인합니다">
                <RefreshCw size={13} className={busy === 'recheck' ? 'animate-spin' : ''} />요청 상태 확인 ({requestedAll.length})
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={onClose} disabled={busy !== null}>취소</Button>
            <Button variant="secondary" size="sm" onClick={handleCsv}
              disabled={busy !== null || totalSelected === 0}
              className="flex items-center gap-1.5">
              <Download size={13} />{busy === 'csv' ? '생성 중...' : '홈택스 CSV 생성'}
            </Button>
            <Button variant="primary" size="sm" onClick={handleBolta}
              disabled={boltaDisabled}
              className="flex items-center gap-1.5"
              title={mode === 'none' ? 'BOLTA_API_KEY 미설정' : '볼타 API로 즉시 발행 요청'}>
              <Send size={13} />{busy === 'bolta' ? '요청 중...' : `볼타로 발행 (${boltaTargets.length})`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
