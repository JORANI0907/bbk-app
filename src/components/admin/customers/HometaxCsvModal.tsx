'use client'

/**
 * 홈택스 세금계산서 CSV 생성 모달 (2026-10-24 신설)
 *
 * - 고객관리 탭의 "홈택스" 버튼이 호출.
 * - props.customerIds 로 선택된 고객들의 미발행 발행대상(candidates) 조회.
 * - 1회성은 1고객당 1건, 정기딥/정기엔드는 월별 결제이력 여러 건.
 * - 고객별 아코디언: 접힌 상태에선 "N건 선택 / M건 중" 요약, 펼치면 결제이력 체크박스.
 * - 체크된 candidate 들을 그대로 buildHometaxCsv 로 변환 → upload-csv API 로 Drive 저장 + 로컬 다운로드.
 */

import { useEffect, useMemo, useState } from 'react'
import { X, ChevronDown, ChevronRight, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { buildHometaxCsv, todayYmdKst, type HometaxRow, type HometaxItem } from '@/lib/hometax-csv'

// candidates API 응답 (handleExportTaxInvoiceCsv 와 동일한 서브셋)
interface Candidate {
  source: 'application' | 'billing'
  source_id: string
  customer_id: string | null
  service_type: string | null
  business_name: string
  business_number: string | null
  owner_name: string
  address: string | null
  email: string | null
  supply_amount: number
  vat: number
  total_amount: number
  billing_period: string | null
  display_period: string | null
  construction_date: string | null
  tax_invoice_issued: boolean
  is_valid: boolean
  draft_supplier_id: string | null
  draft_items: Array<{
    name: string; spec?: string; qty?: number
    unit_price?: number; supply_amount?: number; vat?: number; remark?: string
  }> | null
  draft_invoice_kind: string | null
  draft_receiver_business_type: string | null
  draft_receiver_business_item: string | null
  draft_receiver_email_2: string | null
  draft_receipt_type: string | null
}

interface Supplier {
  id: string
  registration_number: string
  company_name: string
  representative: string
  address: string
  business_type: string
  business_item: string
  email: string
  is_default: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  /** 체크박스로 선택된 고객 id 리스트 */
  customerIds: string[]
}

const rowKey = (c: Candidate) => `${c.source}:${c.source_id}`

export function HometaxCsvModal({ open, onClose, customerIds }: Props) {
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [defaultSupplier, setDefaultSupplier] = useState<Supplier | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [expandedCustIds, setExpandedCustIds] = useState<Set<string>>(new Set())

  // 모달 열릴 때 데이터 fetch (전체 candidates + suppliers 조회 후 선택 고객만 필터)
  useEffect(() => {
    if (!open) return
    setLoading(true)
    Promise.all([
      fetch('/api/admin/tax-invoice/candidates').then(r => r.ok ? r.json() : Promise.reject(new Error('candidates fetch 실패'))),
      fetch('/api/admin/tax-invoice/suppliers').then(r => r.ok ? r.json() : Promise.reject(new Error('suppliers fetch 실패'))),
    ])
      .then(([cRes, sRes]: [{ candidates?: Candidate[] }, { suppliers?: Supplier[] }]) => {
        const all = (cRes.candidates ?? []) as Candidate[]
        const custSet = new Set(customerIds)
        // 선택 고객의 "미발행" 건만 노출
        const filtered = all.filter(c =>
          c.customer_id && custSet.has(c.customer_id) && !c.tax_invoice_issued
        )
        setCandidates(filtered)

        const sups = (sRes.suppliers ?? []) as Supplier[]
        setSuppliers(sups)
        setDefaultSupplier(sups.find(s => s.is_default) ?? sups[0] ?? null)

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
          if (list.length === 1) auto.add(rowKey(list[0]))
        }
        setSelectedKeys(auto)
        setExpandedCustIds(new Set())
      })
      .catch(e => {
        toast.error(e instanceof Error ? e.message : '데이터 로딩 실패')
      })
      .finally(() => setLoading(false))
  }, [open, customerIds])

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

  async function handleDownload() {
    const picked = candidates.filter(c => selectedKeys.has(rowKey(c)))
    if (picked.length === 0) { toast.error('먼저 발행 대상을 선택하세요.'); return }
    if (!defaultSupplier) {
      toast.error('공급자 정보 없음 — 세금계산서 탭에서 공급자를 먼저 등록하세요.')
      return
    }
    const invalid = picked.filter(c => !c.is_valid)
    if (invalid.length > 0) {
      toast.error(`필수 정보 누락 ${invalid.length}건 — 세금계산서 탭에서 편집 필요`)
      return
    }

    setDownloading(true)
    const t = toast.loading('홈택스 CSV 생성 중...')
    const yyyymmdd = todayYmdKst()
    const rows: HometaxRow[] = picked.map(c => {
      const sup = c.draft_supplier_id
        ? (suppliers.find(s => s.id === c.draft_supplier_id) ?? defaultSupplier)
        : defaultSupplier
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
        invoice_kind: (c.draft_invoice_kind === '02' ? '02' : '01') as '01' | '02',
        written_date: yyyymmdd,
        supplier: {
          registration_number: sup.registration_number,
          company_name: sup.company_name,
          representative: sup.representative,
          address: sup.address,
          business_type: sup.business_type,
          business_item: sup.business_item,
          email: sup.email,
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
        receipt_type: (c.draft_receipt_type === '02' ? '02' : '01') as '01' | '02',
      }
    })

    let csv: string
    try {
      csv = buildHometaxCsv(rows)
    } catch (e) {
      toast.dismiss(t)
      toast.error(e instanceof Error ? e.message : 'CSV 생성 실패')
      setDownloading(false)
      return
    }
    const filename = `홈택스_세금계산서_${yyyymmdd}_${rows.length}건.csv`

    // Google Drive 업로드 시도 → 실패해도 로컬 다운로드 fallback
    try {
      const res = await fetch('/api/admin/tax-invoice/upload-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, csv }),
      })
      const json = await res.json()
      toast.dismiss(t)
      if (!res.ok) throw new Error(json.error ?? '업로드 실패')
      toast.success(`${rows.length}건 Google Sheets 저장 완료`, { duration: 6000 })
    } catch {
      toast.dismiss(t)
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
      toast.error('Sheets 저장 실패 — 로컬 CSV 로 다운로드', { duration: 5000 })
    }
    setDownloading(false)
    onClose()
  }

  if (!open) return null

  const totalSelected = selectedKeys.size

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-modal max-w-3xl w-full max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
          <h3 className="text-base font-semibold text-text-primary">
            🧾 홈택스 세금계산서 CSV 생성
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        {/* 안내 */}
        <div className="px-5 py-2 bg-amber-50/60 border-b border-amber-100 text-[11px] text-amber-800 leading-snug">
          선택한 고객들의 <b>미발행 결제이력</b>만 노출됩니다. 1회성케어는 1건이 자동 체크되어있고,
          정기딥/정기엔드케어는 월별 결제이력을 펼쳐서 체크하세요.
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
                    <div className="flex items-center gap-2 px-3 py-2 hover:bg-surface-sunken">
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
                        <span className="text-sm font-medium text-text-primary truncate">
                          {first.business_name}
                        </span>
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
                        <label className="flex items-center gap-1 text-xs shrink-0 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(rowKey(first))}
                            onChange={() => toggleOne(rowKey(first))}
                            className="accent-brand-600"
                          />
                          <span className="text-text-tertiary">{first.total_amount.toLocaleString('ko-KR')}원</span>
                        </label>
                      )}
                    </div>

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
                            const checked = selectedKeys.has(key)
                            return (
                              <label
                                key={key}
                                className="flex items-center gap-2 px-4 py-2 hover:bg-white cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleOne(key)}
                                  className="accent-brand-600"
                                />
                                <span className="text-sm text-text-primary">
                                  {c.display_period ?? c.construction_date ?? '-'}
                                </span>
                                <span className="text-sm text-text-primary font-medium ml-2">
                                  {c.total_amount.toLocaleString('ko-KR')}원
                                </span>
                                <span className="ml-2 text-[10px] text-emerald-600 font-medium">
                                  ✅ 결제완료
                                </span>
                                <span className="ml-1 text-[10px] text-amber-600">
                                  ⏳ 계산서 미발행
                                </span>
                              </label>
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
        <div className="flex items-center justify-between px-5 py-3 border-t border-border-subtle bg-surface-sunken/30">
          <span className="text-sm text-text-secondary">
            총 <b className="text-text-primary">{totalSelected}</b>건 선택
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-surface-sunken text-text-primary"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading || totalSelected === 0}
              className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:bg-brand-300 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Download size={14} />
              {downloading ? '생성 중...' : 'CSV 다운로드'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
