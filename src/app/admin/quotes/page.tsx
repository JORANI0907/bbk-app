'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { requestGoogleTokenWithScopes } from '@/lib/googleDrive'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Plus, X, FileText, ExternalLink } from 'lucide-react'

// ─── 타입 ────────────────────────────────────────────────────────

interface QuoteItem {
  name: string
  qty: number
  unit_price: number
  subtotal: number
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
  created_at: string
  status: string
  notification_log: Array<{ type: string; sent_at: string; method?: string }> | null
}

// ─── 유틸 ────────────────────────────────────────────────────────

function fmtKr(n: number): string {
  return n.toLocaleString('ko-KR')
}

function fmtDate(dateStr: string): string {
  return dateStr.slice(0, 10)
}

// ─── 컴포넌트 ────────────────────────────────────────────────────

export default function QuotesPage() {
  const supabase = createClient()

  const [applications, setApplications] = useState<ApplicationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([])
  const [sending, setSending] = useState(false)

  const selected = applications.find(a => a.id === selectedId) ?? null

  // ─── 데이터 로딩 ─────────────────────────────────────────────
  const loadApplications = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('service_applications')
      .select('id, owner_name, business_name, phone, email, address, construction_date, last_quote_no, last_quote_pdf_url, quote_items, created_at, status, notification_log')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      toast.error('목록 로딩 실패')
    } else {
      setApplications((data as ApplicationRow[]) || [])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadApplications()
  }, [loadApplications])

  // ─── 항목 선택 시 quote_items 초기화 ─────────────────────────
  const handleSelect = useCallback((app: ApplicationRow) => {
    setSelectedId(app.id)
    if (app.quote_items && app.quote_items.length > 0) {
      setQuoteItems(app.quote_items.map(item => ({ ...item })))
    } else {
      setQuoteItems([])
    }
  }, [])

  // ─── 검색 필터 ───────────────────────────────────────────────
  const filtered = applications.filter(a => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return (
      a.owner_name.toLowerCase().includes(q) ||
      (a.business_name || '').toLowerCase().includes(q) ||
      (a.phone || '').includes(q)
    )
  })

  // ─── 견적 항목 편집 함수 ─────────────────────────────────────
  const addItem = () => {
    setQuoteItems(prev => [...prev, { name: '', qty: 1, unit_price: 0, subtotal: 0 }])
  }

  const removeItem = (idx: number) => {
    setQuoteItems(prev => prev.filter((_, i) => i !== idx))
  }

  const updateItem = (idx: number, field: keyof QuoteItem, value: string | number) => {
    setQuoteItems(prev => {
      const next = prev.map((item, i) => {
        if (i !== idx) return item
        const updated = { ...item, [field]: value }
        if (field === 'qty' || field === 'unit_price') {
          const qty = field === 'qty' ? Number(value) : item.qty
          const unitPrice = field === 'unit_price' ? Number(value) : item.unit_price
          updated.subtotal = qty * unitPrice
        }
        return updated
      })
      return next
    })
  }

  // ─── 금액 계산 ────────────────────────────────────────────────
  const supplyAmount = quoteItems.reduce((sum, item) => sum + item.subtotal, 0)
  const vatAmount = Math.round(supplyAmount * 0.1)
  const totalAmount = supplyAmount + vatAmount

  // ─── 유효성 검사 ─────────────────────────────────────────────
  const validate = (): string | null => {
    if (!selected) return '신청서를 선택해 주세요.'
    if (!selected.owner_name?.trim()) return '고객명이 없습니다.'
    if (!selected.phone?.trim()) return '연락처가 없습니다.'
    if (!selected.address?.trim()) return '주소가 없습니다.'
    if (quoteItems.length === 0) return '견적 항목을 1개 이상 추가해 주세요.'
    const emptyItem = quoteItems.find(item => !item.name.trim())
    if (emptyItem) return '항목명이 비어있는 견적 항목이 있습니다.'
    return null
  }

  // ─── 견적서 발송 ─────────────────────────────────────────────
  const handleSend = async () => {
    const validationError = validate()
    if (validationError) {
      toast.error(validationError)
      return
    }
    if (!selected) return

    setSending(true)
    try {
      const token = await requestGoogleTokenWithScopes()

      const res = await fetch(`/api/admin/quotes/${selected.id}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          owner_name: selected.owner_name,
          business_name: selected.business_name,
          phone: selected.phone,
          email: selected.email || '',
          address: selected.address,
          construction_date: selected.construction_date || '',
          quote_items: quoteItems,
          supply_amount: supplyAmount,
          vat: vatAmount,
          total_amount: totalAmount,
        }),
      })

      const result = await res.json()
      if (result.success) {
        toast.success(`견적서 발송 완료 (${result.quote_no})`)
        await loadApplications()
      } else {
        const errMsg = result.errors ? Object.values(result.errors).join(', ') : '발송 실패'
        toast.error(`일부 오류: ${errMsg}`)
        await loadApplications()
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
      <div className="w-80 flex-shrink-0 flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary leading-tight">견적관리</h1>
          <p className="text-sm text-text-tertiary mt-1">신청서를 선택하여 견적서를 발송하세요.</p>
        </div>

        <Input
          placeholder="고객명·업체명·연락처 검색"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="flex-1 overflow-y-auto rounded-2xl border border-border shadow-soft bg-surface">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-sm text-text-tertiary">
              로딩 중...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-text-tertiary">
              검색 결과 없음
            </div>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {filtered.map(app => {
                const isSent = !!app.last_quote_no
                const isActive = selectedId === app.id
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
                        <span className="font-medium text-sm text-text-primary truncate">
                          {app.owner_name}
                        </span>
                        <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                          isSent
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {isSent ? '발송완료' : '미발송'}
                        </span>
                      </div>
                      <div className="text-xs text-text-secondary mt-0.5 truncate">
                        {app.business_name || '-'}
                      </div>
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

            {/* 1. 고객 기본정보 */}
            <section className="bg-surface rounded-2xl shadow-soft p-6">
              <h2 className="text-lg font-semibold text-text-primary leading-snug mb-4">고객 기본정보</h2>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <InfoRow label="고객명" value={selected.owner_name} />
                <InfoRow label="업체명" value={selected.business_name} />
                <InfoRow label="연락처" value={selected.phone} />
                <InfoRow label="이메일" value={selected.email || '-'} />
                <InfoRow label="시공일자" value={selected.construction_date || '-'} />
                <InfoRow label="상태" value={selected.status} />
                <div className="col-span-2">
                  <InfoRow label="주소" value={selected.address} />
                </div>
              </div>
            </section>

            {/* 2. 견적 항목 테이블 */}
            <section className="bg-surface rounded-2xl shadow-soft p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text-primary leading-snug">견적 항목</h2>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={addItem}
                  className="flex items-center gap-1"
                >
                  <Plus size={14} />
                  항목 추가
                </Button>
              </div>

              {quoteItems.length === 0 ? (
                <p className="text-sm text-text-tertiary py-4 text-center">
                  항목 추가 버튼을 눌러 견적 항목을 입력하세요.
                </p>
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
                            <Input
                              value={item.name}
                              onChange={e => updateItem(idx, 'name', e.target.value)}
                              placeholder="항목명"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <Input
                              type="number"
                              value={item.qty}
                              onChange={e => updateItem(idx, 'qty', Number(e.target.value))}
                              className="text-right"
                              min={1}
                            />
                          </td>
                          <td className="py-2 px-3">
                            <Input
                              type="number"
                              value={item.unit_price}
                              onChange={e => updateItem(idx, 'unit_price', Number(e.target.value))}
                              className="text-right"
                              min={0}
                            />
                          </td>
                          <td className="py-2 px-3 text-right text-text-primary font-medium tabular-nums">
                            {fmtKr(item.subtotal)}원
                          </td>
                          <td className="py-2 pl-1">
                            <button
                              type="button"
                              onClick={() => removeItem(idx)}
                              className="p-1 rounded text-text-tertiary hover:text-state-danger hover:bg-state-danger-bg transition-colors"
                            >
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

            {/* 3. 금액 요약 */}
            <section className="bg-surface rounded-2xl shadow-soft p-6">
              <h2 className="text-lg font-semibold text-text-primary leading-snug mb-4">금액 요약</h2>
              <div className="space-y-2 text-sm">
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
            </section>

            {/* 4. 견적서 보내기 버튼 */}
            <section className="bg-surface rounded-2xl shadow-soft p-6">
              <Button
                onClick={handleSend}
                disabled={sending}
                className="w-full"
                size="lg"
              >
                {sending ? '발송 중...' : '견적서 보내기'}
              </Button>
              <p className="text-xs text-text-tertiary mt-2 text-center">
                Google Drive PDF 생성 → 이메일 발송 → 카카오 알림톡 발송
              </p>
            </section>

            {/* 5. 발송 이력 */}
            {selected.last_quote_no && (
              <section className="bg-surface rounded-2xl shadow-soft p-6">
                <h2 className="text-lg font-semibold text-text-primary leading-snug mb-3">발송 이력</h2>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-text-secondary">
                      최근 발송 번호:{' '}
                      <span className="font-medium text-text-primary">{selected.last_quote_no}</span>
                    </p>
                  </div>
                  {selected.last_quote_pdf_url && (
                    <a
                      href={selected.last_quote_pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"
                    >
                      <ExternalLink size={14} />
                      PDF 보기
                    </a>
                  )}
                </div>
              </section>
            )}

          </div>
        )}
      </div>
    </div>
  )
}

// ─── 헬퍼 컴포넌트 ────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-text-tertiary">{label}</span>
      <p className="text-text-primary font-medium mt-0.5 break-keep">{value || '-'}</p>
    </div>
  )
}
