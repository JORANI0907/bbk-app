'use client'

/**
 * 결제 세부 편집 모달 (2026-10-17 Phase E)
 *
 * 설계 배경:
 * - 결제 1건(service_billings 1행)을 집중 편집하는 전용 모달.
 * - 레거시 BillingHistoryPanel 의 액션들(결제완료 처리·세금계산서 발행·금액/기한 수정·삭제)을
 *   VisitDetailModal 과 동일한 모달 톤으로 통합.
 * - PATCH /api/admin/billings 재사용 (기존 API 그대로).
 */

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { X, Save, Trash2, Check, FileCheck, Copy, Link as LinkIcon, Zap } from 'lucide-react'

export interface BillingDetailData {
  id: string
  billingType: string       // 'monthly' | 'annual' | 'onetime'
  billingPeriod: string     // '2026-11' or '2026'
  amount: number
  dueDate: string
  paidDate?: string
  status: 'pending' | 'paid' | 'overdue'
  taxInvoiceIssued: boolean
  // Phase H.5-rev: 결제 링크 (Phase H.1 자동 생성 전엔 비어있을 수 있음)
  paymentUrl?: string
}

interface Props {
  open: boolean
  onClose: () => void
  data: BillingDetailData | null
  onSave?: (id: string, patch: Record<string, unknown>) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  /** Phase H.5: 신규 생성 모드. data.id === '' 이면 자동으로 신규 모드 작동. */
  onCreate?: (data: Omit<BillingDetailData, 'id'>) => Promise<void>
}

const STATUS_OPTIONS = ['pending', 'paid', 'overdue'] as const
const STATUS_LABEL: Record<typeof STATUS_OPTIONS[number], string> = {
  pending: '대기', paid: '완료', overdue: '지연',
}
const TYPE_LABEL: Record<string, string> = {
  monthly: '월간', annual: '연간', onetime: '추가',
}
const todayIso = () => new Date().toISOString().slice(0, 10)

