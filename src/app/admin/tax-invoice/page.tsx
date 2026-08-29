'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { RefreshCw, Download, Filter, Search, AlertCircle, CheckCircle2, FileSpreadsheet, Settings, Pencil, Check, Undo2, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { DraftEditor } from './DraftEditor'
import { buildHometaxCsv, todayYmdKst, type HometaxRow, type HometaxItem } from '@/lib/hometax-csv'

type Source = 'application' | 'billing'

interface Candidate {
  source: Source
  source_id: string         // application.id 또는 billing.id
  customer_id: string | null
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
  billing_id: string | null
  billing_period: string | null
  billing_type: 'monthly' | 'annual' | null
  display_period: string | null
  effective_month: string | null
  billing_status: 'pending' | 'paid' | 'overdue' | null
  application_id: string | null
  construction_date: string | null
  created_at: string
  tax_invoice_issued: boolean
  tax_invoice_issued_at: string | null
  is_valid: boolean
  missing_fields: string[]
  has_draft: boolean
  draft_supplier_id: string | null
  draft_items: Array<{ name: string; qty?: number; unit_price?: number; supply_amount?: number; vat?: number; spec?: string; remark?: string }> | null
  draft_receiver_business_type: string | null
  draft_receiver_business_item: string | null
  draft_receiver_email_2: string | null
  draft_receipt_type: string | null
  draft_invoice_kind: string | null
  application_status?: string | null
  payment_status_detail?: string | null
  customer_payment_status_detail?: string | null
  account_number?: string | null
  /** 예약금 이체 완료 시각 (신규 컬럼, 미이체이면 null) */
  deposit_transferred_at?: string | null
}

const SERVICE_TYPES_FIXED = ['1회성케어', '정기딥케어', '정기엔드케어']

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
const fmtMan = (n: number) => {
  if (n === 0) return '0'
  if (n < 10000) return `${n.toLocaleString('ko-KR')}원`
  const man = n / 10000
  return Number.isInteger(man) ? `${man}만원` : `${parseFloat(man.toFixed(1))}만원`
}

export default function TaxInvoiceDashboardPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)

  const [includeIssued, setIncludeIssued] = useState(false)
  const [serviceTypes, setServiceTypes] = useState<string[]>([])
  const [paymentMethods, setPaymentMethods] = useState<string[]>([])
  const [search, setSearch] = useState('')

  // 월단위 뷰 (기본: 현재 월)
  const [viewMonth, setViewMonth] = useState<string | null>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null)
  const [markingIssued, setMarkingIssued] = useState(false)

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('')

  const supplier: Supplier = suppliers.find(s => s.id === selectedSupplierId)
    ?? suppliers.find(s => s.is_default)
    ?? suppliers[0]
    ?? FALLBACK_SUPPLIER

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
  }, [includeIssued, serviceTypes])

  useEffect(() => { void load() }, [load])

  const availablePaymentMethods = useMemo(() => {
    const methods = new Set<string>()
    candidates.forEach(c => { if (c.payment_method) methods.add(c.payment_method) })
    return Array.from(methods).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [candidates])

  const filteredCandidates = useMemo(() => {
    let list = candidates
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c =>
        c.business_name.toLowerCase().includes(q) ||
        c.owner_name.toLowerCase().includes(q) ||
        (c.business_number ?? '').toLowerCase().includes(q)
      )
    }
    if (paymentMethods.length > 0) {
      list = list.filter(c => c.payment_method && paymentMethods.includes(c.payment_method))
    }
    return list
  }, [candidates, search, paymentMethods])

  // 월 필터 (effective_month 기준 — 클라이언트 사이드)
  const monthFilteredCandidates = useMemo(() => {
    if (!viewMonth) return filteredCandidates
    return filteredCandidates.filter(c => c.effective_month === viewMonth)
  }, [filteredCandidates, viewMonth])

  // 1회성케어(시공일자 DESC) → 정기케어(기간 DESC) 순
  const sortedCandidates = useMemo(() => {
    const oneTime = monthFilteredCandidates.filter(c => c.source === 'application')
    const billings = monthFilteredCandidates.filter(c => c.source === 'billing')
    const sortedOneTime = [...oneTime].sort((a, b) => {
      if (!a.construction_date && !b.construction_date) return 0
      if (!a.construction_date) return 1
      if (!b.construction_date) return -1
      return b.construction_date.localeCompare(a.construction_date)
    })
    const sortedBillings = [...billings].sort((a, b) => {
      const ap = a.billing_period ?? ''
      const bp = b.billing_period ?? ''
      if (ap !== bp) return bp.localeCompare(ap)
      return a.business_name.localeCompare(b.business_name, 'ko')
    })
    return [...sortedOneTime, ...sortedBillings]
  }, [monthFilteredCandidates])

  const rowKey = (c: Candidate) => `${c.source}:${c.source_id}`

  const toggleOne = (c: Candidate) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      const k = rowKey(c)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }

  const allSelectable = monthFilteredCandidates.filter(c => c.is_valid)
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
    const total = monthFilteredCandidates.length
    const valid = monthFilteredCandidates.filter(c => c.is_valid).length
    const missing = total - valid
    const sumAmount = monthFilteredCandidates
      .filter(c => selectedIds.has(rowKey(c)))
      .reduce((s, c) => s + c.total_amount, 0)
    return { total, valid, missing, sumAmount, selected: selectedIds.size }
  }, [monthFilteredCandidates, selectedIds])

  const viewMonthLabel = viewMonth
    ? `${parseInt(viewMonth.split('-')[0] ?? '0', 10)}년 ${parseInt(viewMonth.split('-')[1] ?? '0', 10)}월`
    : '전체'

  const shiftMonth = (delta: number) => {
    setViewMonth(prev => {
      const base = prev ?? new Date().toISOString().slice(0, 7)
      const [y, m] = base.split('-').map(Number)
      const d = new Date(y!, (m! - 1) + delta, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })
  }

  // ── 발행 완료 처리 (Phase 27-V: 반자동 계산서발행완료알림 발송 통합) ─────
  const handleMarkIssued = async () => {
    const selected = filteredCandidates.filter(c => selectedIds.has(rowKey(c)) && !c.tax_invoice_issued)
    if (selected.length === 0) { toast.error('먼저 미발행 항목을 선택하세요.'); return }
    if (!confirm(
      `선택한 ${selected.length}건을 발행 완료 처리하고, 각 고객에게 세금계산서 발행 완료 알림 SMS 를 발송할까요?`,
    )) return

    setMarkingIssued(true)
    try {
      const items = selected.map(c => {
        if (c.source === 'application') {
          return { source: 'application' as const, source_id: c.source_id }
        }
        return { source: 'customer' as const, source_id: c.customer_id!, billing_ids: [c.billing_id!] }
      })
      const res = await fetch('/api/admin/tax-invoice/mark-issued', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, supplier_id: supplier.id || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '처리 실패')
      const total = (json.updated_applications ?? 0) + (json.updated_billings ?? 0)
      const sent = json.sent_notifications ?? 0
      const failed = json.failed_notifications ?? 0
      const notifyLine = failed > 0
        ? ` · 알림 발송 ${sent}건 (실패 ${failed}건)`
        : ` · 알림 발송 ${sent}건`
      toast.success(`발행 완료 처리 ${total}건${notifyLine}`)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '처리 실패')
    } finally {
      setMarkingIssued(false)
    }
  }

  // ── 발행 취소 ────────────────────────────────────────────────
  const handleRevertIssued = async () => {
    const selected = filteredCandidates.filter(c =>
      selectedIds.has(rowKey(c)) && c.tax_invoice_issued
    )
    if (selected.length === 0) { toast.error('발행 완료 상태인 항목만 취소할 수 있습니다.'); return }
    const reason = prompt(`선택한 ${selected.length}건을 발행 취소할까요?\n사유(선택):`, '재발행')
    if (reason === null) return

    setMarkingIssued(true)
    try {
      const items = selected.map(c => {
        if (c.source === 'application') {
          return { source: 'application' as const, source_id: c.source_id }
        }
        return { source: 'customer' as const, source_id: c.customer_id!, billing_ids: [c.billing_id!] }
      })
      const res = await fetch('/api/admin/tax-invoice/mark-issued', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, void_reason: reason || '재발행' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '취소 실패')
      const total = (json.reverted_applications ?? 0) + (json.reverted_billings ?? 0)
      toast.success(`발행 취소: ${total}건`)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '취소 실패')
    } finally {
      setMarkingIssued(false)
    }
  }

  // ── 이체 완료 처리 (선택된 1회성 회차에 대해 예약금환급완료 SMS 발송 + 상태 세팅) ─
  const handleMarkTransferred = async () => {
    const selected = filteredCandidates.filter(c =>
      selectedIds.has(rowKey(c)) && c.source === 'application' && !c.deposit_transferred_at,
    )
    if (selected.length === 0) {
      toast.error('먼저 이체 대상 1회성 회차(미이체)를 선택하세요.')
      return
    }
    if (!confirm(
      `선택한 ${selected.length}건 1회성 회차를 이체 완료 처리하고, 각 고객에게 예약금환급완료 알림 SMS 를 발송할까요?`,
    )) return

    setMarkingIssued(true)
    try {
      const items = selected.map(c => ({ source: 'application' as const, source_id: c.source_id }))
      const res = await fetch('/api/admin/tax-invoice/mark-transferred', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '처리 실패')
      const sentLine = json.failed > 0 ? ` · 알림 발송 ${json.sent}건 (실패 ${json.failed}건)` : ` · 알림 발송 ${json.sent}건`
      toast.success(`이체 완료 처리 ${json.updated}건${sentLine}`)
      if (json.migrationPending) {
        toast('DB 마이그레이션 대기 중 — deposit_transferred_at 컬럼 없음. 상태만 기록되고 이력 시각 미저장.', { icon: '⚠️', duration: 5000 })
      }
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '처리 실패')
    } finally {
      setMarkingIssued(false)
    }
  }

  // ── 이체 완료 취소 ───────────────────────────────────────────
  const handleRevertTransferred = async () => {
    const selected = filteredCandidates.filter(c =>
      selectedIds.has(rowKey(c)) && c.source === 'application' && !!c.deposit_transferred_at,
    )
    if (selected.length === 0) {
      toast.error('이체 완료 상태인 1회성 회차만 취소할 수 있습니다.')
      return
    }
    if (!confirm(`선택한 ${selected.length}건 이체 완료를 취소하시겠습니까?\n(이미 발송된 SMS 는 되돌릴 수 없습니다)`)) return

    setMarkingIssued(true)
    try {
      const items = selected.map(c => ({ source: 'application' as const, source_id: c.source_id }))
      const res = await fetch('/api/admin/tax-invoice/mark-transferred', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '취소 실패')
      toast.success(`이체 완료 취소: ${json.reverted}건`)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '취소 실패')
    } finally {
      setMarkingIssued(false)
    }
  }

  // ── 예약금 이체 xls ───────────────────────────────────────────
  const handleExportDepositTransfer = async () => {
    const selected = filteredCandidates.filter(c => selectedIds.has(rowKey(c)))
    if (selected.length === 0) { toast.error('먼저 이체 대상을 선택하세요.'); return }
    const customerIds = Array.from(
      new Set(selected.map(c => c.customer_id).filter((id): id is string => !!id)),
    )
    if (customerIds.length === 0) {
      toast.error('선택된 항목에 연결된 고객이 없습니다.'); return
    }
    const loadingToast = toast.loading('예약금 이체 파일 생성 중...')
    try {
      const res = await fetch('/api/admin/tax-invoice/deposit-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: customerIds }),
      })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        throw new Error(json.error ?? '파일 생성 실패')
      }
      const skippedCount = Number(res.headers.get('X-Skipped-Count') ?? '0')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = /filename\*=UTF-8''(.+)/.exec(disposition)
      a.download = match ? decodeURIComponent(match[1]) : '예약금이체.xls'
      a.click()
      URL.revokeObjectURL(url)
      toast.dismiss(loadingToast)
      toast.success('예약금 이체 파일 다운로드 완료')
      if (skippedCount > 0) {
        toast.error(`${skippedCount}건 계좌 파싱 실패로 제외됨`, { duration: 6000 })
      }
    } catch (e) {
      toast.dismiss(loadingToast)
      toast.error(e instanceof Error ? e.message : '다운로드 실패')
    }
  }

  // ── CSV → Google Drive ────────────────────────────────────────
  const handleDownloadCsv = async () => {
    const selected = filteredCandidates.filter(c => selectedIds.has(rowKey(c)))
    if (selected.length === 0) { toast.error('먼저 발행 대상을 선택하세요.'); return }
    const invalidSelected = selected.filter(c => !c.is_valid)
    if (invalidSelected.length > 0) {
      toast.error(`필수 정보 누락 ${invalidSelected.length}건 — 편집 후 다시 시도`)
      return
    }

    const yyyymmdd = todayYmdKst()
    const rows: HometaxRow[] = selected.map(c => {
      const rowSupplier = c.draft_supplier_id
        ? (suppliers.find(s => s.id === c.draft_supplier_id) ?? supplier)
        : supplier

      const periodLabel = c.display_period ?? c.construction_date?.slice(0, 10) ?? ''
      const items: HometaxItem[] = (c.draft_items && c.draft_items.length > 0)
        ? c.draft_items.slice(0, 4).map(it => ({
            name: it.name,
            spec: it.spec ?? null,
            qty: it.qty ?? 1,
            unit_price: it.unit_price ?? Number(it.supply_amount ?? 0),
            supply_amount: Number(it.supply_amount ?? 0),
            vat: Number(it.vat ?? 0),
            remark: it.remark ?? null,
          }))
        : [{
            name: `${c.service_type ?? '청소 서비스'}${periodLabel ? ` - ${periodLabel}` : ''}`,
            qty: 1,
            unit_price: c.supply_amount,
            supply_amount: c.supply_amount,
            vat: c.vat,
          }]

      return {
        invoice_kind: (c.draft_invoice_kind === '02' ? '02' : '01'),
        written_date: yyyymmdd,
        supplier: {
          registration_number: rowSupplier.registration_number,
          company_name: rowSupplier.company_name,
          representative: rowSupplier.representative,
          address: rowSupplier.address,
          business_type: rowSupplier.business_type,
          business_item: rowSupplier.business_item,
          email: rowSupplier.email,
        },
        receiver: {
          registration_number: c.business_number,
          business_name: c.business_name,
          owner_name: c.owner_name,
          address: c.address,
          business_type: c.draft_receiver_business_type,
          business_item: c.draft_receiver_business_item,
          email: c.email,
          email_2: c.draft_receiver_email_2,
        },
        items,
        receipt_type: (c.draft_receipt_type === '02' ? '02' : '01'),
      }
    })

    let csv: string
    try {
      csv = buildHometaxCsv(rows)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'CSV 생성 실패')
      return
    }

    const filename = `홈택스_세금계산서_${yyyymmdd}_${rows.length}건.csv`
    const downloadLocally = () => {
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    }

    const uploadingToast = toast.loading('Google Sheets로 저장 중...')
    try {
      const res = await fetch('/api/admin/tax-invoice/upload-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, csv }),
      })
      const json = await res.json()
      toast.dismiss(uploadingToast)
      if (!res.ok) throw new Error(json.error ?? '업로드 실패')
      toast.success(
        (t) => (
          <span className="flex items-center gap-2">
            <span>{rows.length}건 Google Sheets 저장 완료</span>
            {json.webViewLink && (
              <a href={json.webViewLink} target="_blank" rel="noreferrer"
                onClick={() => toast.dismiss(t.id)}
                className="text-brand-600 underline text-xs">
                시트 열기
              </a>
            )}
          </span>
        ),
        { duration: 8000 },
      )
    } catch (e) {
      toast.dismiss(uploadingToast)
      downloadLocally()
      toast.error(`Sheets 저장 실패 — 로컬 CSV로 다운로드: ${e instanceof Error ? e.message : String(e)}`, { duration: 6000 })
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-text-primary tracking-tight">세금계산서 발행 대시보드</h1>
          <p className="text-xs text-text-tertiary mt-1">
            1회성케어 · 정기딥케어 · 정기엔드케어 — 세금계산서 미발행 전체 표시
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* 공급자 선택 + 관리 */}
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-text-tertiary uppercase tracking-wide shrink-0">공급자</label>
            <select
              value={selectedSupplierId}
              onChange={e => setSelectedSupplierId(e.target.value)}
              className="h-8 text-sm rounded-md border border-border bg-surface px-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 max-w-[180px] truncate"
            >
              {suppliers.length === 0 && <option value="">기본 (fallback)</option>}
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.label}{s.is_default ? ' ★' : ''}
                </option>
              ))}
            </select>
            <Link href="/admin/tax-invoice/suppliers"
              className="inline-flex items-center gap-1 h-8 px-3 py-1.5 text-sm rounded-lg font-medium hover:bg-surface-sunken text-text-secondary transition-colors">
              <Settings size={12} />관리
            </Link>
          </div>

          <div className="w-px h-6 bg-border-subtle" />

          {/* 세트 1: 계산서 3버튼 그룹 (저장 · 발행완료 · 발행취소) */}
          <div className="inline-flex items-center gap-1 rounded-lg border border-border-subtle bg-surface-sunken/60 p-1">
            <Button size="sm" onClick={handleDownloadCsv}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1.5 h-7"
              title="Google Drive '세금계산서' 폴더에 Google Sheets로 저장 (실패 시 로컬 CSV 다운로드 fallback)">
              <Download size={13} />계산서{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
            </Button>
            <Button size="sm" variant="secondary" onClick={handleMarkIssued}
              disabled={selectedIds.size === 0 || markingIssued}
              className="flex items-center gap-1.5 h-7 text-state-success">
              <Check size={13} />발행완료
            </Button>
            <Button size="sm" variant="secondary" onClick={handleRevertIssued}
              disabled={selectedIds.size === 0 || markingIssued}
              className="flex items-center gap-1.5 h-7 text-state-danger"
              title="발행 완료 상태를 취소 (재발행 필요 시)">
              <Undo2 size={13} />취소
            </Button>
          </div>

          {/* 세트 2: 예약금 3버튼 그룹 (파일 · 이체완료 · 이체취소). 1회성만 대상 */}
          <div className="inline-flex items-center gap-1 rounded-lg border border-border-subtle bg-surface-sunken/60 p-1">
            <Button size="sm" onClick={handleExportDepositTransfer}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1.5 h-7"
              title="카드(온라인 간편결제) 1회성 고객 예약금 이체 xls 다운로드">
              <Download size={13} />예약금{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
            </Button>
            <Button size="sm" variant="secondary" onClick={handleMarkTransferred}
              disabled={selectedIds.size === 0 || markingIssued}
              className="flex items-center gap-1.5 h-7 text-state-success"
              title="선택된 1회성 회차 이체 완료 처리 + 예약금환급완료 알림 SMS 자동 발송">
              <Check size={13} />이체완료
            </Button>
            <Button size="sm" variant="secondary" onClick={handleRevertTransferred}
              disabled={selectedIds.size === 0 || markingIssued}
              className="flex items-center gap-1.5 h-7 text-state-danger"
              title="이체 완료 상태를 취소 (실수·재이체 필요 시. 이미 발송된 SMS 는 되돌릴 수 없음)">
              <Undo2 size={13} />취소
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface border border-border-subtle rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
          <Filter size={12} />
          <span>필터</span>
          {(serviceTypes.length > 0 || paymentMethods.length > 0) && (
            <button type="button"
              onClick={() => { setServiceTypes([]); setPaymentMethods([]) }}
              className="ml-auto text-[11px] text-brand-600 hover:text-brand-700 underline">
              초기화
            </button>
          )}
        </div>

        {/* 서비스 유형 뱃지 */}
        <FilterBadgeGroup
          label="유형"
          options={SERVICE_TYPES_FIXED}
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

      {/* 월단위 뷰 네비게이션 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => shiftMonth(-1)}
          className="p-1.5 rounded-lg border border-border-subtle text-text-secondary hover:bg-surface-sunken transition-colors">
          <ChevronLeft size={15} />
        </button>
        <span className="text-sm font-semibold text-text-primary min-w-[110px] text-center">{viewMonthLabel}</span>
        <button type="button" onClick={() => shiftMonth(1)}
          className="p-1.5 rounded-lg border border-border-subtle text-text-secondary hover:bg-surface-sunken transition-colors">
          <ChevronRight size={15} />
        </button>
        <button type="button" onClick={() => setViewMonth(null)}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            viewMonth === null
              ? 'bg-brand-600 border-brand-600 text-white'
              : 'border-border-subtle text-text-secondary hover:bg-surface-sunken'
          }`}>
          전체보기
        </button>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-2xl border border-border-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1160px] text-sm">
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
                <th className="text-left px-3 py-2.5 text-xs font-medium text-text-secondary">기간 / 시공일</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-text-secondary">업체명</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-text-secondary">대표자</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-text-secondary">사업자번호</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-text-secondary">결제방법</th>
                <th className="text-right w-20 px-2 py-2.5 text-xs font-medium text-text-secondary">공급가액</th>
                <th className="text-right w-16 px-2 py-2.5 text-xs font-medium text-text-secondary">세액</th>
                <th className="text-right w-24 px-2 py-2.5 text-xs font-medium text-text-secondary">합계</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-text-secondary">계산서</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-text-secondary">결제</th>
                <th className="w-20 py-2.5" />
              </tr>
            </thead>
            <tbody className="anim-stagger-fast divide-y divide-border-subtle">
              {loading ? (
                <tr><td colSpan={13} className="py-16 text-center text-sm text-text-tertiary">로딩 중…</td></tr>
              ) : sortedCandidates.length === 0 ? (
                <tr><td colSpan={13} className="py-16 text-center text-sm text-text-tertiary">
                  <FileSpreadsheet size={28} className="mx-auto opacity-30 mb-2" />
                  발행 대상이 없습니다.
                </td></tr>
              ) : sortedCandidates.map(c => {
                const key = rowKey(c)
                const isSelected = selectedIds.has(key)
                return (
                  <tr key={key} className={`transition-colors ${isSelected ? 'bg-brand-50/50' : 'hover:bg-surface-sunken'}`}>
                    <td className="py-2 pl-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!c.is_valid}
                        onChange={() => toggleOne(c)}
                        className="accent-brand-600 disabled:opacity-30"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <SourceBadge label={c.service_type ?? ''} />
                    </td>
                    <td className="px-3 py-2 text-text-tertiary whitespace-nowrap text-xs">
                      {c.source === 'billing'
                        ? <span className="font-medium text-text-secondary">{c.display_period}</span>
                        : c.construction_date
                          ? c.construction_date.slice(0, 10)
                          : <span>—</span>
                      }
                    </td>
                    <td className="px-3 py-2 max-w-[220px]">
                      <div className="font-medium text-text-primary truncate">{c.business_name}</div>
                      {c.phone && (
                        <div className="text-xs text-text-tertiary truncate">{c.phone}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{c.owner_name}</td>
                    <td className="px-3 py-2 text-text-secondary tabular-nums whitespace-nowrap">
                      {c.business_number || <span className="text-state-danger text-xs">누락</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-text-secondary whitespace-nowrap max-w-[160px] truncate" title={c.payment_method ?? undefined}>
                      {c.payment_method || <span className="text-text-tertiary">—</span>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-text-primary whitespace-nowrap">{fmtMan(c.supply_amount)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-text-tertiary whitespace-nowrap">{fmtMan(c.vat)}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-semibold text-text-primary whitespace-nowrap">{fmtKr(c.total_amount)}</td>
                    <td className="px-3 py-2">
                      <RowStatus c={c} />
                    </td>
                    <td className="px-3 py-2">
                      <PaymentBadge done={isPaymentDone(c)} />
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
          scheduleMonth={null}
          onClose={() => setEditingCandidate(null)}
          onSaved={() => { setEditingCandidate(null); void load() }}
          onStatusChanged={() => void load()}
        />
      )}

      {/* 공급자 상세 */}
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

function FilterBadgeGroup({ label, options, selected, onToggle, labelMap }: {
  label: string
  options: string[]
  selected: string[]
  onToggle: (v: string) => void
  labelMap?: Record<string, string>
}) {
  if (options.length === 0) return null
  return (
    <div className="flex flex-wrap items-start gap-2">
      <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide w-10 shrink-0 pt-1">{label}</span>
      <div className="flex flex-wrap gap-1.5 flex-1">
        {options.map(opt => {
          const isSelected = selected.includes(opt)
          return (
            <button key={opt} type="button" onClick={() => onToggle(opt)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors whitespace-nowrap ${
                isSelected
                  ? 'bg-brand-600 border-brand-600 text-white'
                  : 'bg-surface border-border text-text-secondary hover:border-brand-400 hover:text-brand-600'
              }`}>
              {labelMap?.[opt] ?? opt}
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

const TYPE_BADGE: Record<string, string> = {
  '1회성케어':    'bg-emerald-100 text-emerald-700',
  '정기딥케어':   'bg-brand-100 text-brand-700',
  '정기엔드케어': 'bg-purple-100 text-purple-700',
}
function SourceBadge({ label }: { label: string }) {
  const cls = TYPE_BADGE[label] ?? 'bg-surface-sunken text-text-secondary'
  return (
    <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full font-medium ${cls}`}>
      {label || '—'}
    </span>
  )
}

// PaymentIssuesSummary(고객관리) 와 동일한 완결 상태 집합 — 판정 일관성 유지
const PAID_APP_STATUSES = new Set([
  '결제완료', '계산서발행완료', '카드결제 완료', '비과세', '예약금환급완료',
])

function isPaymentDone(c: Candidate): boolean {
  if (c.source === 'billing') return c.billing_status === 'paid'
  // 1회성: 관리자는 3개 필드를 각기 다른 화면에서 별개로 업데이트한다.
  // 어느 하나라도 완결 상태이면 결제 완료로 판정 (payment-reminders 크론과 동일 원칙).
  //   1) application.payment_status_detail (신청서 결제 상세)
  //   2) application.status                (신청서 workflow)
  //   3) customer.payment_status_detail    (고객 레벨 결제 상세)
  return (
    PAID_APP_STATUSES.has(c.payment_status_detail ?? '') ||
    PAID_APP_STATUSES.has(c.application_status ?? '') ||
    PAID_APP_STATUSES.has(c.customer_payment_status_detail ?? '')
  )
}

function PaymentBadge({ done }: { done: boolean }) {
  return done
    ? (
      <span className="inline-flex items-center gap-1 text-[11px] text-state-success">
        <CheckCircle2 size={11} />완료
      </span>
    ) : (
      <span className="text-[11px] text-text-tertiary">미완료</span>
    )
}

function RowStatus({ c }: { c: Candidate }) {
  // 계산서 열은 계산서 상태만 표시 — 결제 상태는 별도의 PaymentBadge 열이 담당
  if (c.tax_invoice_issued) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-state-success">
        <CheckCircle2 size={11} />발행완료
        {c.tax_invoice_issued_at && (
          <span className="text-text-tertiary">({fmtDate(c.tax_invoice_issued_at)})</span>
        )}
      </span>
    )
  }
  if (!c.is_valid) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-state-warning"
        title={`누락: ${c.missing_fields.join(', ')}`}>
        <AlertCircle size={11} />정보 누락
      </span>
    )
  }
  return <span className="text-[11px] text-text-tertiary">미발행</span>
}
