'use client'

/**
 * 투입일정 세부 편집 모달 (2026-10-17)
 *
 * Phase B.5: 모달 틀 + placeholder
 * Phase C:   편집 가능 (시공일자/시간/진행상태/결제상태/케어범위/요청/메모)
 * Phase F:   담당자 셀렉트 활성화
 * Phase G1:  📊 "이 방문의 진행" 미니 진행흐름 (예약금/작업완료/잔금/계산서)
 * Phase G2:  🔔 알림 발송 섹션 (알림 종류별 발송 + 이력)
 */

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { X, Folder, Image as ImageIcon, Camera, Save, Check } from 'lucide-react'

export interface VisitDetailData {
  id: string
  date: string
  weekday?: string
  worker: string
  assignedTo?: string
  additionalWorkers?: string[]
  constructionTime?: string
  progressStatus?: string
  paymentStatus?: string
  careScope?: string
  adminRequest?: string
  adminMemo?: string
  driveFolderUrl?: string | null
  notificationSent?: boolean
  // Phase G1
  depositPaidAt?: string
  workCompletedAt?: string
  balancePaidAt?: string
  taxInvoiceIssued?: boolean
  // Phase G2
  notificationLog?: Array<{ type: string; sent_at: string; method?: string }>
}

interface Props {
  open: boolean
  onClose: () => void
  data: VisitDetailData | null
  onSave?: (id: string, patch: Record<string, unknown>) => Promise<void>
  availableAssignees?: { id: string; name: string }[]
}

const PROGRESS_OPTIONS = ['예정', '진행중', '작업완료', '예약취소']
const PAYMENT_OPTIONS = ['미정', '예약금 입금', '결제완료', '계산서발행완료']

// 방문 레벨 알림 종류 (월 레벨 알림은 MonthlyScheduleNotifyModal 에서 처리)
const NOTIFY_TYPES = [
  '예약확정알림',
  '예약1일전알림',
  '예약당일알림',
  '작업완료알림',
  '결제알림',
  '결제완료알림',
  '계산서발행완료알림',
]

const todayIso = () => new Date().toISOString().slice(0, 10)
const nowIsoFull = () => new Date().toISOString()

