'use client'

import { useCallback, useEffect, useState } from 'react'
import { X, Search, Copy, FileText } from 'lucide-react'
import { Input } from '@/components/ui/Input'

interface SavedQuote {
  id: string
  label: string
  quote_items: Array<{ name: string; qty: number; unit_price: number; subtotal: number }>
  pricing_mode: 'itemized' | 'total' | 'supply'
  direct_amount: number
  discount_mode: 'none' | 'rate' | 'amount'
  discount_rate: number
  discount_input: number
  discount2_amount?: number
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

interface BrowseApp {
  id: string
  business_name: string
  owner_name: string
  phone: string | null
  service_type: string | null
  care_scope: string | null
  saved_quotes: SavedQuote[] | null
  created_at: string
}

interface Props {
  currentApplicationId: string | null
  onClose: () => void
  onPick: (quote: SavedQuote) => void
}

const fmtKr = (n: number) => n.toLocaleString('ko-KR')

export function BrowseQuotesModal({ currentApplicationId, onClose, onPick }: Props) {
  const [q, setQ] = useState('')
  const [apps, setApps] = useState<BrowseApp[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedAppId, setExpandedAppId] = useState<string | null>(null)

  const load = useCallback(async (search: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '30' })
      if (search) params.set('q', search)
      if (currentApplicationId) params.set('exclude_id', currentApplicationId)
      const res = await fetch(`/api/admin/quotes/browse?${params}`)
      const json = await res.json()
      setApps(json.applications ?? [])
    } catch {
      setApps([])
    } finally {
      setLoading(false)
    }
  }, [currentApplicationId])

  useEffect(() => {
    const t = setTimeout(() => void load(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q, load])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl shadow-modal w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
          <div>
            <h2 className="text-base font-bold text-text-primary">다른 견적서 참고</h2>
            <p className="text-[11px] text-text-tertiary mt-0.5">다른 신청서에 저장된 견적서를 골라 현재 폼에 복사합니다.</p>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary p-1">
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pt-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
            <Input
              placeholder="업체명·대표자·연락처 검색"
              value={q}
              onChange={e => setQ(e.target.value)}
              className="pl-8"
              autoFocus
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="py-16 text-center text-sm text-text-tertiary">불러오는 중…</div>
          ) : apps.length === 0 ? (
            <div className="py-16 text-center text-sm text-text-tertiary">
              <FileText size={28} className="mx-auto opacity-30 mb-2" />
              {q ? '검색 결과 없음' : '저장된 견적서가 있는 신청서가 없습니다.'}
            </div>
          ) : (
            <ul className="space-y-2">
              {apps.map(app => {
                const isExpanded = expandedAppId === app.id
                const quotesCount = app.saved_quotes?.length ?? 0
                return (
                  <li key={app.id} className="rounded-xl border border-border-subtle overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedAppId(isExpanded ? null : app.id)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-surface-sunken transition-colors text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-text-primary truncate">{app.business_name}</span>
                          {app.service_type && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-sunken text-text-tertiary">
                              {app.service_type}
                            </span>
                          )}
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-600 font-medium">
                            견적서 {quotesCount}건
                          </span>
                        </div>
                        <p className="text-[11px] text-text-tertiary mt-0.5">
                          {app.owner_name}{app.phone ? ` · ${app.phone}` : ''}
                        </p>
                      </div>
                      <span className="text-xs text-text-tertiary flex-shrink-0">
                        {isExpanded ? '접기' : '펼치기'}
                      </span>
                    </button>
                    {isExpanded && quotesCount > 0 && (
                      <ul className="border-t border-border-subtle divide-y divide-border-subtle bg-surface-sunken/30">
                        {app.saved_quotes!.map(quote => (
                          <li key={quote.id} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-surface-sunken transition-colors">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-text-primary truncate">{quote.label}</p>
                              <div className="text-[10px] text-text-tertiary flex items-center gap-1.5 flex-wrap mt-0.5">
                                <span className="tabular-nums">{fmtKr(quote.total_amount)}원</span>
                                <span>·</span>
                                <span>{quote.pricing_mode === 'itemized' ? '항목별' : quote.pricing_mode === 'total' ? '합계기준' : '공급가기준'}</span>
                                {quote.quote_items?.length > 0 && <><span>·</span><span>{quote.quote_items.length}개 항목</span></>}
                                {quote.sent_at && <><span>·</span><span className="text-state-success">발송됨</span></>}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => onPick(quote)}
                              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-brand-600 text-white hover:bg-brand-700 shrink-0"
                            >
                              <Copy size={11} />복사
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
