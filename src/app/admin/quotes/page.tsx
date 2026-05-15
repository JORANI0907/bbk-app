'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Plus, X, FileText, ExternalLink, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'

// ─── 타입 ────────────────────────────────────────────────────────

interface QuoteItem {
  name: string
  qty: number
  unit_price: number
  subtotal: number
}

interface QuoteLogEntry {
  quote_no: string
  pdf_url: string | null
  sent_at: string
  total_amount: number
}

interface ApplicationRow {
  id: string
  owner_name: string
  business_name: string
  phone: string
  email: string | null
  address: string
  construction_date: string | null
  last_quote_no: string | null
  last_quote_pdf_url: string | null
  quote_items: QuoteItem[] | null
  quote_log: QuoteLogEntry[] | null
  created_at: string
  status: string
  notification_log: Array<{ type: string; sent_at: string; method?: string }> | null
  source: string | null
}

interface CompanyInfo {
  company_name: string
  company_ceo: string
  company_biz_no: string
  company_phone: string
  company_address: string
}

interface CustomerInfo {
  owner_name: string
  business_name: string
  phone: string
  email: string
  address: string
  construction_date: string
}

// ─── 상수 ────────────────────────────────────────────────────────

const BBK_DEFAULTS: CompanyInfo = {
  company_name:    'BBK 공간케어',
  company_ceo:     '박범건',
  company_biz_no:  '298-78-00455',
  company_phone:   '031-759-4877',
  company_address: '경기도 성남시',
}

const ITEM_NAME_MAX = 40
const PAGE_SIZE     = 20

// ─── 유틸 ────────────────────────────────────────────────────────

function fmtKr(n: number): string { return n.toLocaleString('ko-KR') }
function fmtDate(dateStr: string): string { return dateStr.slice(0, 10) }

// ─── 컴포넌트 ────────────────────────────────────────────────────