export function VisitDetailModal({ open, onClose, data, onSave, availableAssignees }: Props) {
  const [form, setForm] = useState<VisitDetailData | null>(data)
  const [saving, setSaving] = useState(false)
  const [togglingStep, setTogglingStep] = useState<string | null>(null)
  const [sendingNotify, setSendingNotify] = useState<string | null>(null)

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

  const update = (patch: Partial<VisitDetailData>) =>
    setForm(prev => prev ? { ...prev, ...patch } : prev)

  const handleSave = async () => {
    if (!form) return
    if (!onSave) {
      toast.success('저장되었습니다 (프리뷰 모드)')
      onClose()
      return
    }
    setSaving(true)
    try {
      const patch: Record<string, unknown> = {
        construction_date: form.date || null,
        construction_time: form.constructionTime || null,
        progress_status: form.progressStatus ?? null,
        payment_status_detail: form.paymentStatus ?? null,
        care_scope: form.careScope ?? null,
        request_notes: form.adminRequest ?? null,
        admin_notes: form.adminMemo ?? null,
      }
      if (availableAssignees) {
        patch.assigned_to = form.assignedTo || null
      }
      await onSave(form.id, patch)
      toast.success('저장되었습니다')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  // Phase G1: 미니 진행흐름 단계 토글 (즉시 저장)
  const toggleStep = async (step: 'deposit' | 'work' | 'balance' | 'invoice') => {
    if (!form || !onSave) return
    setTogglingStep(step)
    const nowFull = nowIsoFull()
    const nowDate = todayIso()
    try {
      let serverPatch: Record<string, unknown> = {}
      let localPatch: Partial<VisitDetailData> = {}
      if (step === 'deposit') {
        const next = form.depositPaidAt ? null : nowFull
        serverPatch = { deposit_paid_at: next }
        localPatch = { depositPaidAt: next ? nowDate : undefined }
      } else if (step === 'work') {
        const next = form.workCompletedAt ? null : nowFull
        serverPatch = { work_completed_at: next }
        localPatch = { workCompletedAt: next ? nowDate : undefined }
      } else if (step === 'balance') {
        const next = form.balancePaidAt ? null : nowFull
        serverPatch = { balance_paid_at: next }
        localPatch = { balancePaidAt: next ? nowDate : undefined }
      } else if (step === 'invoice') {
        const next = !form.taxInvoiceIssued
        serverPatch = { tax_invoice_issued: next }
        localPatch = { taxInvoiceIssued: next }
      }
      await onSave(form.id, serverPatch)
      update(localPatch)
      toast.success('반영되었습니다')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '처리 실패')
    } finally {
      setTogglingStep(null)
    }
  }

  // 알림 발송 (방문 레벨 · POST /api/admin/notify)
  // 발송 성공 시 상단 "📜 알림 발송 이력"(마스터) 에도 자동 반영됨 (refetchTick)
  const sendNotification = async (type: string) => {
    if (!form) return
    setSendingNotify(type)
    try {
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: form.id,
          type,
          method: 'manual',
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? '발송 실패')
      }
      const resData = await res.json().catch(() => ({}))
      if (resData.skipped) {
        toast(resData.reason ?? '건너뜀')
      } else {
        toast.success(`${type} 발송됨`)
      }
      // 로컬 즉시 반영 (optimistic)
      update({
        notificationLog: [
          { type, sent_at: nowIsoFull(), method: 'manual' },
          ...(form.notificationLog ?? []),
        ],
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '발송 실패')
    } finally {
      setSendingNotify(null)
    }
  }

  const title = `${form.date}${form.weekday ? ` (${form.weekday})` : ''} · ${form.worker}`

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
      onClick={!saving ? onClose : undefined}
    >
      <div
        className="bg-white rounded-2xl shadow-modal w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-gray-200 bg-slate-50 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-text-primary truncate">{title}</h3>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {form.progressStatus && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  {form.progressStatus}
                </span>
              )}
              {form.notificationSent && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-100 text-brand-700">
                  확정알림발송
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1 text-text-tertiary hover:text-text-primary rounded-md hover:bg-slate-100 transition-colors shrink-0 disabled:opacity-30"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        {/* 액션 바 */}
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          <button disabled title="추후 Phase"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-text-secondary disabled:opacity-50">
            <Folder size={13} /> 회차 폴더
          </button>
          <button disabled
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 disabled:opacity-50">
            <ImageIcon size={13} /> 사진 보기
          </button>
          <button disabled
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-text-secondary disabled:opacity-50">
            <Camera size={13} /> 사진 올리기
          </button>
        </div>

        {/* 폼 영역 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* ─── 미니 진행흐름 (Phase G1) ─────────────────── */}
          <div className="pb-4 border-b border-gray-100">
            <h4 className="text-[11px] font-bold text-text-secondary mb-2.5">📊 이 방문의 진행</h4>
            <div className="space-y-1">
              <StepRow label="예약금결제" doneDate={form.depositPaidAt}
                onToggle={() => toggleStep('deposit')} loading={togglingStep === 'deposit'} />
              <StepRow label="작업완료" doneDate={form.workCompletedAt}
                onToggle={() => toggleStep('work')} loading={togglingStep === 'work'} />
              <StepRow label="잔금결제" doneDate={form.balancePaidAt}
                onToggle={() => toggleStep('balance')} loading={togglingStep === 'balance'} />
              <StepRow label="세금계산서발행" done={form.taxInvoiceIssued === true}
                onToggle={() => toggleStep('invoice')} loading={togglingStep === 'invoice'} />
            </div>
            <p className="text-[10px] text-text-tertiary mt-2">각 단계 클릭하면 즉시 저장됩니다.</p>
          </div>

          {/* ─── 알림 발송 (방문 레벨) ─────────────────── */}
          <div className="pb-4 border-b border-gray-100">
            <h4 className="text-[11px] font-bold text-text-secondary mb-2.5">
              🔔 알림 발송 <span className="font-normal text-text-tertiary">(이 방문용)</span>
            </h4>
            <div className="space-y-1">
              {NOTIFY_TYPES.map(type => {
                const latest = findLatestNotification(form.notificationLog, type)
                return (
                  <NotifyRow
                    key={type}
                    type={type}
                    latestSentAt={latest?.sent_at}
                    onSend={() => sendNotification(type)}
                    sending={sendingNotify === type}
                  />
                )
              })}
            </div>
            <p className="text-[10px] text-text-tertiary mt-2">
              💡 발송 이력은 상단 <strong>📜 알림 발송 이력</strong> 섹션에서도 전체 조회 가능.
            </p>
          </div>

          {/* ─── 기본 필드 ──────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="담당자">
              {availableAssignees && availableAssignees.length > 0 ? (
                <select
                  value={form.assignedTo ?? ''}
                  onChange={e => {
                    const id = e.target.value
                    const name = availableAssignees.find(a => a.id === id)?.name ?? ''
                    update({ assignedTo: id || undefined, worker: name || '미배정' })
                  }}
                  disabled={saving}
                  className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 bg-white text-text-primary"
                >
                  <option value="">미배정</option>
                  {availableAssignees.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              ) : (
                <Input value={form.worker} readOnly muted />
              )}
            </Field>
            <Field label="작업자 (복수 선택)" hint="추후 Phase">
              <Input value={form.additionalWorkers?.join(', ') || '선택 없음'} readOnly muted />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="시공일자">
              <Input type="date" value={form.date}
                onChange={e => update({ date: e.target.value })} disabled={saving} />
            </Field>
            <Field label="시공시간">
              <Input type="time" value={form.constructionTime ?? ''}
                onChange={e => update({ constructionTime: e.target.value })} disabled={saving} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="진행상태">
              <Select value={form.progressStatus ?? ''}
                onChange={v => update({ progressStatus: v })}
                options={PROGRESS_OPTIONS} disabled={saving} />
            </Field>
            <Field label="결제상태">
              <Select value={form.paymentStatus ?? ''}
                onChange={v => update({ paymentStatus: v })}
                options={PAYMENT_OPTIONS} disabled={saving} />
            </Field>
          </div>

          <Field label="케어범위">
            <Textarea value={form.careScope ?? ''}
              onChange={e => update({ careScope: e.target.value })} rows={3} disabled={saving} />
          </Field>

          <Field label="관리자 요청">
            <Textarea value={form.adminRequest ?? ''}
              onChange={e => update({ adminRequest: e.target.value })} rows={2} disabled={saving} />
          </Field>

          <Field label="관리자 메모">
            <Textarea value={form.adminMemo ?? ''}
              onChange={e => update({ adminMemo: e.target.value })} rows={2} disabled={saving} />
          </Field>
        </div>

        {/* 하단 */}
        <div className="px-5 py-3 border-t border-gray-200 bg-slate-50 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-text-secondary border border-gray-200 rounded-lg hover:bg-white transition-colors disabled:opacity-50">
            닫기
          </button>
          <button onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Save size={14} />
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 서브 컴포넌트 ────────────────────────────────────────────

function findLatestNotification(
  log: VisitDetailData['notificationLog'] | undefined,
  type: string,
): { type: string; sent_at: string } | null {
  if (!Array.isArray(log)) return null
  return log.find(e => e?.type === type) ?? null
}

function NotifyRow({ type, latestSentAt, onSend, sending }: {
  type: string
  latestSentAt?: string
  onSend: () => void
  sending: boolean
}) {
  const sent = !!latestSentAt
  const dateLabel = latestSentAt
    ? (() => {
        try {
          return new Date(latestSentAt).toLocaleString('ko-KR', {
            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
          })
        } catch { return latestSentAt.slice(0, 16).replace('T', ' ') }
      })()
    : null
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 bg-slate-50 rounded-lg border border-gray-100">
      <span className={`shrink-0 ${sent ? 'text-teal-600' : 'text-gray-300'}`}>
        {sent ? <Check size={12} /> : <span className="inline-block w-3" />}
      </span>
      <span className="text-xs font-medium text-text-primary flex-1 truncate">{type}</span>
      {dateLabel && (
        <span className="text-[10px] text-text-tertiary shrink-0">{dateLabel}</span>
      )}
      <button
        type="button"
        onClick={onSend}
        disabled={sending}
        className={`text-[10px] px-2 py-0.5 rounded font-semibold shrink-0 transition-colors ${
          sent
            ? 'bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100'
            : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
        } disabled:opacity-50`}
      >
        {sending ? '발송 중' : sent ? '재발송' : '발송'}
      </button>
    </div>
  )
}

