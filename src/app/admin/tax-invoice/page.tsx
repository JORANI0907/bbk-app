'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { RefreshCw, Download, Filter, Search, AlertCircle, CheckCircle2, FileSpreadsheet, Settings, Pencil, Check, Undo2 } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { DraftEditor } from './DraftEditor'

type Source = 'application' | 'billing'

interface Candidate {
  source: Source
  source_id: string
  service_type: string | null
  business_name: string
  business_number: string | null
  owner_name: string
  address: string | null
  email: string | null
  phone: string | null
  payment_method: string | null
  supply_amount: number
  vat: number
  total_amount: number
  billing_period: string | null
  construction_date: string | null
  created_at: string
  tax_invoice_issued: boolean
  tax_invoice_issued_at: string | null
  is_valid: boolean
  missing_fields: string[]
  has_draft: boolean
  draft_supplier_id: string | null
  draft_items: Array<{ name: string; qty?: number; unit_price?: number; supply_amount?: number; vat?: number; spec?: string; remark?: string }> | null
}

const SERVICE_TYPES_FALLBACK = ['1회성케어', '정기딥케어', '정기엔드케어']

// 결제방법 필터 화이트리스트 — 실제 DB에는 편차·오타 포함 다양한 값이 있지만
// 사용자가 실제로 필터링하고 싶은 4가지만 노출
const ALLOWED_PAYMENT_METHODS = [
  '현금(계산서 희망)',
  '현금(비과세)',
  '플랫폼',
  '카드(온라인 간편결제)',
]

interface Supplier {
  id: string
  label: string
  registration_number: string
  company_name: string
  representative: string
  address: string
  business_type: string
  business_item: string
  email: string
  is_default: boolean
}

// 프리셋 로드 실패 시 fallback
const FALLBACK_SUPPLIER: Supplier = {
  id: '',
  label: '기본',
  registration_number: '2987800455',
  company_name: '범빌드코리아',
  representative: '조동환',
  address: '경기도 성남시 중원구 둔촌대로268번길22, 201호',
  business_type: '사업시설 관리, 사업지원 및 임대 서비스업',
  business_item: '건축물 일반 청소업',
  email: 'sunrise@bbkorea.co.kr',
  is_default: true,
}

const fmtKr = (n: number) => n.toLocaleString('ko-KR')
const fmtDate = (s: string | null) => s ? s.slice(0, 10) : '—'

// 홈택스 일괄발급 CSV 헤더 순서 (tax-invoice-auto 스키마와 일치)
const CSV_HEADERS = [
  '공급자등록번호', '공급자상호', '공급자대표자', '공급자주소', '공급자업태', '공급자종목', '공급자이메일',
  '공급받는자등록번호', '공급받는자상호', '공급받는자대표자', '공급받는자주소', '공급받는자이메일',
  '공급가액', '세액', '공급가액1', '세액1',
  '계산서종류', '작성일자', '일자1', '영수청구구분',
] as const

function todayYmd(): { yyyymmdd: string; ddQuoted: string } {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  return { yyyymmdd: `${y}${m}${d}`, ddQuoted: `'${d}` }
}