export default function QuotesPage() {
  // ── 목록 상태 ─────────────────────────────────────────────────
  const [applications, setApplications] = useState<ApplicationRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [page, setPage]         = useState(1)
  const [total, setTotal]       = useState(0)
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)

  // ── 선택 상태 ─────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // ── 견적서 입력 상태 ──────────────────────────────────────────
  const [companyInfo, setCompanyInfo]     = useState<CompanyInfo>(BBK_DEFAULTS)
  const [customerInfo, setCustomerInfo]   = useState<CustomerInfo>({
    owner_name: '', business_name: '', phone: '', email: '', address: '', construction_date: '',
  })
  const [quoteItems, setQuoteItems]       = useState<QuoteItem[]>([])
  const [validDays, setValidDays]         = useState(5)
  const [notes, setNotes]                 = useState('')
  const [sending, setSending]             = useState(false)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selected    = applications.find(a => a.id === selectedId) ?? null
  const totalPages  = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ── 금액 계산 ─────────────────────────────────────────────────
  const supplyAmount = quoteItems.reduce((sum, item) => sum + item.subtotal, 0)
  const vatAmount    = Math.round(supplyAmount * 0.1)
  const totalAmount  = supplyAmount + vatAmount

  // ─── 데이터 로딩 ─────────────────────────────────────────────
  const loadApplications = useCallback(async (p: number, q: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE), ...(q ? { search: q } : {}) })
      const res = await fetch(`/api/admin/quotes?${params}`)
      if (!res.ok) throw new Error('목록 로딩 실패')
      const { applications: data, total: t } = await res.json()
      setApplications((data as ApplicationRow[]) || [])
      setTotal(t ?? 0)
      setLoadedAt(new Date())
    } catch {
      toast.error('목록 로딩 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadApplications(1, '') }, [loadApplications])

  // ─── 검색 디바운스 (500ms) ───────────────────────────────────
  const handleSearchChange = (value: string) => {
    setSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(1)
      setSelectedId(null)
      loadApplications(1, value)
    }, 500)
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    setSelectedId(null)
    loadApplications(newPage, search)
  }

  const handleRefresh = () => { loadApplications(page, search) }

  // ─── 항목 선택 — 고객 정보 자동 채우기 ──────────────────────
  const handleSelect = useCallback((app: ApplicationRow) => {
    setSelectedId(app.id)
    setCustomerInfo({
      owner_name:        app.owner_name        || '',
      business_name:     app.business_name     || '',
      phone:             app.phone             || '',
      email:             app.email             || '',
      address:           app.address           || '',
      construction_date: app.construction_date || '',
    })
    setQuoteItems(
      app.quote_items && app.quote_items.length > 0
        ? app.quote_items.map(item => ({ ...item }))
        : []
    )
    setNotes('')
    setValidDays(5)
    setCompanyInfo(BBK_DEFAULTS)
  }, [])

  // ─── 견적 항목 편집 ──────────────────────────────────────────
  const addItem = () => {
    setQuoteItems(prev => [...prev, { name: '', qty: 1, unit_price: 0, subtotal: 0 }])
  }

  const removeItem = (idx: number) => {
    setQuoteItems(prev => prev.filter((_, i) => i !== idx))
  }

  const updateItem = (idx: number, field: keyof QuoteItem, value: string | number) => {
    setQuoteItems(prev =>
      prev.map((item, i) => {
        if (i !== idx) return item
        const updated = { ...item, [field]: value }
        if (field === 'qty' || field === 'unit_price') {
          const qty       = field === 'qty'        ? Number(value) : item.qty
          const unitPrice = field === 'unit_price' ? Number(value) : item.unit_price
          updated.subtotal = qty * unitPrice
        }
        return updated
      })
    )
  }

  // ─── 유효성 검사 ─────────────────────────────────────────────
  const validate = (): string | null => {
    if (!selected)                            return '신청서를 선택해 주세요.'
    if (!customerInfo.owner_name?.trim())     return '고객명이 없습니다.'
    if (!customerInfo.phone?.trim())          return '연락처가 없습니다.'
    if (!customerInfo.address?.trim())        return '주소가 없습니다.'
    if (quoteItems.length === 0)              return '견적 항목을 1개 이상 추가해 주세요.'
    if (quoteItems.some(item => !item.name.trim())) return '항목명이 비어있는 견적 항목이 있습니다.'
    if (!companyInfo.company_name?.trim())    return '공급자 상호가 없습니다.'
    if (validDays < 1 || validDays > 365)     return '유효기간은 1~365일 사이여야 합니다.'
    return null
  }

  // ─── 견적서 발송 ─────────────────────────────────────────────
  const handleSend = async () => {
    const err = validate()
    if (err) { toast.error(err); return }
    if (!selected) return

    setSending(true)
    try {
      const res = await fetch(`/api/admin/quotes/${selected.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...companyInfo,
          owner_name:        customerInfo.owner_name,
          business_name:     customerInfo.business_name,
          phone:             customerInfo.phone,
          email:             customerInfo.email,
          address:           customerInfo.address,
          construction_date: customerInfo.construction_date,
          quote_items:       quoteItems,
          supply_amount:     supplyAmount,
          vat:               vatAmount,
          total_amount:      totalAmount,
          valid_days:        validDays,
          notes:             notes || undefined,
        }),
      })

      const result = await res.json()
      if (result.success) {
        if (result.warnings?.kakao) {
          toast.success(`견적서 발송 완료 (${result.quote_no})\n카카오 알림톡은 발송되지 않았습니다.`)
        } else {
          toast.success(`견적서 발송 완료 (${result.quote_no})`)
        }
        await loadApplications(page, search)
      } else {
        const errMsg = result.errors
          ? Object.entries(result.errors as Record<string, string>)
              .filter(([k]) => k !== 'kakao')
              .map(([, v]) => v)
              .join(', ')
          : '발송 실패'
        toast.error(`발송 오류: ${errMsg}`)
        await loadApplications(page, search)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '견적서 발송 중 오류가 발생했습니다.')
    } finally {
      setSending(false)
    }
  }

  // ─── 렌더링 ──────────────────────────────────────────────────
  return (
    <div className="flex h-full gap-5 p-6">

      {/* ── 좌측: 신청 목록 ─────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-3">

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary leading-tight">견적관리</h1>
            <p className="text-xs text-text-tertiary mt-0.5">
              {loadedAt ? `${loadedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} 기준` : ''}
              {total > 0 ? ` · 총 ${total}건` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            title="새로고침"
            className="mt-1 p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-sunken transition-colors disabled:opacity-40"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <Input
          placeholder="고객명·업체명·연락처 검색"
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
        />

        <div className="flex-1 overflow-y-auto rounded-2xl border border-border shadow-soft bg-surface min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-sm text-text-tertiary">로딩 중...</div>
          ) : applications.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-text-tertiary">검색 결과 없음</div>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {applications.map(app => {
                const isSent   = !!app.last_quote_no
                const isActive = selectedId === app.id
                const isQuote  = app.source === 'quote'
                return (
                  <li key={app.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(app)}
                      className={`w-full text-left px-4 py-3 transition-colors hover:bg-surface-sunken ${
                        isActive ? 'bg-brand-50 border-l-2 border-brand-600' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm text-text-primary truncate">{app.owner_name}</span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {isQuote && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600">견적신청</span>
                          )}
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                            isSent ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {isSent ? '발송완료' : '미발송'}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-text-secondary mt-0.5 truncate">{app.business_name || '-'}</div>
                      <div className="text-xs text-text-tertiary mt-0.5 flex items-center gap-2">
                        <span>{app.phone}</span>
                        <span>·</span>
                        <span>{fmtDate(app.created_at)}</span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-text-secondary">
            <button type="button" onClick={() => handlePageChange(page - 1)} disabled={page <= 1 || loading}
              className="p-1.5 rounded-lg hover:bg-surface-sunken disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs tabular-nums">{page} / {totalPages}</span>
            <button type="button" onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages || loading}
              className="p-1.5 rounded-lg hover:bg-surface-sunken disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* ── 우측: 세부 패널 ──────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-64 text-text-tertiary gap-2">
            <FileText size={40} className="opacity-30" />
            <p className="text-sm">좌측 목록에서 신청서를 선택하세요.</p>
          </div>
        ) : (
          <div className="space-y-5">

            {/* ── 1. 공급자 정보 ──────────────────────────────── */}
            <section className="bg-surface rounded-2xl shadow-soft p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text-primary leading-snug">공급자 정보</h2>
                <button
                  type="button"
                  onClick={() => setCompanyInfo(BBK_DEFAULTS)}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                >
                  기본값으로 초기화
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="상호">
                  <Input value={companyInfo.company_name}
                    onChange={e => setCompanyInfo(prev => ({ ...prev, company_name: e.target.value }))} />
                </Field>
                <Field label="대표자">
                  <Input value={companyInfo.company_ceo}
                    onChange={e => setCompanyInfo(prev => ({ ...prev, company_ceo: e.target.value }))} />
                </Field>
                <Field label="사업자번호">
                  <Input value={companyInfo.company_biz_no}
                    onChange={e => setCompanyInfo(prev => ({ ...prev, company_biz_no: e.target.value }))} />
                </Field>
                <Field label="연락처">
                  <Input value={companyInfo.company_phone}
                    onChange={e => setCompanyInfo(prev => ({ ...prev, company_phone: e.target.value }))} />
                </Field>
                <div className="col-span-2">
                  <Field label="주소">
                    <Input value={companyInfo.company_address}
                      onChange={e => setCompanyInfo(prev => ({ ...prev, company_address: e.target.value }))} />
                  </Field>
                </div>
              </div>
            </section>

            {/* ── 2. 고객 정보 ─────────────────────────────────── */}
            <section className="bg-surface rounded-2xl shadow-soft p-6">
              <h2 className="text-lg font-semibold text-text-primary leading-snug mb-4">고객 정보</h2>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="대표자">
                  <Input value={customerInfo.owner_name}
                    onChange={e => setCustomerInfo(prev => ({ ...prev, owner_name: e.target.value }))} />
                </Field>
                <Field label="업체명">
                  <Input value={customerInfo.business_name}
                    onChange={e => setCustomerInfo(prev => ({ ...prev, business_name: e.target.value }))} />
                </Field>
                <Field label="연락처">
                  <Input value={customerInfo.phone}
                    onChange={e => setCustomerInfo(prev => ({ ...prev, phone: e.target.value }))} />
                </Field>
                <Field label="이메일">
                  <Input value={customerInfo.email}
                    onChange={e => setCustomerInfo(prev => ({ ...prev, email: e.target.value }))} />
                </Field>
                <Field label="시공일자">
                  <Input type="date" value={customerInfo.construction_date}
                    onChange={e => setCustomerInfo(prev => ({ ...prev, construction_date: e.target.value }))} />
                </Field>
                <div className="col-span-2">
                  <Field label="주소">
                    <Input value={customerInfo.address}
                      onChange={e => setCustomerInfo(prev => ({ ...prev, address: e.target.value }))} />
                  </Field>
                </div>
              </div>
            </section>

            {/* ── 3. 견적 항목 ─────────────────────────────────── */}
            <section className="bg-surface rounded-2xl shadow-soft p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text-primary leading-snug">견적 항목</h2>
                <Button size="sm" variant="secondary" onClick={addItem} className="flex items-center gap-1">
                  <Plus size={14} />항목 추가
                </Button>
              </div>

              {quoteItems.length === 0 ? (
                <p className="text-sm text-text-tertiary py-4 text-center">항목 추가 버튼을 눌러 견적 항목을 입력하세요.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border-subtle text-text-secondary">
                        <th className="text-left pb-2 pr-3 font-medium">항목명</th>
                        <th className="text-right pb-2 px-3 font-medium w-20">수량</th>
                        <th className="text-right pb-2 px-3 font-medium w-32">단가</th>
                        <th className="text-right pb-2 px-3 font-medium w-32">소계</th>
                        <th className="pb-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {quoteItems.map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-2 pr-3">
                            <div className="relative">
                              <Input
                                value={item.name}
                                onChange={e => updateItem(idx, 'name', e.target.value.slice(0, ITEM_NAME_MAX))}
                                placeholder="항목명"
                              />
                              {item.name.length > ITEM_NAME_MAX - 10 && (
                                <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs tabular-nums ${
                                  item.name.length >= ITEM_NAME_MAX ? 'text-state-danger' : 'text-text-tertiary'
                                }`}>
                                  {item.name.length}/{ITEM_NAME_MAX}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <Input type="number" value={item.qty}
                              onChange={e => updateItem(idx, 'qty', Number(e.target.value))}
                              className="text-right" min={1} />
                          </td>
                          <td className="py-2 px-3">
                            <Input type="number" value={item.unit_price}
                              onChange={e => updateItem(idx, 'unit_price', Number(e.target.value))}
                              className="text-right" min={0} />
                          </td>
                          <td className="py-2 px-3 text-right text-text-primary font-medium tabular-nums">
                            {fmtKr(item.subtotal)}원
                          </td>
                          <td className="py-2 pl-1">
                            <button type="button" onClick={() => removeItem(idx)}
                              className="p-1 rounded text-text-tertiary hover:text-state-danger hover:bg-state-danger-bg transition-colors">
                              <X size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ── 4. 견적 조건 ─────────────────────────────────── */}
            <section className="bg-surface rounded-2xl shadow-soft p-6">
              <h2 className="text-lg font-semibold text-text-primary leading-snug mb-4">견적 조건</h2>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="유효기간 (일)">
                  <div className="flex items-center gap-2">
                    <Input type="number" value={validDays}
                      onChange={e => setValidDays(Math.max(1, Math.min(365, Number(e.target.value))))}
                      className="w-24" min={1} max={365} />
                    <span className="text-sm text-text-tertiary">일 후까지</span>
                  </div>
                </Field>
              </div>
              <div className="mt-3">
                <Field label="특이사항 (선택)">
                  <Textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="견적서에 포함할 특이사항이나 안내사항을 입력하세요."
                    rows={3}
                  />
                </Field>
              </div>
            </section>

            {/* ── 5. 금액 요약 + 발송 ──────────────────────────── */}
            <section className="bg-surface rounded-2xl shadow-soft p-6">
              <h2 className="text-lg font-semibold text-text-primary leading-snug mb-4">금액 요약</h2>
              <div className="space-y-2 text-sm mb-5">
                <div className="flex justify-between text-text-secondary">
                  <span>공급가액</span>
                  <span className="tabular-nums">{fmtKr(supplyAmount)}원</span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>부가세 (10%)</span>
                  <span className="tabular-nums">{fmtKr(vatAmount)}원</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-border-subtle font-semibold text-text-primary text-base">
                  <span>합계</span>
                  <span className="tabular-nums">{fmtKr(totalAmount)}원</span>
                </div>
              </div>
              <Button onClick={handleSend} disabled={sending} className="w-full" size="lg">
                {sending ? '발송 중...' : '견적서 보내기'}
              </Button>
              <p className="text-xs text-text-tertiary mt-2 text-center">
                PDF 자동 생성 → 이메일 발송 → 카카오 알림톡 발송
              </p>
            </section>

            {/* ── 6. 발송 이력 ─────────────────────────────────── */}
            {selected.quote_log && selected.quote_log.length > 0 && (
              <section className="bg-surface rounded-2xl shadow-soft p-6">
                <h2 className="text-lg font-semibold text-text-primary leading-snug mb-3">
                  발송 이력
                  <span className="ml-2 text-sm font-normal text-text-tertiary">({selected.quote_log.length}건)</span>
                </h2>
                <ul className="divide-y divide-border-subtle">
                  {[...selected.quote_log].reverse().map((log, idx) => (
                    <li key={log.quote_no} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {idx === 0 && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-600 font-medium flex-shrink-0">최신</span>
                          )}
                          <span className="text-sm font-medium text-text-primary tabular-nums truncate">{log.quote_no}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-text-tertiary">
                          <span>{new Date(log.sent_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                          {log.total_amount > 0 && (
                            <><span>·</span><span className="tabular-nums">{fmtKr(log.total_amount)}원</span></>
                          )}
                        </div>
                      </div>
                      {log.pdf_url && (
                        <a href={log.pdf_url} target="_blank" rel="noopener noreferrer"
                          className="flex-shrink-0 flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
                          <ExternalLink size={12} />PDF
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

          </div>
        )}
      </div>
    </div>
  )
}

// ─── 헬퍼 컴포넌트 ───────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1">{label}</label>
      {children}
    </div>
  )
}