function StepRow({ label, done, doneDate, onToggle, loading }: {
  label: string
  done?: boolean
  doneDate?: string
  onToggle: () => void
  loading: boolean
}) {
  const isDone = done ?? !!doneDate
  return (
    <div className="flex items-center gap-2.5 py-1 px-1">
      <button
        type="button"
        onClick={onToggle}
        disabled={loading}
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-150 ${
          isDone
            ? 'bg-brand-500 border-brand-500 text-white hover:scale-105'
            : 'bg-white border-gray-300 hover:border-brand-300 hover:scale-105'
        } disabled:opacity-50 cursor-pointer`}
        aria-label={`${label} 토글`}
      >
        {isDone ? <Check size={12} /> : null}
      </button>
      <span className={`text-xs font-medium ${isDone ? 'text-text-primary' : 'text-text-tertiary'}`}>
        {label}
      </span>
      {doneDate && (
        <span className="text-[10px] text-teal-600 ml-auto">
          {doneDate}
        </span>
      )}
      {done === true && !doneDate && (
        <span className="text-[10px] text-brand-600 ml-auto">발행 완료</span>
      )}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-[11px] font-semibold text-text-secondary">{label}</label>
        {hint && <span className="text-[10px] text-text-tertiary">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { muted?: boolean }
function Input({ muted, className = '', ...rest }: InputProps) {
  return (
    <input
      {...rest}
      className={`
        w-full border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200
        ${rest.disabled || rest.readOnly ? 'border-gray-200 bg-slate-50' : 'border-gray-300 bg-white'}
        ${muted ? 'text-text-tertiary' : 'text-text-primary'}
        ${className}
      `}
    />
  )
}

function Select({ value, onChange, options, disabled }: {
  value: string
  onChange: (v: string) => void
  options: readonly string[]
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className={`
        w-full border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200
        ${disabled ? 'border-gray-200 bg-slate-50 text-text-tertiary' : 'border-gray-300 bg-white text-text-primary'}
      `}
    >
      {!options.includes(value) && value && <option value={value}>{value}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>
function Textarea({ className = '', ...rest }: TextareaProps) {
  return (
    <textarea
      {...rest}
      className={`
        w-full border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 resize-none
        ${rest.disabled || rest.readOnly ? 'border-gray-200 bg-slate-50' : 'border-gray-300 bg-white'}
        text-text-primary
        ${className}
      `}
    />
  )
}
