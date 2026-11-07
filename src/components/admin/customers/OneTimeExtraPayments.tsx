'use client'

/**
 * 1회성케어 "추가 결제" 묶음 (2026-11-08)
 *
 * 위치: 고객관리 세부창 진행 흐름 — 잔금결제 뒤, 세금계산서발행 앞.
 * 예약금·잔금 외에 따로 받을 돈(추가 작업비 등)을 service_billings(onetime · 1회성케어) 행으로 만든다.
 *   - "+ 결제 추가" → 청구서 모달(내용·금액·기한) → 저장하면 결제 링크 발급 + 안내 문자 자동 발송
 *   - 행 클릭 → 같은 모달에서 금액·상태·링크·결제 ID 초기화·삭제
 *   - 문자 다시 보내기 / 링크 복사 버튼
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Check, Clock, AlertCircle, Copy, MessageSquare, Plus, ChevronDown } from 'lucide-react'
import { BillingDetailModal, type BillingDetailData } from './BillingDetailModal'

interface ExtraBillingRow {
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

interface NoticeResult {
  ok: boolean
  message?: string
  channel?: string
  paymentUrl?: string | null
}

interface Props {
  customerId: string
  /** 진행 흐름 자물쇠 상태 — 잠겨 있으면 추가·수정 버튼을 막는다 */
  locked: boolean
}

const STATUS_STYLE: Record<ExtraBillingRow['status'], { label: string; badge: string; icon: JSX.Element }> = {
  paid:    { label: '결제완료', badge: 'bg-teal-50 text-teal-600 border-teal-200',   icon: <Check size={11} /> },
  pending: { label: '미결제',   badge: 'bg-amber-50 text-amber-600 border-amber-200', icon: <Clock size={11} /> },
  overdue: { label: '지연',     badge: 'bg-rose-50 text-rose-600 border-rose-200',    icon: <AlertCircle size={11} /> },
}

const todayKst = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
const fmtKrw = (n: number) => n.toLocaleString('ko-KR')
const fmtDot = (d: string | null | undefined) => (d ? d.slice(0, 10).replace(/-/g, '.') : '')

function toModalData(row: ExtraBillingRow): BillingDetailData {
  return {
    id: row.id, billingType: 'onetime', billingPeriod: row.billing_period, amount: row.amount,
    dueDate: row.due_date, paidDate: row.paid_date ?? undefined, status: row.status,
    taxInvoiceIssued: row.tax_invoice_issued ?? false, paymentUrl: row.payment_url ?? undefined,
    notes: row.notes ?? '',
  }
}

function newModalData(): BillingDetailData {
  const today = todayKst()
  return { id: '', billingType: 'onetime', billingPeriod: today, amount: 0, dueDate: today, status: 'pending', taxInvoiceIssued: false, notes: '' }
}

async function readError(res: Response, fallback: string): Promise<string> {
  const err = await res.json().catch(() => ({})) as { error?: string }
  return err.error ?? fallback
}

