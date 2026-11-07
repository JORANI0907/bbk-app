'use client'

/**
 * 1회성케어 "추가 결제" (2026-11-08)
 *
 * 두 군데에 보인다 (데이터는 useOneTimeExtraBillings 로 공유):
 *   - OneTimeExtraAmountPanel : 금액정보 섹션 — 총액 아래 추가 결제 목록·합계·총 청구액 + "+ 추가 결제" 버튼
 *   - OneTimeExtraPayments    : 진행 흐름 섹션 — 잔금결제 뒤·세금계산서발행 앞. 상태·문자 재발송·링크 복사
 * 예약금·잔금 외에 따로 받을 돈(추가 작업비 등)을 service_billings(onetime · 1회성케어) 행으로 만들고,
 * 저장하면 결제 링크 발급 + 안내 문자가 자동으로 나간다.
 */

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Check, Clock, AlertCircle, Copy, MessageSquare, Plus, ChevronDown } from 'lucide-react'
import { BillingDetailModal, type BillingDetailData } from './BillingDetailModal'
import {
  useOneTimeExtraBillings, useExtraBillingActions, toExtraModalData, newExtraModalData,
  fmtKrw, fmtDot, type ExtraBillingRow,
} from './useOneTimeExtraBillings'

const STATUS_STYLE: Record<ExtraBillingRow['status'], { label: string; badge: string; icon: JSX.Element }> = {
  paid:    { label: '결제완료', badge: 'bg-teal-50 text-teal-600 border-teal-200',   icon: <Check size={11} /> },
  pending: { label: '미결제',   badge: 'bg-amber-50 text-amber-600 border-amber-200', icon: <Clock size={11} /> },
  overdue: { label: '지연',     badge: 'bg-rose-50 text-rose-600 border-rose-200',    icon: <AlertCircle size={11} /> },
}

// ─── 금액정보 섹션용 ────────────────────────────────────────────────
interface AmountPanelProps {
  customerId: string
  /** 공급가액 + 부가세 (금액정보 총액) — 추가 결제를 더한 총 청구액 계산용 */
  baseTotal: number
}

export function OneTimeExtraAmountPanel({ customerId, baseTotal }: AmountPanelProps) {
  const { rows, loading, sums } = useOneTimeExtraBillings(customerId)
  const actions = useExtraBillingActions(customerId)
  const [modal, setModal] = useState<BillingDetailData | null>(null)

  const hasExtra = sums.total > 0

  return (
    <div className="pt-1 border-t border-border-subtle flex flex-col gap-2">
      {/* 총액 — 기존 "공급가액 + 부가세" 총액을 대체. 추가 결제가 있으면 그만큼 더한 금액이 총액이다 */}
      <div className="flex justify-between items-center text-xs">
        <span className="text-text-secondary">총액 (공급가액 + 부가세{hasExtra ? ' + 추가 결제' : ''})</span>
        <span className="font-bold text-text-primary">{fmtKrw(baseTotal + sums.total)}원</span>
      </div>
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border-subtle">
        <span className="text-xs font-semibold text-text-primary">추가 결제 {rows.length > 0 && <span className="text-text-tertiary font-normal">({rows.length}건)</span>}</span>
        <button
          type="button"
          onClick={() => setModal(newExtraModalData())}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-green-200 bg-green-50 text-green-800 hover:bg-green-100 transition-colors"
        >
          <Plus size={12} /> 추가 결제
        </button>
      </div>
      {loading && rows.length === 0 && <p className="text-xs text-text-tertiary">불러오는 중…</p>}
      {!loading && rows.length === 0 && (
        <p className="text-xs text-text-tertiary break-keep">예약금·잔금 외에 더 받을 금액이 있으면 여기서 만드세요. 저장하면 결제 링크와 안내 문자가 자동으로 나갑니다.</p>
      )}
      {rows.map(row => {
        const st = STATUS_STYLE[row.status] ?? STATUS_STYLE.pending
        return (
          <button
            key={row.id}
            type="button"
            onClick={() => setModal(toExtraModalData(row))}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border-subtle bg-surface-sunken hover:bg-white hover:border-green-200 transition-colors text-left"
          >
            <span className="flex-1 min-w-0">
              <span className="block text-xs text-text-primary truncate">{row.notes || '추가 결제'}</span>
              <span className="block text-xs text-text-tertiary">{fmtDot(row.billing_period)}</span>
            </span>
            <span className="text-xs font-semibold text-text-primary shrink-0">{fmtKrw(Number(row.amount ?? 0))}원</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${st.badge}`}>{st.label}</span>
          </button>
        )
      })}
      {rows.length > 0 && (
        <div className="flex justify-between items-center text-xs">
          <span className="text-text-secondary">추가 결제 합계{sums.pending > 0 && <span className="text-amber-600"> · 미결제 {fmtKrw(sums.pending)}원</span>}</span>
          <span className="font-semibold text-text-primary">{fmtKrw(sums.total)}원</span>
        </div>
      )}
      <BillingDetailModal
        open={modal !== null}
        onClose={() => setModal(null)}
        data={modal}
        onCreate={actions.create}
        onSave={actions.save}
        onDelete={actions.remove}
      />
    </div>
  )
}

// ─── 진행 흐름 섹션용 ──────────────────────────────────────────────
interface FlowProps {
  customerId: string
  /** 진행 흐름 자물쇠 상태 — 잠겨 있으면 추가·수정 버튼을 막는다 */
  locked: boolean
}

export function OneTimeExtraPayments({ customerId, locked }: FlowProps) {
  const { rows, loading, sums, reload } = useOneTimeExtraBillings(customerId)
  const actions = useExtraBillingActions(customerId)
  const [open, setOpen] = useState(true)
  const [modal, setModal] = useState<BillingDetailData | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)

  const guardLocked = () => {
    if (!locked) return false
    toast.error('자물쇠 아이콘을 눌러 편집 모드로 전환하세요')
    return true
  }

  const handleResend = async (row: ExtraBillingRow) => {
    if (guardLocked()) return
    if (!confirm(`"${row.notes ?? '추가 결제'}" ${fmtKrw(row.amount)}원 안내 문자를 고객에게 보낼까요?`)) return
    setSendingId(row.id)
    try {
      const res = await fetch('/api/admin/billings/extra-notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ billing_id: row.id }),
      })
      const data = await res.json().catch(() => ({})) as { channel?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? '문자 발송 실패')
      toast.success(`안내 문자(${data.channel ?? 'SMS'})를 보냈습니다`)
      await reload()
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

  const summary = loading && rows.length === 0
    ? '불러오는 중…'
    : rows.length === 0
      ? '없음'
      : `${rows.length}건 · 합계 ${fmtKrw(sums.total)}원${sums.pending > 0 ? ` · 미결제 ${fmtKrw(sums.pending)}원` : ''}`

  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full border-2 border-dashed border-gray-300 bg-white flex items-center justify-center flex-shrink-0 text-gray-400">
        <Plus size={12} />
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <button type="button" onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between gap-2 text-left">
          <span className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-xs font-semibold text-gray-700">추가 결제</span>
            <span className="text-[10px] text-gray-400">{summary}</span>
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
                onOpen={() => { if (!guardLocked()) setModal(toExtraModalData(row)) }}
                onCopy={() => handleCopy(row)}
                onResend={() => handleResend(row)}
              />
            ))}
            <button
              type="button"
              onClick={() => { if (!guardLocked()) setModal(newExtraModalData()) }}
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
        onCreate={actions.create}
        onSave={actions.save}
        onDelete={actions.remove}
      />
    </div>
  )
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
