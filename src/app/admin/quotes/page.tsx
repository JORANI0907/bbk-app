'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Plus, X, FileText, ExternalLink, RefreshCw, ChevronLeft, ChevronRight, Save, RotateCcw, Upload, Trash2, Send, Pencil, CheckCircle2 } from 'lucide-react'

// ─── 타입 ────────────────────────────────────────────────────────

interface QuoteItem { name: string; qty: number; unit_price: number; subtotal: number }

interface QuoteLogEntry { quote_no: string; pdf_url: string | null; sent_at: string; total_amount: number }

interface SavedQuote {
  id: string
  label: string
  quote_items: QuoteItem[]
  pricing_mode: 'itemized' | 'total' | 'supply'
  direct_amount: number
  discount_mode: 'none' | 'rate' | 'amount'
  discount_rate: number
  discount_input: number
  supply_amount: number
  vat_amount: number
  total_amount: number
  valid_days: number
  notes: string
  quote_no: string | null
  pdf_url: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

interface ApplicationRow {
  id: string
  owner_name: string
  business_name: string
  phone: string
  phone_2: string | null
  phone_notify_1: boolean | null
  phone_notify_2: boolean | null
  email: string | null
  address: string
  construction_date: string | null
  care_scope: string | null
  last_quote_no: string | null
  last_quote_pdf_url: string | null
  quote_items: QuoteItem[] | null
  quote_log: QuoteLogEntry[] | null
  quote_notes: string | null
  saved_quotes: SavedQuote[] | null
  created_at: string
  status: string
  notification_log: Array<{ type: string; sent_at: string; method?: string }> | null
  source: string | null
}

interface CompanyInfo {
  company_name: string; company_ceo: string; company_biz_no: string
  company_phone: string; company_address: string
  bank_name: string; bank_account_number: string; bank_account_holder: string
}

interface CustomerInfo {
  owner_name: string; business_name: string; phone: string
  phone_2: string
  phone_notify_1: boolean
  phone_notify_2: boolean
  email: string; address: string; construction_date: string
}

type PricingMode = 'itemized' | 'total' | 'supply'
type DiscountMode = 'none' | 'rate' | 'amount'

// ─── 상수 ────────────────────────────────────────────────────────

const BBK_DEFAULTS: CompanyInfo = {
  company_name: 'BBK 공간케어', company_ceo: '박범건',
  company_biz_no: '298-78-00455', company_phone: '031-759-4877',
  company_address: '경기도 성남시',
  bank_name: '', bank_account_number: '', bank_account_holder: '',
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
    owner_name: '', business_name: '', phone: '', phone_2: '',
    phone_notify_1: true, phone_notify_2: true,
    email: '', address: '', construction_date: '',
  })

  // 견적 항목 & 금액 모드
  const [quoteItems, setQuoteItems]     = useState<QuoteItem[]>([])
  const [pricingMode, setPricingMode]   = useState<PricingMode>('itemized')
  const [directAmount, setDirectAmount] = useState(0)

  // 할인 (itemized·supply → 공급가액 기준 / total → 총액 기준)
  const [discountMode, setDiscountMode]     = useState<DiscountMode>('none')
  const [discountRate, setDiscountRate]     = useState<number>(0)
  const [discountInput, setDiscountInput]   = useState<number>(0)

  // 견적 조건
  const [validDays, setValidDays]   = useState(5)
  const [notes, setNotes]           = useState('')
  const [savingDraft, setSavingDraft] = useState(false)

  // 견적서 저장/발송 관리
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false)
  const [sendingQuoteId, setSendingQuoteId] = useState<string | null>(null)
  const [regeneratingQuoteId, setRegeneratingQuoteId] = useState<string | null>(null)
  const historyRef = useRef<HTMLDivElement>(null)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selected    = applications.find(a => a.id === selectedId) ?? null
  const totalPages  = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ── 금액 계산 (모드별) ────────────────────────────────────────
  // 1) 할인 전 원가 (모드별)
  const { origSupply, origVat, origTotal } = (() => {
    if (pricingMode === 'itemized') {
      const s = quoteItems.reduce((sum, i) => sum + i.subtotal, 0)
      const v = Math.round(s * 0.1)
      return { origSupply: s, origVat: v, origTotal: s + v }
    }
    if (pricingMode === 'total') {
      const s = Math.round(directAmount / 1.1)
      return { origSupply: s, origVat: directAmount - s, origTotal: directAmount }
    }
    const v = Math.round(directAmount * 0.1)
    return { origSupply: directAmount, origVat: v, origTotal: directAmount + v }
  })()

  // 2) 할인 기준 금액 (itemized·supply 는 공급가액 / total 은 총액)
  const discountBase = pricingMode === 'total' ? origTotal : origSupply

  // 3) 사용자 입력 → 할인금액(원) 확정
  const computedDiscountAmount = (() => {
    if (discountMode === 'rate') {
      const rate = Math.max(0, Math.min(100, discountRate))
      return Math.min(Math.round((rate / 100) * discountBase), discountBase)
    }
    if (discountMode === 'amount') {
      return Math.min(Math.max(0, Math.floor(discountInput)), discountBase)
    }
    return 0
  })()

  // 4) 최종 금액 (할인 반영)
  const { supplyAmount, vatAmount, totalAmount } = (() => {
    if (discountMode === 'none' || computedDiscountAmount === 0) {
      return { supplyAmount: origSupply, vatAmount: origVat, totalAmount: origTotal }
    }
    if (pricingMode === 'total') {
      // 총액에서 차감 → 공급/부가세 역산
      const finalTotal = Math.max(0, origTotal - computedDiscountAmount)
      const finalSupply = Math.round(finalTotal / 1.1)
      const finalVat = finalTotal - finalSupply
      return { supplyAmount: finalSupply, vatAmount: finalVat, totalAmount: finalTotal }
    }
    // 공급가액에서 차감 → 부가세 재계산
    const finalSupply = Math.max(0, origSupply - computedDiscountAmount)
    const finalVat = Math.round(finalSupply * 0.1)
    return { supplyAmount: finalSupply, vatAmount: finalVat, totalAmount: finalSupply + finalVat }
  })()

  // 5) 표시용 할인률 (사용자가 amount 로 입력해도 % 표시가 가능하도록)
  const effectiveDiscountRate = discountBase > 0
    ? Math.round((computedDiscountAmount / discountBase) * 1000) / 10
    : 0

  // ── DB에서 공급자 정보 불러오기 ───────────────────────────────
  useEffect(() => {
    fetch('/api/admin/quote-settings')
      .then(r => r.json())
      .then(d => {
        setCompanyInfo({
          company_name:        d.company_name        ?? BBK_DEFAULTS.company_name,
          company_ceo:         d.company_ceo         ?? BBK_DEFAULTS.company_ceo,
          company_biz_no:      d.company_biz_no      ?? BBK_DEFAULTS.company_biz_no,
          company_phone:       d.company_phone       ?? BBK_DEFAULTS.company_phone,
          company_address:     d.company_address     ?? BBK_DEFAULTS.company_address,
          bank_name:           d.bank_name           ?? '',
          bank_account_number: d.bank_account_number ?? '',
          bank_account_holder: d.bank_account_holder ?? '',
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
      phone_2:           app.phone_2           || '',
      phone_notify_1:    app.phone_notify_1 !== false,   // 기본 true
      phone_notify_2:    app.phone_notify_2 !== false,   // 기본 true
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
    setDiscountMode('none')
    setDiscountRate(0)
    setDiscountInput(0)
    setNotes(app.quote_notes ?? '')
    setEditingQuoteId(null)
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

  // ── 폼 리셋 (신규 견적서 작성 시작) ─────────────────────────
  const resetForm = () => {
    setQuoteItems(selected?.care_scope ? parseCareScope(selected.care_scope) : [])
    setPricingMode('itemized')
    setDirectAmount(0)
    setDiscountMode('none')
    setDiscountRate(0)
    setDiscountInput(0)
    setNotes(selected?.quote_notes ?? '')
    setEditingQuoteId(null)
  }

  // ── 견적서 완성 (신규 저장 or 기존 수정 저장) ──────────────
  const handleComplete = async () => {
    const err = validate()
    if (err) { toast.error(err); return }
    if (!selected) return

    setCompleting(true)
    try {
      const existing: SavedQuote[] = selected.saved_quotes ?? []
      const now = new Date().toISOString()
      let updated: SavedQuote[]
      let label: string

      if (editingQuoteId) {
        // 수정 모드: 기존 항목 업데이트 (발송 정보는 유지)
        updated = existing.map((q) => {
          if (q.id !== editingQuoteId) return q
          return {
            ...q,
            quote_items:   quoteItems,
            pricing_mode:  pricingMode,
            direct_amount: directAmount,
            discount_mode: discountMode,
            discount_rate: discountRate,
            discount_input: discountInput,
            supply_amount: supplyAmount,
            vat_amount:    vatAmount,
            total_amount:  totalAmount,
            valid_days:    validDays,
            notes,
            updated_at:    now,
          }
        })
        label = existing.find((q) => q.id === editingQuoteId)?.label ?? '견적서'
      } else {
        // 신규: saved_quotes 배열에 push
        const nextIndex = existing.length + 1
        label = `견적서 #${nextIndex}`
        const newQuote: SavedQuote = {
          id: crypto.randomUUID(),
          label,
          quote_items:   quoteItems,
          pricing_mode:  pricingMode,
          direct_amount: directAmount,
          discount_mode: discountMode,
          discount_rate: discountRate,
          discount_input: discountInput,
          supply_amount: supplyAmount,
          vat_amount:    vatAmount,
          total_amount:  totalAmount,
          valid_days:    validDays,
          notes,
          quote_no:  null,
          pdf_url:   null,
          sent_at:   null,
          created_at: now,
          updated_at: now,
        }
        updated = [...existing, newQuote]
      }

      const res = await fetch(`/api/admin/quotes/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saved_quotes: updated }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '저장 실패')

      setApplications(prev => prev.map(a =>
        a.id === selected.id ? { ...a, saved_quotes: updated } : a
      ))
      toast.success(editingQuoteId ? `'${label}' 수정 완료` : `'${label}' 저장 완료`)
      resetForm()

      // 발송이력 섹션으로 스크롤
      setTimeout(() => historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setCompleting(false)
    }
  }

  // ── 저장된 견적서 편집 시작 (폼에 로드) ─────────────────────
  const handleEditSavedQuote = (q: SavedQuote) => {
    setQuoteItems(q.quote_items.map(i => ({ ...i })))
    setPricingMode(q.pricing_mode)
    setDirectAmount(q.direct_amount)
    setDiscountMode(q.discount_mode)
    setDiscountRate(q.discount_rate)
    setDiscountInput(q.discount_input)
    setValidDays(q.valid_days)
    setNotes(q.notes)
    setEditingQuoteId(q.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── 저장된 견적서 삭제 ─────────────────────────────────────
  const handleDeleteSavedQuote = async (q: SavedQuote) => {
    if (!selected) return
    if (!confirm(`'${q.label}' 을(를) 삭제하시겠습니까?`)) return
    try {
      const updated = (selected.saved_quotes ?? []).filter(x => x.id !== q.id)
      const res = await fetch(`/api/admin/quotes/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saved_quotes: updated }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '삭제 실패')
      setApplications(prev => prev.map(a =>
        a.id === selected.id ? { ...a, saved_quotes: updated } : a
      ))
      if (editingQuoteId === q.id) resetForm()
      toast.success('삭제되었습니다.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  // ── 저장된 견적서 발송 ─────────────────────────────────────
  const handleSendSavedQuote = async (q: SavedQuote) => {
    if (!selected) return

    // 저장된 견적서 데이터로 금액 재계산 (원가/할인)
    const { origSupply: qOrigSupply, origTotal: qOrigTotal } = (() => {
      if (q.pricing_mode === 'itemized') {
        const s = q.quote_items.reduce((sum, i) => sum + i.subtotal, 0)
        return { origSupply: s, origTotal: s + Math.round(s * 0.1) }
      }
      if (q.pricing_mode === 'total') {
        const s = Math.round(q.direct_amount / 1.1)
        return { origSupply: s, origTotal: q.direct_amount }
      }
      return { origSupply: q.direct_amount, origTotal: q.direct_amount + Math.round(q.direct_amount * 0.1) }
    })()
    const qDiscountBase = q.pricing_mode === 'total' ? qOrigTotal : qOrigSupply
    const qDiscountAmount = (() => {
      if (q.discount_mode === 'rate') {
        const rate = Math.max(0, Math.min(100, q.discount_rate))
        return Math.min(Math.round((rate / 100) * qDiscountBase), qDiscountBase)
      }
      if (q.discount_mode === 'amount') {
        return Math.min(Math.max(0, Math.floor(q.discount_input)), qDiscountBase)
      }
      return 0
    })()
    const qEffectiveRate = qDiscountBase > 0
      ? Math.round((qDiscountAmount / qDiscountBase) * 1000) / 10
      : 0

    setSendingQuoteId(q.id)
    try {
      const res = await fetch(`/api/admin/quotes/${selected.id}/send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...companyInfo,
          owner_name:        customerInfo.owner_name,
          business_name:     customerInfo.business_name,
          phone:             customerInfo.phone,
          phone_2:           customerInfo.phone_2 || null,
          phone_notify_1:    customerInfo.phone_notify_1,
          phone_notify_2:    customerInfo.phone_notify_2,
          email:             customerInfo.email,
          address:           customerInfo.address,
          construction_date: customerInfo.construction_date,
          quote_items:       q.quote_items,
          supply_amount:     q.supply_amount,
          vat:               q.vat_amount,
          total_amount:      q.total_amount,
          discount_amount:     qDiscountAmount,
          discount_rate:       qDiscountAmount > 0 ? qEffectiveRate : 0,
          discount_base_label: q.pricing_mode === 'total' ? '총액' : '공급가액',
          orig_supply_amount:  qOrigSupply,
          orig_total_amount:   qOrigTotal,
          valid_days:        q.valid_days,
          notes:             q.notes || undefined,
          hide_item_prices:  q.pricing_mode !== 'itemized',
          seal_image_url:    sealImageUrl ?? undefined,
          saved_quote_id:    q.id,
        }),
      })
      const result = await res.json()
      if (result.success) {
        toast.success(`'${q.label}' 발송 완료 (${result.quote_no})${result.warnings?.kakao ? '\n카카오 알림톡은 발송되지 않았습니다.' : ''}`)
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
      setSendingQuoteId(null)
    }
  }

  // ── 저장된 견적서 PDF 재생성 (알림 없음) ────────────────────
  // 견적서를 여러 개 만든 후 같은 분 내에 발송하면 quote_no가 중복되어
  // PDF 파일이 덮어씌워지는 이슈를 개별 재생성으로 복구.
  const handleRegeneratePdf = async (q: SavedQuote) => {
    if (!selected) return
    if (!confirm(`'${q.label}' PDF를 새로 생성합니다.\n\n· 카카오 알림톡·이메일은 발송되지 않습니다.\n· 새 PDF 파일이 만들어지고 이력에 반영됩니다.`)) return
    setRegeneratingQuoteId(q.id)
    try {
      const res = await fetch(`/api/admin/quotes/${selected.id}/regenerate-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saved_quote_id: q.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '재생성 실패')
      toast.success(`'${q.label}' PDF 재생성 완료 (${data.quote_no})`)
      await loadApplications(page, search)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PDF 재생성 실패')
    } finally {
      setRegeneratingQuoteId(null)
    }
  }

  // ─── 렌더링 ──────────────────────────────────────────────────
  return (
    <div className="flex flex-col md:flex-row md:h-full gap-4 md:gap-6 p-3 md:p-6">

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

        <div className="md:flex-1 md:overflow-y-auto rounded-xl border border-border-subtle bg-surface md:min-h-0 max-h-[50vh] md:max-h-none overflow-y-auto">
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
      <div className={`flex-1 md:overflow-y-auto min-w-0 ${selectedId !== null ? 'block' : 'hidden md:block'}`}>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
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
                <div className="col-span-1 sm:col-span-2">
                  <FieldGroup label="주소">
                    <Input value={companyInfo.company_address} onChange={e => setCompanyInfo(p => ({ ...p, company_address: e.target.value }))} />
                  </FieldGroup>
                </div>
              </div>

              {/* 입금 계좌 */}
              <div className="mt-4 pt-4 border-t border-border-subtle">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">입금 계좌</span>
                  <span className="text-[10px] text-text-tertiary">견적서 PDF에 자동 포함</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3">
                  <FieldGroup label="은행명">
                    <Input value={companyInfo.bank_name}
                      onChange={e => setCompanyInfo(p => ({ ...p, bank_name: e.target.value }))}
                      placeholder="예: 국민은행" />
                  </FieldGroup>
                  <div className="sm:col-span-2">
                    <FieldGroup label="계좌번호">
                      <Input value={companyInfo.bank_account_number}
                        onChange={e => setCompanyInfo(p => ({ ...p, bank_account_number: e.target.value }))}
                        placeholder="000-000-000000" />
                    </FieldGroup>
                  </div>
                  <div className="sm:col-span-3">
                    <FieldGroup label="예금주">
                      <Input value={companyInfo.bank_account_holder}
                        onChange={e => setCompanyInfo(p => ({ ...p, bank_account_holder: e.target.value }))}
                        placeholder="예: 범빌드코리아" />
                    </FieldGroup>
                  </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <FieldGroup label="대표자">
                  <Input value={customerInfo.owner_name} onChange={e => setCustomerInfo(p => ({ ...p, owner_name: e.target.value }))} />
                </FieldGroup>
                <FieldGroup label="업체명">
                  <Input value={customerInfo.business_name} onChange={e => setCustomerInfo(p => ({ ...p, business_name: e.target.value }))} />
                </FieldGroup>
                <FieldGroup label="연락처">
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-[11px] text-text-tertiary shrink-0 cursor-pointer" title="발송 대상 포함 여부">
                      <input
                        type="checkbox"
                        checked={customerInfo.phone_notify_1}
                        onChange={e => setCustomerInfo(p => ({ ...p, phone_notify_1: e.target.checked }))}
                        className="accent-brand-600"
                      />
                      발송
                    </label>
                    <Input value={customerInfo.phone} onChange={e => setCustomerInfo(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                </FieldGroup>
                <FieldGroup label="알림수신 추가번호">
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-[11px] text-text-tertiary shrink-0 cursor-pointer" title="발송 대상 포함 여부">
                      <input
                        type="checkbox"
                        checked={customerInfo.phone_notify_2}
                        onChange={e => setCustomerInfo(p => ({ ...p, phone_notify_2: e.target.checked }))}
                        disabled={!customerInfo.phone_2?.trim()}
                        className="accent-brand-600 disabled:opacity-40"
                      />
                      발송
                    </label>
                    <Input
                      value={customerInfo.phone_2}
                      onChange={e => setCustomerInfo(p => ({ ...p, phone_2: e.target.value }))}
                      placeholder="선택"
                    />
                  </div>
                </FieldGroup>
                <FieldGroup label="이메일">
                  <Input value={customerInfo.email} onChange={e => setCustomerInfo(p => ({ ...p, email: e.target.value }))} />
                </FieldGroup>
                <FieldGroup label="시공일자">
                  <Input type="date" value={customerInfo.construction_date} onChange={e => setCustomerInfo(p => ({ ...p, construction_date: e.target.value }))} />
                </FieldGroup>
                <div className="col-span-1 sm:col-span-2">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
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

              {/* 할인 컨트롤 — itemized·supply 는 공급가액 기준, total 은 총액 기준 */}
              <div className="mb-4 rounded-lg border border-border-subtle bg-surface-sunken/50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-text-primary">할인</span>
                  <span className="text-[11px] text-text-tertiary">
                    기준: {pricingMode === 'total' ? '총액' : '공급가액'} {fmtKr(discountBase)}원
                  </span>
                </div>
                <div className="flex gap-1 bg-surface rounded-md p-0.5 border border-border-subtle mb-2">
                  {(['none', 'rate', 'amount'] as DiscountMode[]).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setDiscountMode(m)}
                      className={`flex-1 py-1 rounded text-[11px] font-semibold transition-colors ${
                        discountMode === m ? 'bg-brand-600 text-white' : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {m === 'none' ? '없음' : m === 'rate' ? '할인률(%)' : '할인금액(원)'}
                    </button>
                  ))}
                </div>
                {discountMode === 'rate' && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={discountRate || ''}
                      min={0}
                      max={100}
                      onChange={e => setDiscountRate(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                      className="w-24 text-right"
                    />
                    <span className="text-xs text-text-secondary">%</span>
                    <span className="ml-auto text-xs text-text-tertiary tabular-nums">
                      = -{fmtKr(computedDiscountAmount)}원
                    </span>
                  </div>
                )}
                {discountMode === 'amount' && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={discountInput || ''}
                      min={0}
                      max={discountBase}
                      onChange={e => setDiscountInput(Math.max(0, Math.min(discountBase, Number(e.target.value) || 0)))}
                      className="w-32 text-right"
                    />
                    <span className="text-xs text-text-secondary">원</span>
                    <span className="ml-auto text-xs text-text-tertiary tabular-nums">
                      ≈ {effectiveDiscountRate}%
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2 mb-5">
                {/* 할인 있을 때: 원가 → 할인 라인을 별도 표시 */}
                {discountMode !== 'none' && computedDiscountAmount > 0 && (
                  <>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-text-tertiary">
                        {pricingMode === 'total' ? '합계 (할인 전)' : '공급가액 (할인 전)'}
                      </span>
                      <span className="tabular-nums text-text-tertiary line-through">
                        {fmtKr(pricingMode === 'total' ? origTotal : origSupply)}원
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-state-danger">할인 ({effectiveDiscountRate}%)</span>
                      <span className="tabular-nums text-state-danger">-{fmtKr(computedDiscountAmount)}원</span>
                    </div>
                    <div className="h-px bg-border-subtle my-1" />
                  </>
                )}
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
              {editingQuoteId && (
                <div className="mb-2 flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <span className="text-xs text-amber-700 font-medium">
                    수정 모드: {selected.saved_quotes?.find(q => q.id === editingQuoteId)?.label ?? '견적서'}
                  </span>
                  <button type="button" onClick={resetForm}
                    className="text-[11px] text-amber-700 hover:text-amber-800 font-medium underline">
                    취소
                  </button>
                </div>
              )}
              <Button onClick={handleComplete} disabled={completing || totalAmount === 0} className="w-full" size="lg">
                {completing ? '저장 중…' : editingQuoteId ? '수정 저장' : '견적서 완성'}
              </Button>
              <p className="text-[11px] text-text-tertiary mt-2 text-center">
                {editingQuoteId
                  ? '수정 사항을 저장하고 발송이력으로 이동합니다.'
                  : '견적서를 이력에 저장합니다. 발송은 아래 이력에서 개별 실행합니다.'}
              </p>
            </Section>

            {/* ── 6. 견적서 이력 (saved_quotes) ───────────── */}
            <div ref={historyRef}>
            <Section>
              <SectionHeader title="견적서 이력">
                <span className="text-xs text-text-tertiary">
                  {selected.saved_quotes?.length ?? 0}건
                </span>
              </SectionHeader>
              {!selected.saved_quotes || selected.saved_quotes.length === 0 ? (
                <div className="py-8 text-center text-sm text-text-tertiary border border-dashed border-border-subtle rounded-xl">
                  아직 저장된 견적서가 없습니다.<br />
                  <span className="text-[11px]">위에서 '견적서 완성' 버튼을 눌러 추가하세요.</span>
                </div>
              ) : (
                <ul className="divide-y divide-border-subtle -mx-6 px-6">
                  {[...selected.saved_quotes].reverse().map((q) => {
                    const isSent = !!q.sent_at
                    const isEditingNow = editingQuoteId === q.id
                    const isSendingNow = sendingQuoteId === q.id
                    const isRegeneratingNow = regeneratingQuoteId === q.id
                    return (
                      <li key={q.id} className={`py-3 ${isEditingNow ? 'bg-amber-50/30 -mx-6 px-6' : ''}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-text-primary truncate">{q.label}</span>
                              {isSent ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 font-medium flex items-center gap-0.5">
                                  <CheckCircle2 size={10} />발송완료
                                </span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                                  미발송
                                </span>
                              )}
                              {isEditingNow && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-600 font-medium">
                                  수정 중
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-[11px] text-text-tertiary flex items-center gap-2 flex-wrap">
                              <span className="tabular-nums font-medium text-text-secondary">{fmtKr(q.total_amount)}원</span>
                              {q.quote_no && <><span>·</span><span className="tabular-nums">{q.quote_no}</span></>}
                              {q.sent_at && (
                                <><span>·</span><span>발송 {new Date(q.sent_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></>
                              )}
                              <span>·</span>
                              <span>작성 {new Date(q.created_at).toLocaleDateString('ko-KR')}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
                            {q.pdf_url && (
                              <a href={q.pdf_url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border-subtle text-text-secondary hover:bg-surface-sunken transition-colors">
                                <ExternalLink size={11} />PDF
                              </a>
                            )}
                            <button type="button" onClick={() => handleEditSavedQuote(q)}
                              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border-subtle text-text-secondary hover:bg-surface-sunken transition-colors">
                              <Pencil size={11} />수정
                            </button>
                            <button type="button"
                              onClick={() => handleRegeneratePdf(q)}
                              disabled={isRegeneratingNow}
                              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border-subtle text-text-secondary hover:bg-surface-sunken transition-colors disabled:opacity-50"
                              title="카카오·이메일 발송 없이 PDF만 새로 생성">
                              <RefreshCw size={11} className={isRegeneratingNow ? 'animate-spin' : ''} />
                              {isRegeneratingNow ? '재생성 중…' : 'PDF 재생성'}
                            </button>
                            <button type="button"
                              onClick={() => handleSendSavedQuote(q)}
                              disabled={isSendingNow}
                              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-brand-600 text-white hover:bg-brand-700 transition-colors disabled:opacity-50">
                              <Send size={11} />
                              {isSendingNow ? '발송 중…' : isSent ? '재발송' : '발송'}
                            </button>
                            <button type="button" onClick={() => handleDeleteSavedQuote(q)}
                              className="flex items-center justify-center w-6 h-6 rounded-md text-text-tertiary hover:text-state-danger hover:bg-state-danger-bg transition-colors"
                              title="삭제">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Section>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}

// ─── 헬퍼 컴포넌트 ───────────────────────────────────────────────

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-surface rounded-2xl border border-border-subtle p-4 md:p-6 ${className}`}>
      {children}
    </section>
  )
}

function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-5 gap-2 flex-wrap">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="block w-[3px] h-[14px] rounded-full bg-brand-600 flex-shrink-0" />
        <h2 className="text-sm font-semibold text-text-primary tracking-tight truncate">{title}</h2>
      </div>
      {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
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