export function OneTimeExtraPayments({ customerId, locked }: Props) {
  const [rows, setRows] = useState<ExtraBillingRow[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(true)
  const [modal, setModal] = useState<BillingDetailData | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/billings?customer_id=${encodeURIComponent(customerId)}`)
      if (!res.ok) throw new Error(await readError(res, '추가 결제 조회 실패'))
      const data = await res.json() as { billings?: ExtraBillingRow[] }
      const list = (data.billings ?? []).filter(b => b.billing_type === 'onetime' && b.service_type === '1회성케어')
      setRows([...list].sort((a, b) => (a.billing_period < b.billing_period ? 1 : -1)))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '추가 결제 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => { void load() }, [load])

  const sums = useMemo(() => ({
    total: rows.reduce((s, r) => s + Number(r.amount ?? 0), 0),
    pending: rows.filter(r => r.status !== 'paid').reduce((s, r) => s + Number(r.amount ?? 0), 0),
  }), [rows])

  const guardLocked = () => {
    if (!locked) return false
    toast.error('자물쇠 아이콘을 눌러 편집 모드로 전환하세요')
    return true
  }

  const handleCreate = async (payload: Omit<BillingDetailData, 'id'>) => {
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
    if (!res.ok) throw new Error(await readError(res, '추가 실패'))
    const data = await res.json() as { notice?: NoticeResult | null }
    showNoticeToast(data.notice)
    await load()
  }

  const handleSave = async (id: string, patch: Record<string, unknown>) => {
    const res = await fetch('/api/admin/billings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }),
    })
    if (!res.ok) throw new Error(await readError(res, '저장 실패'))
    await load()
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/admin/billings?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await readError(res, '삭제 실패'))
    await load()
  }

  const handleResend = async (row: ExtraBillingRow) => {
    if (guardLocked()) return
    if (!confirm(`"${row.notes ?? '추가 결제'}" ${fmtKrw(row.amount)}원 안내 문자를 고객에게 보낼까요?`)) return
    setSendingId(row.id)
    try {
      const res = await fetch('/api/admin/billings/extra-notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ billing_id: row.id }),
      })
      const data = await res.json().catch(() => ({})) as NoticeResult & { error?: string }
      if (!res.ok) throw new Error(data.error ?? '문자 발송 실패')
      toast.success(`안내 문자(${data.channel ?? 'SMS'})를 보냈습니다`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '문자 발송 실패')
    } finally {
      setSendingId(null)
    }
  }

  const handleCopy = async (row: ExtraBillingRow) => {
    if (!row.payment_url) return
    try {
      await navigator.clipboard.writeText(row.payment_url)
      setCopiedId(row.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch { toast.error('복사 실패 — 모달에서 직접 복사해 주세요') }
  }

  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full border-2 border-dashed border-gray-300 bg-white flex items-center justify-center flex-shrink-0 text-gray-400">
        <Plus size={12} />
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <span className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-xs font-semibold text-gray-700">추가 결제</span>
            <span className="text-[10px] text-gray-400">
              {loading ? '불러오는 중…' : rows.length === 0 ? '없음' : `${rows.length}건 · 합계 ${fmtKrw(sums.total)}원${sums.pending > 0 ? ` · 미결제 ${fmtKrw(sums.pending)}원` : ''}`}
            </span>
          </span>
          <ChevronDown size={14} className={`shrink-0 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="space-y-1">
            {rows.map(row => (
              <ExtraRow
                key={row.id}
                row={row}
                copied={copiedId === row.id}
                sending={sendingId === row.id}
                onOpen={() => { if (!guardLocked()) setModal(toModalData(row)) }}
                onCopy={() => handleCopy(row)}
                onResend={() => handleResend(row)}
              />
            ))}
            <button
              type="button"
              onClick={() => { if (!guardLocked()) setModal(newModalData()) }}
              className="w-full py-1.5 text-[10px] font-semibold text-brand-700 border border-dashed border-brand-200 bg-brand-50/40 rounded-lg hover:bg-brand-50 transition-colors"
            >
              + 결제 추가 (저장하면 결제 링크와 안내 문자가 자동 발송됩니다)
            </button>
          </div>
        )}
      </div>

      <BillingDetailModal
        open={modal !== null}
        onClose={() => setModal(null)}
        data={modal}
        onCreate={handleCreate}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  )
}

function showNoticeToast(notice: NoticeResult | null | undefined) {
  if (!notice) { toast.success('추가 결제를 등록했습니다'); return }
  if (notice.ok) {
    toast.success(`추가 결제 등록 · 안내 문자(${notice.channel ?? 'SMS'}) 발송 완료`)
    return
  }
  toast('등록은 됐지만 문자는 못 보냈습니다: ' + (notice.message ?? '원인 미상'), { icon: '⚠️', duration: 8000 })
}

function ExtraRow({ row, copied, sending, onOpen, onCopy, onResend }: {
  row: ExtraBillingRow
  copied: boolean
  sending: boolean
  onOpen: () => void
  onCopy: () => void
  onResend: () => void
}) {
  const st = STATUS_STYLE[row.status] ?? STATUS_STYLE.pending
  return (
    <div className="flex items-stretch gap-1">
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 rounded-xl border border-gray-100 hover:bg-white hover:border-brand-200 transition-colors text-left"
      >
        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full border ${st.badge}`}>{st.icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-xs font-medium text-gray-800 truncate">{row.notes || '추가 결제'}</span>
          <span className="block text-[10px] text-gray-400">
            {fmtDot(row.billing_period)}{row.paid_date ? ` · ${fmtDot(row.paid_date)} 완료` : row.payment_sent_at ? ` · 문자 ${fmtDot(row.payment_sent_at)}` : ''}
          </span>
        </span>
        <span className="text-xs font-bold text-gray-800 shrink-0">{fmtKrw(Number(row.amount ?? 0))}원</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium shrink-0 ${st.badge}`}>{st.label}</span>
      </button>
      {row.status !== 'paid' && (
        <>
          <button
            type="button"
            onClick={onResend}
            disabled={sending}
            title="안내 문자 다시 보내기"
            className="shrink-0 w-8 flex items-center justify-center rounded-xl border border-gray-100 bg-gray-50 text-gray-400 hover:bg-brand-50 hover:border-brand-200 hover:text-brand-600 disabled:opacity-50 transition-colors"
          >
            <MessageSquare size={13} />
          </button>
          {row.payment_url && (
            <button
              type="button"
              onClick={onCopy}
              title="결제 링크 복사"
              className={`shrink-0 w-8 flex items-center justify-center rounded-xl border transition-colors ${copied ? 'bg-teal-50 border-teal-200 text-teal-600' : 'bg-gray-50 border-gray-100 text-gray-400 hover:bg-white hover:border-gray-300'}`}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          )}
        </>
      )}
    </div>
  )
}
