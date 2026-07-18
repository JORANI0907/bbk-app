'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { RefreshCw, Download, Filter, Search, AlertCircle, CheckCircle2, FileSpreadsheet, Settings } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

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
}

const SERVICE_TYPES = ['1회성케어', '정기딥케어', '정기엔드케어'] as const
type ServiceType = typeof SERVICE_TYPES[number] | ''

// 임시 공급자 (Phase 2에서 프리셋 관리로 교체)
const DEFAULT_SUPPLIER = {
  registration_number: '2987800455',
  company_name: '범빌드코리아',
  representative: '조동환',
  address: '경기도 성남시 중원구 둔촌대로268번길22, 201호',
  business_type: '사업시설 관리, 사업지원 및 임대 서비스업',
  business_item: '건축물 일반 청소업',
  email: 'sunrise@bbkorea.co.kr',
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

  // 필터
  const [includeIssued, setIncludeIssued] = useState(false)
  const [serviceType, setServiceType] = useState<ServiceType>('')
  const [search, setSearch] = useState('')

  // 선택
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 공급자 편집 모달
  const [supplier, setSupplier] = useState(DEFAULT_SUPPLIER)
  const [showSupplierEditor, setShowSupplierEditor] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (includeIssued) params.set('include_issued', 'true')
      if (serviceType) params.set('service_type', serviceType)
      const res = await fetch(`/api/admin/tax-invoice/candidates?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '조회 실패')
      setCandidates(json.candidates ?? [])
      setLoadedAt(new Date())
      setSelectedIds(new Set())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [includeIssued, serviceType])

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

  const allSelectable = filteredCandidates.filter(c => c.is_valid && !c.tax_invoice_issued)
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
    const rows = selected.map(c => ({
      공급자등록번호:   supplier.registration_number,
      공급자상호:       supplier.company_name,
      공급자대표자:     supplier.representative,
      공급자주소:       supplier.address,
      공급자업태:       supplier.business_type,
      공급자종목:       supplier.business_item,
      공급자이메일:     supplier.email,
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
    }))

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
          <Button variant="secondary" size="sm" onClick={() => setShowSupplierEditor(true)}
            className="flex items-center gap-1.5">
            <Settings size={13} />공급자 편집
          </Button>
          <Link href="/admin/tax-invoice/suppliers" className="text-xs text-brand-600 hover:text-brand-700 font-medium underline px-2">
            공급자 프리셋 →
          </Link>
          <Button size="sm" onClick={handleDownloadCsv}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-1.5">
            <Download size={13} />CSV 다운로드 ({selectedIds.size})
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface border border-border-subtle rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-text-tertiary shrink-0">
          <Filter size={12} />필터
        </div>
        <select
          value={serviceType}
          onChange={e => setServiceType(e.target.value as ServiceType)}
          className="text-sm rounded-md border border-border bg-surface px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
        >
          <option value="">전체 유형</option>
          {SERVICE_TYPES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
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
          <table className="w-full min-w-[900px] text-sm">
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
                <th className="text-right px-3 py-2.5 text-xs font-medium text-text-secondary">공급가액</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-text-secondary">세액</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-text-secondary">합계</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-text-secondary">기준일</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-text-secondary">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {loading ? (
                <tr><td colSpan={10} className="py-16 text-center text-sm text-text-tertiary">로딩 중…</td></tr>
              ) : filteredCandidates.length === 0 ? (
                <tr><td colSpan={10} className="py-16 text-center text-sm text-text-tertiary">
                  <FileSpreadsheet size={28} className="mx-auto opacity-30 mb-2" />
                  발행 대상이 없습니다.
                </td></tr>
              ) : filteredCandidates.map(c => {
                const key = rowKey(c)
                const isSelected = selectedIds.has(key)
                const canSelect = c.is_valid && !c.tax_invoice_issued
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

      {/* Supplier Editor Modal */}
      {showSupplierEditor && (
        <SupplierEditorModal
          initial={supplier}
          onClose={() => setShowSupplierEditor(false)}
          onSave={(next) => { setSupplier(next); setShowSupplierEditor(false); toast.success('공급자 정보가 이번 세션에 적용됐습니다.') }}
        />
      )}
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

// ─── 공급자 편집 모달 ─────────────────────────────────────
function SupplierEditorModal({
  initial, onClose, onSave,
}: {
  initial: typeof DEFAULT_SUPPLIER
  onClose: () => void
  onSave: (v: typeof DEFAULT_SUPPLIER) => void
}) {
  const [form, setForm] = useState(initial)
  const update = <K extends keyof typeof DEFAULT_SUPPLIER>(k: K, v: string) =>
    setForm(p => ({ ...p, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-text-primary">공급자 정보 편집</h2>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary text-2xl leading-none">×</button>
        </div>
        <p className="text-[11px] text-text-tertiary mb-4">
          이번 세션(다운로드) 에만 적용됩니다. 여러 사업자를 관리하려면 우측 상단의 <b>공급자 프리셋</b>을 사용하세요.
        </p>
        <div className="space-y-3">
          {[
            ['registration_number', '사업자등록번호', '000-00-00000'],
            ['company_name', '상호'],
            ['representative', '대표자'],
            ['address', '주소'],
            ['business_type', '업태'],
            ['business_item', '종목'],
            ['email', '이메일'],
          ].map(([key, label, placeholder]) => (
            <div key={key}>
              <label className="block text-[11px] font-medium text-text-tertiary uppercase tracking-wide mb-1">
                {label}
              </label>
              <Input
                value={form[key as keyof typeof DEFAULT_SUPPLIER]}
                onChange={e => update(key as keyof typeof DEFAULT_SUPPLIER, e.target.value)}
                placeholder={placeholder}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 mt-6">
          <Button variant="secondary" size="sm" onClick={onClose}>취소</Button>
          <Button size="sm" onClick={() => onSave(form)}>적용</Button>
        </div>
      </div>
    </div>
  )
}