export function BillingDetailModal({ open, onClose, data, onSave, onDelete, onCreate }: Props) {
  const isCreateMode = data?.id === ''
  const [copied, setCopied] = useState(false)
  const [generatingLink, setGeneratingLink] = useState(false)
  const [form, setForm] = useState<BillingDetailData | null>(data)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setForm(data) }, [data])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose, saving])

  if (!open || !form) return null

  const update = (patch: Partial<BillingDetailData>) =>
    setForm(prev => prev ? { ...prev, ...patch } : prev)

  const handleSave = async () => {
    if (!form) return
    setSaving(true)
    try {
      if (isCreateMode) {
        if (!onCreate) {
          toast.error('생성 콜백이 없습니다.')
          return
        }
        await onCreate({
          billingType: form.billingType,
          billingPeriod: form.billingPeriod,
          amount: form.amount,
          dueDate: form.dueDate,
          paidDate: form.paidDate,
          status: form.status,
          taxInvoiceIssued: form.taxInvoiceIssued,
        })
        toast.success('추가되었습니다')
      } else {
        if (!onSave) {
          toast.success('저장되었습니다 (프리뷰 모드)')
          onClose()
          return
        }
        await onSave(form.id, {
          amount: form.amount,
          due_date: form.dueDate,
          paid_date: form.paidDate || null,
          status: form.status,
          tax_invoice_issued: form.taxInvoiceIssued,
          tax_invoice_issued_date: form.taxInvoiceIssued
            ? (form.paidDate || todayIso())
            : null,
          payment_url: form.paymentUrl || null,
        })
        toast.success('저장되었습니다')
      }
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleMarkPaid = () => update({ status: 'paid', paidDate: todayIso() })
  const handleMarkPending = () => update({ status: 'pending', paidDate: undefined })

  const handleCopyLink = async () => {
    if (!form?.paymentUrl) return
    try {
      await navigator.clipboard.writeText(form.paymentUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('복사 실패 — 수동으로 복사해주세요')
    }
  }

  // Phase H.1: PortOne 결제링크 자동 생성
  const handleAutoGenerate = async () => {
    if (!form || isCreateMode) return
    if (form.paymentUrl && !confirm('기존 링크를 새 링크로 교체합니다. 계속하시겠습니까?')) return
    setGeneratingLink(true)
    try {
      const res = await fetch('/api/portone/issue-billing-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingId: form.id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? '링크 생성 실패')
      }
      const resData = await res.json() as { paymentUrl?: string }
      if (resData.paymentUrl) {
        update({ paymentUrl: resData.paymentUrl })
        toast.success('결제 링크가 생성되었습니다. 저장을 눌러 반영하세요.')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '링크 생성 실패')
    } finally {
      setGeneratingLink(false)
    }
  }

  const handleDelete = async () => {
    if (!form || !onDelete) return
    if (!confirm('이 청구 내역을 삭제하시겠습니까? 재무관리 매출에서도 제외됩니다.')) return
    setSaving(true)
    try {
      await onDelete(form.id)
      toast.success('삭제되었습니다')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패')
    } finally {
      setSaving(false)
    }
  }

  const typeLabel = TYPE_LABEL[form.billingType] ?? form.billingType
  const title = isCreateMode
    ? `➕ ${typeLabel} 결제 추가 · ${form.billingPeriod}`
    : `💰 ${typeLabel} 결제 · ${form.billingPeriod}`

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
      onClick={!saving ? onClose : undefined}
    >
      <div
        className="bg-white rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-gray-200 bg-slate-50 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-text-primary truncate">{title}</h3>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                form.status === 'paid' ? 'bg-emerald-100 text-emerald-700'
                : form.status === 'overdue' ? 'bg-rose-100 text-rose-700'
                : 'bg-amber-100 text-amber-700'
              }`}>
                {STATUS_LABEL[form.status]}
              </span>
              {form.taxInvoiceIssued && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-100 text-brand-700">
                  계산서 발행
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1 text-text-tertiary hover:text-text-primary rounded-md hover:bg-slate-100 shrink-0 disabled:opacity-30"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        {/* 폼 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="금액 (원)">
              <input
                type="number"
                value={form.amount}
                onChange={e => update({ amount: Number(e.target.value) })}
                disabled={saving}
                className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </Field>
            <Field label="상태">
              <select
                value={form.status}
                onChange={e => update({ status: e.target.value as typeof STATUS_OPTIONS[number] })}
                disabled={saving}
                className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 bg-white"
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="결제 예정일">
              <input
                type="date"
                value={form.dueDate}
                onChange={e => update({ dueDate: e.target.value })}
                disabled={saving}
                className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </Field>
            <Field label="결제 완료일">
              <input
                type="date"
                value={form.paidDate ?? ''}
                onChange={e => update({ paidDate: e.target.value || undefined })}
                disabled={saving}
                className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </Field>
          </div>

          {/* ─── 결제 링크 (Phase H.5-rev + H.1) ─────────────── */}
          {!isCreateMode && (
            <div className="pt-3 border-t border-gray-100 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-semibold text-text-secondary flex items-center gap-1">
                  <LinkIcon size={11} /> 결제 링크
                </label>
                <button
                  type="button"
                  onClick={handleAutoGenerate}
                  disabled={saving || generatingLink}
                  className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border font-semibold bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 disabled:opacity-50"
                  title="PortOne 자동 생성"
                >
                  <Zap size={10} />
                  {generatingLink ? '생성 중...' : form.paymentUrl ? '재생성' : '자동 생성'}
                </button>
              </div>

              {/* 수동 입력 가능한 input */}
              <input
                type="url"
                value={form.paymentUrl ?? ''}
                onChange={e => update({ paymentUrl: e.target.value || undefined })}
                disabled={saving || generatingLink}
                placeholder="https://... (자동 생성 또는 PortOne 링크 붙여넣기)"
                className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-200 bg-white font-mono"
              />

              {/* 복사 버튼 (링크 있을 때만) */}
              {form.paymentUrl && (
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border font-semibold transition-colors ${
                      copied
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                        : 'bg-white text-text-primary border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {copied ? <><Check size={10} /> 복사됨</> : <><Copy size={10} /> 링크 복사</>}
                  </button>
                </div>
              )}

              <p className="text-[10px] text-text-tertiary leading-relaxed">
                💡 <strong>자동 생성</strong> 버튼으로 PortOne 결제 링크를 즉시 발급받거나,
                기존 링크를 <strong>수동 입력</strong>할 수 있습니다. 저장 후 복사 버튼으로 고객에게 공유.
              </p>
            </div>
          )}

          {/* 빠른 액션 바 */}
          <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-gray-100">
            {form.status !== 'paid' ? (
              <button
                onClick={handleMarkPaid}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors"
              >
                <Check size={13} /> 결제 완료 처리
              </button>
            ) : (
              <button
                onClick={handleMarkPending}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50 transition-colors"
              >
                결제 취소
              </button>
            )}
            <button
              onClick={() => update({ taxInvoiceIssued: !form.taxInvoiceIssued })}
              disabled={saving}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border rounded-lg disabled:opacity-50 transition-colors ${
                form.taxInvoiceIssued
                  ? 'bg-brand-100 text-brand-700 border-brand-300 hover:bg-brand-200'
                  : 'bg-brand-50 text-brand-700 border-brand-200 hover:bg-brand-100'
              }`}
            >
              <FileCheck size={13} />
              {form.taxInvoiceIssued ? '계산서 발행 취소' : '세금계산서 발행'}
            </button>
          </div>

          <p className="text-[10px] text-text-tertiary leading-relaxed pt-1">
            💡 빠른 액션으로 상태·날짜가 폼에 반영됩니다. <strong>저장</strong>을 눌러야 DB 에 반영됩니다.
          </p>
        </div>

        {/* 하단 */}
        <div className="px-5 py-3 border-t border-gray-200 bg-slate-50 flex items-center justify-between gap-2">
          {onDelete && !isCreateMode ? (
            <button
              onClick={handleDelete}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg disabled:opacity-50 transition-colors"
            >
              <Trash2 size={13} /> 삭제
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-text-secondary border border-gray-200 rounded-lg hover:bg-white disabled:opacity-50 transition-colors"
            >
              닫기
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Save size={14} />
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-text-secondary mb-1">{label}</label>
      {children}
    </div>
  )
}
