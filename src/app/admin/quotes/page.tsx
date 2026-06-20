'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Plus, X, FileText, ExternalLink, RefreshCw, ChevronLeft, ChevronRight, Save, RotateCcw, Upload, Trash2 } from 'lucide-react'

// ─── 타입 ────────────────────────────────────────────────────────

interface QuoteItem { name: string; qty: number; unit_price: number; subtotal: number }

interface QuoteLogEntry { quote_no: string; pdf_url: string | null; sent_at: string; total_amount: number }

interface ApplicationRow {
  id: string
  owner_name: string
  business_name: string
  phone: string
  email: string | null
  address: string
  construction_date: string | null
  care_scope: string | null
  last_quote_no: string | null
  last_quote_pdf_url: string | null
  quote_items: QuoteItem[] | null
  quote_log: QuoteLogEntry[] | null
  quote_notes: string | null
  created_at: string
  status: string
  notification_log: Array<{ type: string; sent_at: string; method?: string }> | null
  source: string | null
}

interface CompanyInfo {
  company_name: string; company_ceo: string; company_biz_no: string
  company_phone: string; company_address: string
}

interface CustomerInfo {
  owner_name: string; business_name: string; phone: string
  email: string; address: string; construction_date: string
}

type PricingMode = 'itemized' | 'total' | 'supply'

// ─── 상수 ────────────────────────────────────────────────────────

const BBK_DEFAULTS: CompanyInfo = {
  company_name: 'BBK 공간케어', company_ceo: '박범건',
  company_biz_no: '298-78-00455', company_phone: '031-759-4877',
  company_address: '경기도 성남시',
}
const ITEM_NAME_MAX = 40
const PAGE_SIZE     = 20

// ─── 유틸 ────────────────────────────────────────────────────────

const fmtKr   = (n: number) => n.toLocaleString('ko-KR')
const fmtDate = (s: string) => s.slice(0, 10)

// ─── 컴포넌트 ────────────────────────────────────────────────────

