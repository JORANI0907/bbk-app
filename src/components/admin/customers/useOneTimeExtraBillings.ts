'use client'

/**
 * 1회성케어 추가 결제 목록·모달 공용 훅 (2026-11-08)
 *
 * 금액정보 섹션과 진행 흐름 섹션이 같은 데이터를 보여 주므로 한 곳에서 불러오고,
 * 어느 쪽에서 만들거나 고쳐도 window 이벤트로 다른 쪽이 바로 다시 읽는다.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import type { BillingDetailData } from './BillingDetailModal'

export interface ExtraBillingRow {
  id: string
  billing_type: string | null
  service_type: string | null
  billing_period: string
  amount: number
  due_date: string
  paid_date: string | null
  status: 'pending' | 'paid' | 'overdue'
  notes: string | null
  tax_invoice_issued: boolean | null
  payment_url: string | null
  payment_sent_at: string | null
  send_attempts: number | null
}

export interface NoticeResult {
  ok: boolean
  message?: string
  channel?: string
  paymentUrl?: string | null
}

const CHANGED_EVENT = 'bbk:extra-billings-changed'

export const todayKst = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
export const fmtKrw = (n: number) => n.toLocaleString('ko-KR')
export const fmtDot = (d: string | null | undefined) => (d ? d.slice(0, 10).replace(/-/g, '.') : '')

export async function readApiError(res: Response, fallback: string): Promise<string> {
  const err = await res.json().catch(() => ({})) as { error?: string }
  return err.error ?? fallback
}

/** 다른 섹션에도 "바뀌었다"고 알린다 */
export function broadcastExtraBillingsChanged(customerId: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: { customerId } }))
}

export function useOneTimeExtraBillings(customerId: string) {
  const [rows, setRows] = useState<ExtraBillingRow[]>([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/billings?customer_id=${encodeURIComponent(customerId)}`)
      if (!res.ok) throw new Error(await readApiError(res, '추가 결제 조회 실패'))
      const data = await res.json() as { billings?: ExtraBillingRow[] }
      const list = (data.billings ?? []).filter(b => b.billing_type === 'onetime' && b.service_type === '1회성케어')
      setRows([...list].sort((a, b) => (a.billing_period < b.billing_period ? 1 : -1)))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '추가 결제 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => { void reload() }, [reload])

  useEffect(() => {
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ customerId?: string }>).detail
      if (!detail?.customerId || detail.customerId === customerId) void reload()
    }
    window.addEventListener(CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(CHANGED_EVENT, onChanged)
  }, [customerId, reload])

  const sums = useMemo(() => ({
    total: rows.reduce((s, r) => s + Number(r.amount ?? 0), 0),
    paid: rows.filter(r => r.status === 'paid').reduce((s, r) => s + Number(r.amount ?? 0), 0),
    pending: rows.filter(r => r.status !== 'paid').reduce((s, r) => s + Number(r.amount ?? 0), 0),
  }), [rows])

  return { rows, loading, reload, sums }
}

export function toExtraModalData(row: ExtraBillingRow): BillingDetailData {
  return {
    id: row.id, billingType: 'onetime', billingPeriod: row.billing_period, amount: row.amount,
    dueDate: row.due_date, paidDate: row.paid_date ?? undefined, status: row.status,
    taxInvoiceIssued: row.tax_invoice_issued ?? false, paymentUrl: row.payment_url ?? undefined,
    notes: row.notes ?? '',
  }
}

export function newExtraModalData(): BillingDetailData {
  const today = todayKst()
  return { id: '', billingType: 'onetime', billingPeriod: today, amount: 0, dueDate: today, status: 'pending', taxInvoiceIssued: false, notes: '' }
}

function showNoticeToast(notice: NoticeResult | null | undefined) {
  if (!notice) { toast.success('추가 결제를 등록했습니다'); return }
  if (notice.ok) {
    toast.success(`추가 결제 등록 · 안내 문자(${notice.channel ?? 'SMS'}) 발송 완료`)
    return
  }
  toast('등록은 됐지만 문자는 못 보냈습니다: ' + (notice.message ?? '원인 미상'), { icon: '⚠️', duration: 8000 })
}

/** 청구서 모달의 생성·저장·삭제 처리 — 끝나면 모든 섹션에 변경을 알린다 */
export function useExtraBillingActions(customerId: string) {
  const notify = () => broadcastExtraBillingsChanged(customerId)

  const create = async (payload: Omit<BillingDetailData, 'id'>) => {
    if (!payload.notes?.trim()) throw new Error('내용을 입력해 주세요 (고객 문자에 들어갑니다)')
    if (!(payload.amount > 0)) throw new Error('금액을 입력해 주세요')
    const res = await fetch('/api/admin/billings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: customerId, billing_type: 'onetime', service_type: '1회성케어',
        billing_period: payload.billingPeriod, amount: payload.amount, due_date: payload.dueDate,
        notes: payload.notes.trim(), auto_notify: true,
      }),
    })
    if (!res.ok) throw new Error(await readApiError(res, '추가 실패'))
    const data = await res.json() as { notice?: NoticeResult | null }
    showNoticeToast(data.notice)
    notify()
  }

  const save = async (id: string, patch: Record<string, unknown>) => {
    const res = await fetch('/api/admin/billings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }),
    })
    if (!res.ok) throw new Error(await readApiError(res, '저장 실패'))
    notify()
  }

  const remove = async (id: string) => {
    const res = await fetch(`/api/admin/billings?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await readApiError(res, '삭제 실패'))
    notify()
  }

  return { create, save, remove }
}