function csvEscape(v: string | number): string {
  const s = String(v ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export default function TaxInvoiceDashboardPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)

  // 필터 (다중 선택)
  const [includeIssued, setIncludeIssued] = useState(false)
  const [serviceTypes, setServiceTypes] = useState<string[]>([])
  const [paymentMethods, setPaymentMethods] = useState<string[]>([])
  const [search, setSearch] = useState('')

  // 필터 옵션 (서버에서 로드)
  const [availableServiceTypes, setAvailableServiceTypes] = useState<string[]>(SERVICE_TYPES_FALLBACK)
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState<string[]>(ALLOWED_PAYMENT_METHODS)

  // 선택
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 편집 Drawer
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null)

  // 발행 완료 처리 로딩
  const [markingIssued, setMarkingIssued] = useState(false)

  // 공급자 프리셋
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('')

  const supplier: Supplier = suppliers.find(s => s.id === selectedSupplierId)
    ?? suppliers.find(s => s.is_default)
    ?? suppliers[0]
    ?? FALLBACK_SUPPLIER

  // 프리셋 로드
  useEffect(() => {
    fetch('/api/admin/tax-invoice/suppliers')
      .then(r => r.json())
      .then(d => {
        const list: Supplier[] = d.suppliers ?? []
        setSuppliers(list)
        const def = list.find(s => s.is_default) ?? list[0]
        if (def) setSelectedSupplierId(def.id)
      })
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (includeIssued) params.set('include_issued', 'true')
      if (serviceTypes.length > 0) params.set('service_type', serviceTypes.join(','))
      if (paymentMethods.length > 0) params.set('payment_method', paymentMethods.join(','))
      const res = await fetch(`/api/admin/tax-invoice/candidates?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '조회 실패')
      setCandidates(json.candidates ?? [])
      if (Array.isArray(json.available_service_types) && json.available_service_types.length > 0) {
        setAvailableServiceTypes(json.available_service_types)
      }
      if (Array.isArray(json.available_payment_methods)) {
        // 화이트리스트 교집합만 노출 (DB에 존재하는 값 중 ALLOWED_PAYMENT_METHODS 만)
        const filtered = ALLOWED_PAYMENT_METHODS.filter(m => json.available_payment_methods.includes(m))
        // DB에 없어도 화이트리스트는 그대로 노출 (선택은 가능)
        setAvailablePaymentMethods(filtered.length > 0 ? filtered : ALLOWED_PAYMENT_METHODS)
      }
      setLoadedAt(new Date())
      setSelectedIds(new Set())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [includeIssued, serviceTypes, paymentMethods])

  useEffect(() => { void load() }, [load])

  const filteredCandidates = useMemo(() => {
    if (!search.trim()) return candidates
    const q = search.trim().toLowerCase()
    return candidates.filter(c =>
      c.business_name.toLowerCase().includes(q) ||
      c.owner_name.toLowerCase().includes(q) ||
      (c.business_number ?? '').toLowerCase().includes(q)
    )
  }, [candidates, search])

  const rowKey = (c: Candidate) => `${c.source}:${c.source_id}`

  const toggleOne = (c: Candidate) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      const k = rowKey(c)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }

  const allSelectable = filteredCandidates.filter(c => c.is_valid)
  const allSelected = allSelectable.length > 0 && allSelectable.every(c => selectedIds.has(rowKey(c)))
  const someSelected = allSelectable.some(c => selectedIds.has(rowKey(c)))

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allSelectable.map(rowKey)))
    }
  }

  const stats = useMemo(() => {
    const total = filteredCandidates.length
    const valid = filteredCandidates.filter(c => c.is_valid).length
    const missing = total - valid
    const alreadyIssued = filteredCandidates.filter(c => c.tax_invoice_issued).length
    const sumAmount = filteredCandidates
      .filter(c => selectedIds.has(rowKey(c)))
      .reduce((s, c) => s + c.total_amount, 0)
    return { total, valid, missing, alreadyIssued, sumAmount, selected: selectedIds.size }
  }, [filteredCandidates, selectedIds])

  // ── 발행 완료 처리 (선택된 항목 전체) ─────────────────
  const handleMarkIssued = async () => {
    const selected = filteredCandidates.filter(c => selectedIds.has(rowKey(c)))
    if (selected.length === 0) { toast.error('먼저 항목을 선택하세요.'); return }
    if (!confirm(`선택한 ${selected.length}건을 발행 완료 처리할까요?\n두 소스 모두 반영되며, 감사 로그가 남습니다.`)) return

    setMarkingIssued(true)
    try {
      const res = await fetch('/api/admin/tax-invoice/mark-issued', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selected.map(c => ({ source: c.source, source_id: c.source_id })),
          supplier_id: supplier.id || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '처리 실패')
      toast.success(`발행 완료 처리: 서비스 ${json.updated_applications}건 · 고객 ${json.updated_billings}건`)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '처리 실패')
    } finally {
      setMarkingIssued(false)
    }
  }

  // ── 발행 취소 (재발행 필요 시) ─────────────────────────
  const handleRevertIssued = async () => {
    const selected = filteredCandidates.filter(c => selectedIds.has(rowKey(c)) && c.tax_invoice_issued)
    if (selected.length === 0) { toast.error('발행 완료 상태인 항목만 취소할 수 있습니다.'); return }
    const reason = prompt(`선택한 ${selected.length}건을 발행 취소할까요?\n사유(선택):`, '재발행')
    if (reason === null) return

    setMarkingIssued(true)
    try {
      const res = await fetch('/api/admin/tax-invoice/mark-issued', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selected.map(c => ({ source: c.source, source_id: c.source_id })),
          void_reason: reason || '재발행',
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '취소 실패')
      toast.success(`발행 취소: 서비스 ${json.reverted_applications}건 · 고객 ${json.reverted_billings}건`)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '취소 실패')
    } finally {
      setMarkingIssued(false)
    }
  }

  // ── CSV 다운로드 ────────────────────────────────────────
  const handleDownloadCsv = () => {
    const selected = filteredCandidates.filter(c => selectedIds.has(rowKey(c)))
    if (selected.length === 0) {
      toast.error('먼저 발행 대상을 선택하세요.')
      return
    }
    const invalidSelected = selected.filter(c => !c.is_valid)
    if (invalidSelected.length > 0) {
      toast.error(`필수 정보 누락 ${invalidSelected.length}건 — 편집 후 다시 시도`)
      return
    }

    const { yyyymmdd, ddQuoted } = todayYmd()
    const rows = selected.map(c => {
      // 이 건에 draft.supplier_id 가 지정되어 있으면 그 공급자로 override
      const rowSupplier = c.draft_supplier_id
        ? (suppliers.find(s => s.id === c.draft_supplier_id) ?? supplier)
        : supplier
      return {
      공급자등록번호:   rowSupplier.registration_number,
      공급자상호:       rowSupplier.company_name,
      공급자대표자:     rowSupplier.representative,
      공급자주소:       rowSupplier.address,
      공급자업태:       rowSupplier.business_type,
      공급자종목:       rowSupplier.business_item,
      공급자이메일:     rowSupplier.email,
      공급받는자등록번호: c.business_number ?? '',
      공급받는자상호:     c.business_name ?? '',
      공급받는자대표자:   c.owner_name ?? '',
      공급받는자주소:     c.address ?? '',
      공급받는자이메일:   c.email ?? '',
      공급가액:  c.supply_amount,
      세액:      c.vat,
      공급가액1: c.supply_amount,
      세액1:     c.vat,
      계산서종류:   "'01",
      작성일자:     yyyymmdd,
      일자1:        ddQuoted,
      영수청구구분: "'01",
      }
    })

    const csv = [
      CSV_HEADERS.join(','),
      ...rows.map(r => CSV_HEADERS.map(h => csvEscape(r[h as keyof typeof r])).join(',')),
    ].join('\r\n')

    // UTF-8 BOM (Excel/한글 호환)
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `세금계산서_${yyyymmdd}_${rows.length}건.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`${rows.length}건 CSV 다운로드 완료`)
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-text-primary tracking-tight">세금계산서 발행 대시보드</h1>
          <p className="text-xs text-text-tertiary mt-1">
            정기엔드케어(고객관리) + 1회성·정기딥케어(서비스관리) 통합 발행 대상
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-text-tertiary uppercase tracking-wide">공급자</label>
            <select
              value={selectedSupplierId}
              onChange={e => setSelectedSupplierId(e.target.value)}
              className="text-sm rounded-md border border-border bg-surface px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 max-w-[200px] truncate"
            >
              {suppliers.length === 0 && <option value="">기본 (fallback)</option>}
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.label}{s.is_default ? ' ★' : ''}
                </option>
              ))}
            </select>
          </div>
          <Link href="/admin/tax-invoice/suppliers"
            className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium underline px-1">
            <Settings size={11} />관리
          </Link>
          <Button size="sm" onClick={handleDownloadCsv}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-1.5">
            <Download size={13} />CSV ({selectedIds.size})
          </Button>
          <Button size="sm" variant="secondary" onClick={handleMarkIssued}
            disabled={selectedIds.size === 0 || markingIssued}
            className="flex items-center gap-1.5 text-state-success">
            <Check size={13} />발행 완료
          </Button>
          <Button size="sm" variant="secondary" onClick={handleRevertIssued}
            disabled={selectedIds.size === 0 || markingIssued}
            className="flex items-center gap-1.5 text-state-danger"
            title="발행 완료 상태를 취소 (재발행 필요 시)">
            <Undo2 size={13} />취소
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface border border-border-subtle rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
          <Filter size={12} />
          <span>필터 (중복 선택 가능)</span>
          {(serviceTypes.length > 0 || paymentMethods.length > 0) && (
            <button type="button"
              onClick={() => { setServiceTypes([]); setPaymentMethods([]) }}
              className="ml-auto text-[11px] text-brand-600 hover:text-brand-700 underline">
              전체 해제
            </button>
          )}
        </div>

        {/* 서비스 유형 뱃지 */}
        <FilterBadgeGroup
          label="유형"
          options={availableServiceTypes}
          selected={serviceTypes}
          onToggle={(v) => setServiceTypes(prev =>
            prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
          )}
        />

        {/* 결제방법 뱃지 */}
        <FilterBadgeGroup
          label="결제"
          options={availablePaymentMethods}
          selected={paymentMethods}
          onToggle={(v) => setPaymentMethods(prev =>
            prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
          )}
        />

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border-subtle">
          <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={includeIssued}
              onChange={e => setIncludeIssued(e.target.checked)}
              className="accent-brand-600"
            />
            발행 완료 포함
          </label>
          <div className="flex-1 min-w-[180px]">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
              <Input
                placeholder="업체명·대표자·사업자번호"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={load} disabled={loading}
            className="flex items-center gap-1.5">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />새로고침
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3">
        <StatCard label="전체" value={stats.total} />
        <StatCard label="유효" value={stats.valid} tone="success" />
        <StatCard label="정보 누락" value={stats.missing} tone={stats.missing > 0 ? 'warning' : 'muted'} />
        <StatCard label={`선택 (${stats.selected}건)`} value={`${fmtKr(stats.sumAmount)}원`} tone="brand" small />
      </div>

      {/* Table */}
      <div className="bg-surface rounded-2xl border border-border-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-surface-sunken border-b border-border-subtle">
              <tr>
                <th className="w-10 py-2.5 pl-4">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = !allSelected && someSelected }}
                    onChange={toggleAll}
                    className="accent-brand-600"
                  />
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-text-secondary">유형</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-text-secondary">업체명</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-text-secondary">대표자</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-text-secondary">사업자번호</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-text-secondary">결제방법</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-text-secondary">공급가액</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-text-secondary">세액</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-text-secondary">합계</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-text-secondary">기준일</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-text-secondary">상태</th>
                <th className="w-16 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {loading ? (
                <tr><td colSpan={12} className="py-16 text-center text-sm text-text-tertiary">로딩 중…</td></tr>
              ) : filteredCandidates.length === 0 ? (
                <tr><td colSpan={12} className="py-16 text-center text-sm text-text-tertiary">
                  <FileSpreadsheet size={28} className="mx-auto opacity-30 mb-2" />
                  발행 대상이 없습니다.
                </td></tr>
              ) : filteredCandidates.map(c => {
                const key = rowKey(c)
                const isSelected = selectedIds.has(key)
                const canSelect = c.is_valid
                return (
                  <tr key={key} className={`transition-colors ${isSelected ? 'bg-brand-50/50' : 'hover:bg-surface-sunken'}`}>
                    <td className="py-2 pl-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!canSelect}
                        onChange={() => toggleOne(c)}
                        className="accent-brand-600 disabled:opacity-30"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <SourceBadge source={c.source} label={c.service_type ?? ''} />
                    </td>
                    <td className="px-3 py-2 font-medium text-text-primary truncate max-w-[220px]">{c.business_name}</td>
                    <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{c.owner_name}</td>
                    <td className="px-3 py-2 text-text-secondary tabular-nums whitespace-nowrap">
                      {c.business_number || <span className="text-state-danger text-xs">누락</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-text-secondary whitespace-nowrap max-w-[160px] truncate" title={c.payment_method ?? undefined}>
                      {c.payment_method || <span className="text-text-tertiary">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-text-primary">{fmtKr(c.supply_amount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-text-tertiary">{fmtKr(c.vat)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-text-primary">{fmtKr(c.total_amount)}</td>
                    <td className="px-3 py-2 text-text-tertiary whitespace-nowrap text-xs">
                      {c.construction_date ?? fmtDate(c.created_at)}
                      {c.billing_period && <span className="ml-1 text-[10px]">({c.billing_period})</span>}
                    </td>
                    <td className="px-3 py-2">
                      <RowStatus c={c} />
                    </td>
                    <td className="pr-3 py-2 text-right">
                      <button type="button"
                        onClick={() => setEditingCandidate(c)}
                        className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border transition-colors ${
                          c.has_draft
                            ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                            : 'border-border-subtle text-text-secondary hover:bg-surface-sunken'
                        }`}
                        title={c.has_draft ? '편집된 초안이 있습니다' : '발행 전 편집'}>
                        <Pencil size={11} />
                        {c.has_draft ? '편집됨' : '편집'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-text-tertiary text-center">
        {loadedAt && `${loadedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 기준`}
      </div>

      {/* 편집 Drawer */}
      {editingCandidate && (
        <DraftEditor
          candidate={editingCandidate}
          suppliers={suppliers}
          onClose={() => setEditingCandidate(null)}
          onSaved={() => { setEditingCandidate(null); void load() }}
        />
      )}

      {/* 현재 선택된 공급자 상세 미리보기 (접기 가능) */}
      <details className="bg-surface border border-border-subtle rounded-2xl">
        <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-text-secondary flex items-center justify-between">
          <span>선택된 공급자 정보 · <b className="text-text-primary">{supplier.label}</b></span>
          <Link href="/admin/tax-invoice/suppliers"
            onClick={e => e.stopPropagation()}
            className="text-[11px] text-brand-600 hover:text-brand-700 underline">
            편집
          </Link>
        </summary>
        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <SupplierRow label="상호" value={supplier.company_name} />
          <SupplierRow label="대표자" value={supplier.representative} />
          <SupplierRow label="사업자번호" value={supplier.registration_number} />
          <SupplierRow label="이메일" value={supplier.email} />
          <SupplierRow label="업태" value={supplier.business_type} />
          <SupplierRow label="종목" value={supplier.business_item} />
          <SupplierRow label="주소" value={supplier.address} full />
        </div>
      </details>

    </div>
  )
}

function FilterBadgeGroup({ label, options, selected, onToggle }: {
  label: string
  options: string[]
  selected: string[]
  onToggle: (v: string) => void
}) {
  if (options.length === 0) return null
  return (
    <div className="flex flex-wrap items-start gap-2">
      <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide w-10 shrink-0 pt-1">{label}</span>
      <div className="flex flex-wrap gap-1.5 flex-1">
        {options.map(opt => {
          const isSelected = selected.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors whitespace-nowrap ${
                isSelected
                  ? 'bg-brand-600 border-brand-600 text-white'
                  : 'bg-surface border-border text-text-secondary hover:border-brand-400 hover:text-brand-600'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SupplierRow({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={`${full ? 'sm:col-span-2' : ''} flex gap-2 py-0.5`}>
      <span className="text-text-tertiary w-20 shrink-0">{label}</span>
      <span className="text-text-primary truncate">{value || <span className="text-text-tertiary">—</span>}</span>
    </div>
  )
}

// ─── 소소한 컴포넌트들 ─────────────────────────────────────

function StatCard({ label, value, tone = 'default', small = false }: {
  label: string; value: number | string
  tone?: 'default' | 'success' | 'warning' | 'muted' | 'brand'
  small?: boolean
}) {
  const toneClass = {
    default: 'text-text-primary',
    success: 'text-state-success',
    warning: 'text-state-warning',
    muted:   'text-text-tertiary',
    brand:   'text-brand-600',
  }[tone]
  return (
    <div className="bg-surface border border-border-subtle rounded-xl p-3">
      <p className="text-[11px] text-text-tertiary">{label}</p>
      <p className={`${small ? 'text-base' : 'text-xl'} font-bold ${toneClass} tabular-nums mt-1`}>{value}</p>
    </div>
  )
}

function SourceBadge({ source, label }: { source: Source; label: string }) {
  const isApp = source === 'application'
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium w-fit ${
        isApp ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
      }`}>
        {isApp ? '서비스' : '고객'}
      </span>
      <span className="text-[11px] text-text-secondary truncate max-w-[110px]">{label || '—'}</span>
    </div>
  )
}

function RowStatus({ c }: { c: Candidate }) {
  if (c.tax_invoice_issued) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-state-success">
        <CheckCircle2 size={11} />발행완료
        {c.tax_invoice_issued_at && <span className="text-text-tertiary">({fmtDate(c.tax_invoice_issued_at)})</span>}
      </span>
    )
  }
  if (!c.is_valid) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-state-warning" title={`누락: ${c.missing_fields.join(', ')}`}>
        <AlertCircle size={11} />정보 누락
      </span>
    )
  }
  return <span className="text-[11px] text-text-tertiary">미발행</span>
}