export default function QuotesPage() {
  // 목록
  const [applications, setApplications] = useState<ApplicationRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [page, setPage]         = useState(1)
  const [total, setTotal]       = useState(0)
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)

  // 선택
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // 공급자 (DB 연동)
  const [companyInfo, setCompanyInfo]       = useState<CompanyInfo>(BBK_DEFAULTS)
  const [savingSettings, setSavingSettings] = useState(false)
  const [sealImageUrl, setSealImageUrl]     = useState<string | null>(null)
  const [sealUploading, setSealUploading]   = useState(false)
  const sealInputRef = useRef<HTMLInputElement>(null)

  // 고객
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({
    owner_name: '', business_name: '', phone: '', email: '', address: '', construction_date: '',
  })

  // 견적 항목 & 금액 모드
  const [quoteItems, setQuoteItems]     = useState<QuoteItem[]>([])
  const [pricingMode, setPricingMode]   = useState<PricingMode>('itemized')
  const [directAmount, setDirectAmount] = useState(0)

  // 견적 조건
  const [validDays, setValidDays]   = useState(5)
  const [notes, setNotes]           = useState('')
  const [sending, setSending]       = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selected    = applications.find(a => a.id === selectedId) ?? null
  const totalPages  = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ── 금액 계산 (모드별) ────────────────────────────────────────
  const { supplyAmount, vatAmount, totalAmount } = (() => {
    if (pricingMode === 'itemized') {
      const supply = quoteItems.reduce((s, i) => s + i.subtotal, 0)
      const vat    = Math.round(supply * 0.1)
      return { supplyAmount: supply, vatAmount: vat, totalAmount: supply + vat }
    }
    if (pricingMode === 'total') {
      const supply = Math.round(directAmount / 1.1)
      const vat    = directAmount - supply
      return { supplyAmount: supply, vatAmount: vat, totalAmount: directAmount }
    }
    // supply mode
    const vat = Math.round(directAmount * 0.1)
    return { supplyAmount: directAmount, vatAmount: vat, totalAmount: directAmount + vat }
  })()

  // ── DB에서 공급자 정보 불러오기 ───────────────────────────────
  useEffect(() => {
    fetch('/api/admin/quote-settings')
      .then(r => r.json())
      .then(d => {
        setCompanyInfo({
          company_name:    d.company_name    ?? BBK_DEFAULTS.company_name,
          company_ceo:     d.company_ceo     ?? BBK_DEFAULTS.company_ceo,
          company_biz_no:  d.company_biz_no  ?? BBK_DEFAULTS.company_biz_no,
          company_phone:   d.company_phone   ?? BBK_DEFAULTS.company_phone,
          company_address: d.company_address ?? BBK_DEFAULTS.company_address,
        })
        setValidDays(d.valid_days ?? 5)
        setSealImageUrl(d.seal_image_url ?? null)
      })
      .catch(() => {})
  }, [])

  // ── 공급자 정보 DB 저장 ───────────────────────────────────────
  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      const res = await fetch('/api/admin/quote-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...companyInfo, valid_days: validDays }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '저장 실패')
      toast.success('기본값으로 저장되었습니다.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSavingSettings(false)
    }
  }

  // ── 인감 업로드 ───────────────────────────────────────────────
  const handleSealUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSealUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res  = await fetch('/api/admin/quote-settings/seal', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '업로드 실패')
      setSealImageUrl(data.seal_url)
      toast.success('인감 이미지가 저장되었습니다.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '업로드 실패')
    } finally {
      setSealUploading(false)
      if (sealInputRef.current) sealInputRef.current.value = ''
    }
  }

  // ── 인감 삭제 ─────────────────────────────────────────────────
  const handleSealDelete = async () => {
    setSealUploading(true)
    try {
      const res  = await fetch('/api/admin/quote-settings/seal', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '삭제 실패')
      setSealImageUrl(null)
      toast.success('인감 이미지가 삭제되었습니다.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '삭제 실패')
    } finally {
      setSealUploading(false)
    }
  }

  // ── 목록 로딩 ─────────────────────────────────────────────────
  const loadApplications = useCallback(async (p: number, q: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE), ...(q ? { search: q } : {}) })
      const res  = await fetch(`/api/admin/quotes?${params}`)
      if (!res.ok) throw new Error()
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

  const handleSearchChange = (value: string) => {
    setSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setPage(1); setSelectedId(null); loadApplications(1, value) }, 500)
  }
  const handlePageChange = (p: number) => { setPage(p); setSelectedId(null); loadApplications(p, search) }
  const handleRefresh    = () => loadApplications(page, search)

  // ── 케어범위 → 견적 항목 파싱 ────────────────────────────────
  const parseCareScope = (careScope: string): QuoteItem[] =>
    careScope
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('-'))
      .map(l => l.replace(/^-\s*/, '').trim())
      .filter(l => l.length > 0)
      .map(name => ({ name, qty: 1, unit_price: 0, subtotal: 0 }))

  // ── 항목 선택 ─────────────────────────────────────────────────
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
    // 기존 견적 항목이 있으면 그대로, 없으면 케어범위에서 자동 파싱
    const items = app.quote_items?.length
      ? app.quote_items.map(i => ({ ...i }))
      : app.care_scope
        ? parseCareScope(app.care_scope)
        : []
    setQuoteItems(items)
    setPricingMode('itemized')
    setDirectAmount(0)
    setNotes(app.quote_notes ?? '')
  }, [])

  // 서비스관리에서 이동 시 sessionStorage에서 appId 읽어 자동 선택
  useEffect(() => {
    const appId = sessionStorage.getItem('quotes_appId')
    if (!appId) return
    sessionStorage.removeItem('quotes_appId')
    fetch(`/api/admin/quotes?appId=${appId}`)
      .then(r => r.json())
      .then(d => {
        const app = d.applications?.[0]
        if (app) handleSelect(app)
      })
      .catch(() => {})
  }, [handleSelect])

  // ── 견적 항목·조건 임시 저장 ─────────────────────────────────
  const handleSaveDraft = async () => {
    if (!selectedId) return
    setSavingDraft(true)
    try {
      const res = await fetch(`/api/admin/quotes/${selectedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote_items: quoteItems, quote_notes: notes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '저장 실패')
      setApplications(prev => prev.map(a =>
        a.id === selectedId ? { ...a, quote_items: quoteItems, quote_notes: notes } : a
      ))
      toast.success('저장되었습니다.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSavingDraft(false)
    }
  }

  // ── 견적 항목 편집 ────────────────────────────────────────────
  const addItem    = () => setQuoteItems(p => [...p, { name: '', qty: 1, unit_price: 0, subtotal: 0 }])
  const removeItem = (i: number) => setQuoteItems(p => p.filter((_, idx) => idx !== i))
  const updateItem = (idx: number, field: keyof QuoteItem, value: string | number) => {
    setQuoteItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const updated = { ...item, [field]: value }
      if (field === 'qty' || field === 'unit_price') {
        updated.subtotal = (field === 'qty' ? Number(value) : item.qty)
                         * (field === 'unit_price' ? Number(value) : item.unit_price)
      }
      return updated
    }))
  }

  // ── 유효성 검사 ───────────────────────────────────────────────
  const validate = (): string | null => {
    if (!selected)                         return '신청서를 선택해 주세요.'
    if (!customerInfo.owner_name?.trim())  return '고객명이 없습니다.'
    if (!customerInfo.phone?.trim())       return '연락처가 없습니다.'
    if (!customerInfo.address?.trim())     return '주소가 없습니다.'
    if (pricingMode === 'itemized') {
      if (quoteItems.length === 0)              return '견적 항목을 1개 이상 추가해 주세요.'
      if (quoteItems.some(i => !i.name.trim())) return '항목명이 비어있는 항목이 있습니다.'
    } else {
      if (directAmount <= 0) return '금액을 입력해 주세요.'
    }
    if (!companyInfo.company_name?.trim()) return '공급자 상호가 없습니다.'
    return null
  }

  // ── 견적서 발송 ───────────────────────────────────────────────
  const handleSend = async () => {
    const err = validate()
    if (err) { toast.error(err); return }
    if (!selected) return

    setSending(true)
    try {
      const res = await fetch(`/api/admin/quotes/${selected.id}/send`, {
        method:  'POST',
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
          hide_item_prices:  pricingMode !== 'itemized',
          seal_image_url:    sealImageUrl ?? undefined,
        }),
      })
      const result = await res.json()
      if (result.success) {
        toast.success(`견적서 발송 완료 (${result.quote_no})${result.warnings?.kakao ? '\n카카오 알림톡은 발송되지 않았습니다.' : ''}`)
        await loadApplications(page, search)
      } else {
        const msg = result.errors
          ? Object.entries(result.errors as Record<string, string>).filter(([k]) => k !== 'kakao').map(([, v]) => v).join(', ')
          : '발송 실패'
        toast.error(`발송 오류: ${msg}`)
        await loadApplications(page, search)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '오류가 발생했습니다.')
    } finally {
      setSending(false)
    }
  }

  // ─── 렌더링 ──────────────────────────────────────────────────
  return (
    <div className="flex h-full gap-6 p-6">

      {/* ── 좌측: 신청 목록 ──────────────────────────────────── */}
      <aside className={`flex-shrink-0 flex flex-col gap-3 w-full md:w-72 ${selectedId !== null ? 'hidden md:flex' : 'flex'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary tracking-tight">견적관리</h1>
            <p className="text-[11px] text-text-tertiary mt-0.5">
              {loadedAt && `${loadedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 기준`}
              {total > 0 && ` · ${total}건`}
            </p>
          </div>
          <button type="button" onClick={handleRefresh} disabled={loading} title="새로고침"
            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-sunken transition-colors disabled:opacity-40">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <Input placeholder="고객명·업체명·연락처" value={search} onChange={e => handleSearchChange(e.target.value)} />

        <div className="flex-1 overflow-y-auto rounded-xl border border-border-subtle bg-surface min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-sm text-text-tertiary">로딩 중…</div>
          ) : applications.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-text-tertiary">검색 결과 없음</div>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {applications.map(app => {
                const isSent   = !!app.last_quote_no
                const isActive = selectedId === app.id
                return (
                  <li key={app.id}>
                    <button type="button" onClick={() => handleSelect(app)}
                      className={`w-full text-left px-4 py-3 transition-colors hover:bg-surface-sunken ${isActive ? 'bg-brand-50 border-l-2 border-l-brand-600' : ''}`}>
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-sm font-medium text-text-primary truncate">{app.owner_name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${isSent ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                          {isSent ? '발송완료' : '미발송'}
                        </span>
                      </div>
                      <div className="text-xs text-text-secondary truncate">{app.business_name || '—'}</div>
                      <div className="text-[11px] text-text-tertiary mt-0.5">{app.phone} · {fmtDate(app.created_at)}</div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => handlePageChange(page - 1)} disabled={page <= 1 || loading}
              className="p-1.5 rounded-lg hover:bg-surface-sunken disabled:opacity-30 transition-colors"><ChevronLeft size={15} /></button>
            <span className="text-xs text-text-tertiary tabular-nums">{page} / {totalPages}</span>
            <button type="button" onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages || loading}
              className="p-1.5 rounded-lg hover:bg-surface-sunken disabled:opacity-30 transition-colors"><ChevronRight size={15} /></button>
          </div>
        )}
      </aside>

      {/* ── 우측: 세부 패널 ───────────────────────────────────── */}
      <div className={`flex-1 overflow-y-auto min-w-0 ${selectedId !== null ? 'block' : 'hidden md:block'}`}>
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-text-tertiary">
            <FileText size={36} className="opacity-20" />
            <p className="text-sm">좌측 목록에서 신청서를 선택하세요.</p>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl">

            {/* 모바일 뒤로가기 */}
            <div className="flex items-center md:hidden">
              <button type="button" onClick={() => setSelectedId(null)}
                className="flex items-center gap-1.5 text-sm font-medium text-brand-600">
                <ChevronLeft size={16} />목록으로
              </button>
            </div>

            {/* ── 1. 공급자 정보 ─────────────────────────────── */}
            <Section>
              <SectionHeader title="공급자 정보">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setCompanyInfo(BBK_DEFAULTS)}
                    title="기본값으로 초기화"
                    className="p-1.5 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-sunken transition-colors">
                    <RotateCcw size={13} />
                  </button>
                  <Button size="sm" variant="secondary" onClick={handleSaveSettings} disabled={savingSettings}
                    className="flex items-center gap-1.5 text-xs">
                    <Save size={12} />
                    {savingSettings ? '저장 중…' : '기본값 저장'}
                  </Button>
                </div>
              </SectionHeader>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <FieldGroup label="상호">
                  <Input value={companyInfo.company_name} onChange={e => setCompanyInfo(p => ({ ...p, company_name: e.target.value }))} />
                </FieldGroup>
                <FieldGroup label="대표자">
                  <Input value={companyInfo.company_ceo} onChange={e => setCompanyInfo(p => ({ ...p, company_ceo: e.target.value }))} />
                </FieldGroup>
                <FieldGroup label="사업자번호">
                  <Input value={companyInfo.company_biz_no} onChange={e => setCompanyInfo(p => ({ ...p, company_biz_no: e.target.value }))} />
                </FieldGroup>
                <FieldGroup label="대표 연락처">
                  <Input value={companyInfo.company_phone} onChange={e => setCompanyInfo(p => ({ ...p, company_phone: e.target.value }))} />
                </FieldGroup>
                <div className="col-span-2">
                  <FieldGroup label="주소">
                    <Input value={companyInfo.company_address} onChange={e => setCompanyInfo(p => ({ ...p, company_address: e.target.value }))} />
                  </FieldGroup>
                </div>
              </div>

              {/* 인감 이미지 */}
              <div className="mt-4 pt-4 border-t border-border-subtle">
                <FieldGroup label="인감 이미지 (PDF에 포함)">
                  <div className="flex items-center gap-3 mt-1">
                    {sealImageUrl ? (
                      <>
                        <div className="w-16 h-16 rounded-xl border border-border-subtle overflow-hidden flex-shrink-0 bg-surface-sunken flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`${sealImageUrl}?v=${Date.now()}`} alt="인감" className="w-full h-full object-contain" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <p className="text-xs text-text-secondary">인감 이미지가 등록되어 있습니다.</p>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => sealInputRef.current?.click()} disabled={sealUploading}
                              className="text-xs text-brand-600 hover:text-brand-700 font-medium disabled:opacity-40">
                              변경
                            </button>
                            <span className="text-text-tertiary">·</span>
                            <button type="button" onClick={handleSealDelete} disabled={sealUploading}
                              className="text-xs text-state-danger hover:opacity-80 font-medium disabled:opacity-40 flex items-center gap-1">
                              <Trash2 size={11} />삭제
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <button type="button" onClick={() => sealInputRef.current?.click()} disabled={sealUploading}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-xs text-text-secondary hover:border-brand-400 hover:text-brand-600 transition-colors disabled:opacity-40">
                        <Upload size={13} />
                        {sealUploading ? '업로드 중…' : 'PNG / JPG 업로드'}
                      </button>
                    )}
                    <input ref={sealInputRef} type="file" accept="image/png,image/jpeg,image/webp"
                      onChange={handleSealUpload} className="hidden" />
                  </div>
                  <p className="text-[10px] text-text-tertiary mt-1.5">투명 배경 PNG 권장 · 최대 2MB</p>
                </FieldGroup>
              </div>
            </Section>

            {/* ── 2. 고객 정보 ───────────────────────────────── */}
            <Section>
              <SectionHeader title="고객 정보" />
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <FieldGroup label="대표자">
                  <Input value={customerInfo.owner_name} onChange={e => setCustomerInfo(p => ({ ...p, owner_name: e.target.value }))} />
                </FieldGroup>
                <FieldGroup label="업체명">
                  <Input value={customerInfo.business_name} onChange={e => setCustomerInfo(p => ({ ...p, business_name: e.target.value }))} />
                </FieldGroup>
                <FieldGroup label="연락처">
                  <Input value={customerInfo.phone} onChange={e => setCustomerInfo(p => ({ ...p, phone: e.target.value }))} />
                </FieldGroup>
                <FieldGroup label="이메일">
                  <Input value={customerInfo.email} onChange={e => setCustomerInfo(p => ({ ...p, email: e.target.value }))} />
                </FieldGroup>
                <FieldGroup label="시공일자">
                  <Input type="date" value={customerInfo.construction_date} onChange={e => setCustomerInfo(p => ({ ...p, construction_date: e.target.value }))} />
                </FieldGroup>
                <div className="col-span-2">
                  <FieldGroup label="주소">
                    <Input value={customerInfo.address} onChange={e => setCustomerInfo(p => ({ ...p, address: e.target.value }))} />
                  </FieldGroup>
                </div>
              </div>
            </Section>

            {/* ── 3. 견적 항목 & 금액 모드 ───────────────────── */}
            <Section>
              <SectionHeader title="견적 항목">
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={handleSaveDraft} disabled={savingDraft || !selectedId}
                    className="flex items-center gap-1.5 text-xs">
                    <Save size={12} />
                    {savingDraft ? '저장 중…' : '저장'}
                  </Button>
                {/* 금액 입력 방식 탭 */}
                <div className="flex rounded-lg bg-surface-sunken border border-border-subtle p-0.5 gap-0.5">
                  {(['itemized', 'total', 'supply'] as PricingMode[]).map(m => (
                    <button key={m} type="button"
                      onClick={() => { setPricingMode(m); setDirectAmount(0) }}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        pricingMode === m
                          ? 'bg-surface text-text-primary shadow-flat'
                          : 'text-text-tertiary hover:text-text-secondary'
                      }`}>
                      {m === 'itemized' ? '항목별' : m === 'total' ? '합계기준' : '공급가기준'}
                    </button>
                  ))}
                </div>
                </div>
              </SectionHeader>

              {/* 합계/공급가액 직접 입력 */}
              {pricingMode !== 'itemized' && (
                <div className="mb-4 p-4 rounded-xl bg-surface-sunken border border-border-subtle">
                  <FieldGroup label={pricingMode === 'total' ? '합계금액 (VAT 포함)' : '공급가액 (VAT 제외)'}>
                    <div className="flex items-center gap-2">
                      <Input type="number" value={directAmount || ''} min={0}
                        onChange={e => setDirectAmount(Number(e.target.value))}
                        className="text-right font-medium" placeholder="0" />
                      <span className="text-sm text-text-tertiary flex-shrink-0">원</span>
                    </div>
                  </FieldGroup>
                  {directAmount > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div className="text-center p-2 rounded-lg bg-surface border border-border-subtle">
                        <div className="text-text-tertiary mb-0.5">공급가액</div>
                        <div className="font-semibold text-text-primary tabular-nums">{fmtKr(supplyAmount)}</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-surface border border-border-subtle">
                        <div className="text-text-tertiary mb-0.5">부가세</div>
                        <div className="font-semibold text-text-primary tabular-nums">{fmtKr(vatAmount)}</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-brand-50 border border-brand-200">
                        <div className="text-brand-600 mb-0.5">합계</div>
                        <div className="font-bold text-brand-600 tabular-nums">{fmtKr(totalAmount)}</div>
                      </div>
                    </div>
                  )}
                  <p className="mt-2 text-[11px] text-text-tertiary">
                    아래 항목 목록은 PDF에 설명용으로만 표시됩니다. 금액 열은 나타나지 않습니다.
                  </p>
                </div>
              )}

              {/* 항목 테이블 */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-text-tertiary">
                  {pricingMode === 'itemized' ? `${quoteItems.length}개 항목` : '설명 항목 (선택)'}
                </span>
                <Button size="sm" variant="secondary" onClick={addItem} className="flex items-center gap-1 text-xs">
                  <Plus size={12} />항목 추가
                </Button>
              </div>

              {quoteItems.length === 0 ? (
                <div className="py-8 text-center text-sm text-text-tertiary border border-dashed border-border-subtle rounded-xl">
                  {pricingMode === 'itemized' ? '항목 추가 버튼을 눌러 견적 항목을 입력하세요.' : '설명 항목을 추가할 수 있습니다. (선택사항)'}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border-subtle">
                  <table className="w-full min-w-max text-sm">
                    <thead className="bg-surface-sunken border-b border-border-subtle">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-text-secondary">항목명</th>
                        {pricingMode === 'itemized' && <>
                          <th className="text-right px-3 py-2.5 text-xs font-medium text-text-secondary w-20">수량</th>
                          <th className="text-right px-3 py-2.5 text-xs font-medium text-text-secondary w-32">단가</th>
                          <th className="text-right px-4 py-2.5 text-xs font-medium text-text-secondary w-28">소계</th>
                        </>}
                        <th className="py-2.5 w-9" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {quoteItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-surface-sunken transition-colors">
                          <td className="px-4 py-2">
                            <div className="relative">
                              <Input value={item.name}
                                onChange={e => updateItem(idx, 'name', e.target.value.slice(0, ITEM_NAME_MAX))}
                                placeholder="항목명 입력" />
                              {item.name.length >= ITEM_NAME_MAX - 8 && (
                                <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] tabular-nums pointer-events-none ${item.name.length >= ITEM_NAME_MAX ? 'text-state-danger' : 'text-text-tertiary'}`}>
                                  {item.name.length}/{ITEM_NAME_MAX}
                                </span>
                              )}
                            </div>
                          </td>
                          {pricingMode === 'itemized' && <>
                            <td className="px-3 py-2">
                              <Input type="number" value={item.qty} min={1}
                                onChange={e => updateItem(idx, 'qty', Number(e.target.value))}
                                className="text-right" />
                            </td>
                            <td className="px-3 py-2">
                              <Input type="number" value={item.unit_price} min={0}
                                onChange={e => updateItem(idx, 'unit_price', Number(e.target.value))}
                                className="text-right" />
                            </td>
                            <td className="px-4 py-2 text-right font-medium text-text-primary tabular-nums">
                              {fmtKr(item.subtotal)}
                            </td>
                          </>}
                          <td className="pr-2 py-2 text-center">
                            <button type="button" onClick={() => removeItem(idx)}
                              className="p-1 rounded text-text-tertiary hover:text-state-danger hover:bg-state-danger-bg transition-colors">
                              <X size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* ── 4. 견적 조건 ───────────────────────────────── */}
            <Section>
              <SectionHeader title="견적 조건">
                <Button size="sm" variant="secondary" onClick={handleSaveDraft} disabled={savingDraft || !selectedId}
                  className="flex items-center gap-1.5 text-xs">
                  <Save size={12} />
                  {savingDraft ? '저장 중…' : '저장'}
                </Button>
              </SectionHeader>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <FieldGroup label="견적 유효기간">
                  <div className="flex items-center gap-2">
                    <Input type="number" value={validDays} min={1} max={365}
                      onChange={e => setValidDays(Math.max(1, Math.min(365, Number(e.target.value))))}
                      className="w-24" />
                    <span className="text-sm text-text-secondary flex-shrink-0">일 후 만료</span>
                  </div>
                </FieldGroup>
              </div>
              <div className="mt-3">
                <FieldGroup label="특이사항 (선택 — PDF에 포함)">
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="견적서에 포함할 안내사항 또는 주의사항을 입력하세요." rows={3} />
                </FieldGroup>
              </div>
            </Section>

            {/* ── 5. 금액 요약 + 발송 ──────────────────────── */}
            <Section className="border-brand-200">
              <SectionHeader title="최종 금액" />
              <div className="space-y-2 mb-5">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-secondary">공급가액</span>
                  <span className="tabular-nums font-medium text-text-primary">{fmtKr(supplyAmount)}원</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-secondary">부가세 (10%)</span>
                  <span className="tabular-nums text-text-secondary">{fmtKr(vatAmount)}원</span>
                </div>
                <div className="h-px bg-border-subtle my-1" />
                <div className="flex justify-between items-center">
                  <span className="text-base font-semibold text-text-primary">합  계</span>
                  <span className="text-2xl font-bold text-brand-600 tabular-nums">{fmtKr(totalAmount)}원</span>
                </div>
              </div>
              <Button onClick={handleSend} disabled={sending || totalAmount === 0} className="w-full" size="lg">
                {sending ? '발송 중…' : '견적서 발송'}
              </Button>
              <p className="text-[11px] text-text-tertiary mt-2 text-center">
                PDF 생성 → 이메일 · 카카오 알림톡 발송
              </p>
            </Section>

            {/* ── 6. 발송 이력 ───────────────────────────────── */}
            {selected.quote_log && selected.quote_log.length > 0 && (
              <Section>
                <SectionHeader title={`발송 이력`}>
                  <span className="text-xs text-text-tertiary">{selected.quote_log.length}건</span>
                </SectionHeader>
                <ul className="divide-y divide-border-subtle -mx-6 px-6">
                  {[...selected.quote_log].reverse().map((log, idx) => (
                    <li key={log.quote_no} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {idx === 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-600 font-medium flex-shrink-0">최신</span>
                          )}
                          <span className="text-sm font-medium text-text-primary tabular-nums truncate">{log.quote_no}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-text-tertiary">
                          <span>{new Date(log.sent_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                          {log.total_amount > 0 && <><span>·</span><span className="tabular-nums">{fmtKr(log.total_amount)}원</span></>}
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
              </Section>
            )}

          </div>
        )}
      </div>
    </div>
  )
}

// ─── 헬퍼 컴포넌트 ───────────────────────────────────────────────

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-surface rounded-2xl border border-border-subtle p-6 ${className}`}>
      {children}
    </section>
  )
}

function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-2.5">
        <span className="block w-[3px] h-[14px] rounded-full bg-brand-600 flex-shrink-0" />
        <h2 className="text-sm font-semibold text-text-primary tracking-tight">{title}</h2>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-text-tertiary uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  )
}
