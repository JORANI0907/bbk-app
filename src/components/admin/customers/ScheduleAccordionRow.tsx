'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Trash2, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAutoSave, AutoSaveStatus } from '@/hooks/useAutoSave'
import { NOTIFY_TYPES } from './CustomersManagementView'

// Phase 20-B: 알림 발송 시 자동으로 세팅될 진행/결제 상태 (admin/notify dual-write와 동일 매핑)
const NOTIFY_TO_PROGRESS: Record<string, string> = {
  '신청서작성완료알림': '신청서작성',
  '예약확정알림': '예약확정',
  '예약1일전알림': '예약1일전',
  '예약당일알림': '예약당일',
  '작업완료알림': '작업완료',
  '작업완료알림(현금)': '작업완료',
  '작업완료알림(카드,플렛폼)': '작업완료',
  '작업완료알림(정기엔드케어)': '작업완료',
  '예약취소알림': '예약취소',
  'A/S방문알림': 'A/S방문',
  '방문견적알림': '방문견적',
}
const NOTIFY_TO_PAYMENT: Record<string, string> = {
  '결제알림': '결제',
  '결제알림(현금)': '결제',
  '결제알림(카드,플렛폼)': '결제',
  '결제완료알림': '결제완료',
  '결제완료알림(잔금)': '결제완료(잔금)',
  '예약금 입금완료 알림': '예약금 입금',
  '계산서발행완료알림': '계산서발행완료',
  '예약금환급완료알림': '예약금환급완료',
}

export interface ScheduleAppRow {
  id: string
  business_name: string
  owner_name: string
  service_type: string | null
  construction_date: string | null
  construction_time: string | null
  assigned_to: string | null
  /** Phase 2: GET API에서 병합된 첫 번째 배정 워커 id (하위호환 · 요약 표시용) */
  assigned_worker_id: string | null
  /** Phase 27-AC: 다중 배정 지원 — 배정된 모든 작업자 id 배열 (없으면 빈 배열) */
  assigned_worker_ids?: string[]
  care_scope: string | null
  request_notes: string | null
  admin_request_notes: string | null
  supply_amount: number | null
  vat: number | null
  deposit: number | null
  balance: number | null
  work_status: string | null
  payment_status: string | null
  completed_at: string | null
  admin_notes: string | null
  internal_memo: string | null
  customer_memo: string | null
  /** Phase 8-D: 진행/결제 상태 이원화 (기존 status 분리) */
  progress_status: string | null
  payment_status_detail: string | null
  /** Phase 22: 알림 발송 이력 */
  notification_log: Array<{ type: string; sent_at: string; phone?: string; method?: 'auto' | 'manual' }> | null
}

// Phase 8-D: 진행상태·결제상태 옵션 (자동화 매핑과 동일 값)
export const PROGRESS_STATUS_OPTIONS = [
  '신청서작성', '예약확정', '예약1일전', '예약당일',
  '작업완료', '예약취소', 'A/S방문', '방문견적',
] as const

export const PAYMENT_STATUS_DETAIL_OPTIONS = [
  { value: '예약금 입금',    label: '예약금 입금' },
  { value: '결제',           label: '결제' },
  { value: '결제완료',       label: '결제완료' },
  { value: '결제완료(잔금)', label: '결제완료(잔금)' },
  { value: '계산서발행완료', label: '계산서발행완료' },
  { value: '예약금환급완료', label: '예약금환급완료' },
  { value: '비과세',         label: '비과세 결제' }, // 사용자 지시: DB 값은 '비과세' 유지, 라벨만 '비과세 결제'
  { value: '카드결제 완료',  label: '카드결제 완료' },
] as const

interface UserLite { id: string; name: string }
interface WorkerLite { id: string; name: string }

interface Props {
  app: ScheduleAppRow
  users: UserLite[]
  workers: WorkerLite[]
  onOptimisticUpdate: (id: string, patch: Partial<ScheduleAppRow>) => void
  /** Phase 7-K: 세부화면에서 개별 일정 삭제 — 부모가 리스트에서 제거 */
  onDelete?: (id: string) => void
  /** Phase 27: 캘린더에서 선택된 회차는 처음부터 펼쳐진 상태로 시작 */
  defaultExpanded?: boolean
}

// Phase 20-A: WORK_STATUS_LABEL, PAYMENT_STATUS_LABEL 제거 — 세부 상태 뱃지로 대체

function fmtDateShort(d: string | null): string {
  if (!d) return '-'
  const date = new Date(d.slice(0, 10) + 'T00:00:00')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const dow = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()]
  return `${mm}.${dd}(${dow})`
}

function StatusPill({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${tone}`}>
      {label}
    </span>
  )
}

function AutoSaveIndicator({ status }: { status: AutoSaveStatus }) {
  if (status === 'idle') return <span className="text-[10px] text-text-tertiary">자동저장</span>
  if (status === 'saving') return <span className="text-[10px] text-text-secondary">저장중…</span>
  if (status === 'saved') return <span className="text-[10px] text-state-success">✓ 저장됨</span>
  return <span className="text-[10px] text-state-danger">✕ 실패</span>
}

/**
 * Phase 2-D: 접힘 상태 2줄 요약 + 클릭 시 아코디언 펼침 편집.
 * 첫 줄: 날짜 · 담당자 · 작업자
 * 둘째 줄: 상태 뱃지 2개
 */
export function ScheduleAccordionRow({ app, users, workers, onOptimisticUpdate, onDelete, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [draft, setDraft] = useState<Partial<ScheduleAppRow>>({})
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (deleting) return
    const dateStr = app.construction_date?.slice(0, 10) ?? '(일자 미정)'
    if (!confirm(`${dateStr} 일정을 삭제하시겠습니까?`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/applications?id=${app.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? '삭제 실패')
      }
      toast.success('일정이 삭제되었습니다.')
      onDelete?.(app.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패')
      setDeleting(false)
    }
  }

  useEffect(() => { setDraft({}) }, [app.id])

  const merged: ScheduleAppRow = { ...app, ...draft }

  const { status } = useAutoSave({
    value: draft,
    enabled: Object.keys(draft).length > 0,
    save: async (patch) => {
      if (Object.keys(patch).length === 0) return
      // Phase 27-AC: assigned_worker_ids (다중) · assigned_worker_id (하위호환) 둘 다 지원.
      // 배정 API 는 별도 헬퍼로 분리 저장 (work_assignments 갱신).
      const {
        assigned_worker_id,
        assigned_worker_ids,
        ...restPatch
      } = patch as Partial<ScheduleAppRow> & { assigned_worker_id?: string | null; assigned_worker_ids?: string[] }

      onOptimisticUpdate(app.id, patch)

      if (Object.keys(restPatch).length > 0) {
        const res = await fetch('/api/admin/applications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: app.id, ...restPatch }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error ?? '저장 실패')
        }
      }

      if ('assigned_worker_ids' in patch || 'assigned_worker_id' in patch) {
        const workerIds: string[] = Array.isArray(assigned_worker_ids)
          ? assigned_worker_ids
          : (assigned_worker_id ? [assigned_worker_id] : [])
        const res2 = await fetch(`/api/admin/applications/${app.id}/assign-worker`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ worker_ids: workerIds }),
        })
        if (!res2.ok) {
          const body = await res2.json().catch(() => ({}))
          throw new Error(body?.error ?? '작업자 배정 실패')
        }
      }
    },
  })

  // Phase 20-A: workStyle, payStyle 제거 (세부 상태 뱃지 사용)
  const managerName = users.find(u => u.id === merged.assigned_to)?.name ?? '미배정'
  // Phase 27-AC: 다중 배정 요약 표시 — 여러 명이면 "홍길동 외 N명"
  const workerIdsView: string[] = merged.assigned_worker_ids
    ?? (merged.assigned_worker_id ? [merged.assigned_worker_id] : [])
  const workerNames = workerIdsView
    .map(id => workers.find(w => w.id === id)?.name)
    .filter((n): n is string => !!n)
  const workerName = workerNames.length === 0
    ? '미배정'
    : workerNames.length === 1
      ? workerNames[0]
      : `${workerNames[0]} 외 ${workerNames.length - 1}명`

  const update = <K extends keyof ScheduleAppRow>(key: K, value: ScheduleAppRow[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="border border-border-subtle rounded-xl bg-surface overflow-hidden relative">
      {/* 접힘 상태 요약 — 2줄 레이아웃 */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start gap-2 px-3 py-2 pr-16 hover:bg-surface-sunken/50 transition-colors text-left"
      >
        <div className="flex-1 min-w-0 space-y-1">
          {/* 첫째 줄: 날짜 · 담당 · 작업 */}
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-text-secondary shrink-0">{fmtDateShort(merged.construction_date)}</span>
            <span className="text-text-tertiary">·</span>
            <span className="text-text-primary shrink-0">{managerName}</span>
            <span className="text-text-tertiary">/</span>
            <span className="text-text-primary shrink-0">{workerName}</span>
          </div>
          {/* Phase 20-A: 작업/결제 요약 뱃지 제거 — 세부 상태 뱃지만 유지 */}
          <div className="flex items-center gap-1 flex-wrap">
            {merged.progress_status && (
              <StatusPill label={merged.progress_status} tone="bg-indigo-50 text-indigo-700 border-indigo-200" />
            )}
            {merged.payment_status_detail && (
              <StatusPill
                label={merged.payment_status_detail === '비과세' ? '비과세 결제' : merged.payment_status_detail}
                tone="bg-teal-50 text-teal-700 border-teal-200"
              />
            )}
          </div>
        </div>
        <div className="shrink-0 pt-1">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>
      {/* Phase 7-K: 개별 삭제 버튼 — button 안 button 중첩 방지를 위해 wrapper의 absolute 위치에 배치 */}
      {onDelete && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          title="이 일정 삭제"
          className="absolute top-2 right-8 w-6 h-6 flex items-center justify-center rounded-md text-text-tertiary hover:text-state-danger hover:bg-state-danger-bg disabled:opacity-40 transition-colors"
        >
          <Trash2 size={13} />
        </button>
      )}

      {/* 펼침 상태 편집 폼 — 넓이는 부모(섹션) 컨테이너 유지 */}
      {expanded && (
        <div className="border-t border-border-subtle bg-surface-sunken/30 p-3 space-y-3">
          <ExpandedEditor
            merged={merged}
            users={users}
            workers={workers}
            update={update}
            status={status}
            onOptimisticUpdate={onOptimisticUpdate}
          />
        </div>
      )}
    </div>
  )
}

interface ExpandedProps {
  merged: ScheduleAppRow
  users: UserLite[]
  workers: WorkerLite[]
  update: <K extends keyof ScheduleAppRow>(key: K, value: ScheduleAppRow[K]) => void
  status: AutoSaveStatus
  onOptimisticUpdate: (id: string, patch: Partial<ScheduleAppRow>) => void
}

function ExpandedEditor({ merged, users, workers, update, status, onOptimisticUpdate }: ExpandedProps) {
  const inputCls = 'w-full text-xs border border-border rounded-md px-2 py-1 bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500'
  const labelCls = 'text-[10px] font-semibold text-text-secondary'

  // Phase 22: 이번달 일정 각 row는 개별 방문(1회성 성격) → 알림 목록·워크플로우를 1회성케어와 동일하게 통일
  // Phase 25d: DB에서 monthly_schedule location + 1회성케어 type template 동적 로드
  const [notifyType, setNotifyType] = useState('')
  const [sending, setSending] = useState(false)
  const [dbCodes, setDbCodes] = useState<string[] | null>(null)
  useEffect(() => {
    fetch('/api/admin/notification-templates?type=1회성케어&location=monthly_schedule&active_only=true')
      .then(r => r.json())
      .then(j => setDbCodes(((j.templates ?? []) as Array<{ code: string }>).map(t => t.code)))
      .catch(() => setDbCodes(null))
  }, [])
  const notifyList = dbCodes ?? NOTIFY_TYPES['1회성케어']

  async function handleSendNotification() {
    if (!notifyType) { toast.error('알림 유형을 선택하세요.'); return }
    if (sending) return
    setSending(true)
    try {
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: merged.id, type: notifyType, method: 'manual' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? '발송 실패')
      // 발송 성공 → 진행/결제 상태 + 알림 이력 optimistic update
      const patch: Partial<ScheduleAppRow> = {}
      const newProgress = NOTIFY_TO_PROGRESS[notifyType]
      const newPayment = NOTIFY_TO_PAYMENT[notifyType]
      if (newProgress) patch.progress_status = newProgress
      if (newPayment) patch.payment_status_detail = newPayment
      // 알림 이력에 신규 항목 추가 (최신순)
      const newLog = { type: notifyType, sent_at: new Date().toISOString(), method: 'manual' as const }
      patch.notification_log = [newLog, ...(merged.notification_log ?? [])]
      onOptimisticUpdate(merged.id, patch)
      toast.success(`${notifyType} 발송 완료`)
      setNotifyType('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '발송 실패')
    } finally {
      setSending(false)
    }
  }

  // Phase 27-AC: 다중 배정 chip 표시용 — merged 에서 계산
  const workerIdsView: string[] = merged.assigned_worker_ids
    ?? (merged.assigned_worker_id ? [merged.assigned_worker_id] : [])

  return (
    <>
      {/* 2열 그리드 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className={labelCls}>담당자</p>
          <select
            value={merged.assigned_to ?? ''}
            onChange={e => update('assigned_to', e.target.value || null)}
            className={inputCls}
          >
            <option value="">미배정</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <p className={labelCls}>작업자 (복수 선택)</p>
          {/* Phase 27-AC: 다중 선택 chip UI. work_assignments 를 배열로 저장해
              여러 작업자 배정 지원. 클릭 = toggle. 아무것도 선택 안 하면 미배정. */}
          <div className="flex flex-wrap gap-1.5 min-h-[38px] items-center px-2 py-1.5 border border-border rounded-md bg-surface">
            {workers.length === 0 && (
              <span className="text-xs text-text-tertiary px-1">등록된 작업자 없음</span>
            )}
            {workers.map(w => {
              const selected = workerIdsView.includes(w.id)
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    const next = selected
                      ? workerIdsView.filter(id => id !== w.id)
                      : [...workerIdsView, w.id]
                    update('assigned_worker_ids', next)
                    update('assigned_worker_id', next[0] ?? null)  // 하위호환 프리뷰 동기화
                  }}
                  className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                    selected
                      ? 'bg-brand-600 text-white border-brand-600 hover:bg-brand-700'
                      : 'bg-surface text-text-secondary border-border hover:bg-surface-sunken'
                  }`}
                >
                  {selected && <span className="mr-1">✓</span>}
                  {w.name}
                </button>
              )
            })}
          </div>
          {workerIdsView.length > 1 && (
            <p className="text-[10px] text-text-tertiary mt-1">{workerIdsView.length}명 배정됨</p>
          )}
        </div>
        <div>
          <p className={labelCls}>시공일자</p>
          <input
            type="date"
            value={merged.construction_date?.slice(0, 10) ?? ''}
            onChange={e => update('construction_date', e.target.value || null)}
            className={inputCls}
          />
        </div>
        <div>
          <p className={labelCls}>시공시간</p>
          <input
            type="time"
            value={merged.construction_time?.slice(0, 5) ?? ''}
            onChange={e => update('construction_time', e.target.value ? `${e.target.value}:00` : null)}
            className={inputCls}
          />
        </div>
        {/* Phase 20-A: 작업상태·결제상태 요약 짧은 드롭다운 제거 — progress_status·payment_status_detail 세부와 성격 중복 */}
        {/* Phase 8-D: 진행상태 (자동화가 알림 발송 시 자동 세팅. 수동 편집도 가능) */}
        <div>
          <p className={labelCls}>진행상태</p>
          <select
            value={merged.progress_status ?? ''}
            onChange={e => update('progress_status', e.target.value || null)}
            className={inputCls}
          >
            <option value="">(미정)</option>
            {PROGRESS_STATUS_OPTIONS.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
        {/* Phase 8-D: 결제상태 (자동화 + 수동 편집). 비과세는 DB '비과세' 값을 '비과세 결제'로 표시 */}
        <div>
          <p className={labelCls}>결제상태</p>
          <select
            value={merged.payment_status_detail ?? ''}
            onChange={e => update('payment_status_detail', e.target.value || null)}
            className={inputCls}
          >
            <option value="">(미정)</option>
            {PAYMENT_STATUS_DETAIL_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <p className={labelCls}>공급가액</p>
          <input
            type="number"
            value={merged.supply_amount ?? ''}
            onChange={e => update('supply_amount', e.target.value ? Number(e.target.value) : null)}
            className={inputCls}
          />
        </div>
      </div>

      {/* 케어범위 */}
      <div>
        <p className={labelCls}>케어범위</p>
        <textarea
          rows={2}
          value={merged.care_scope ?? ''}
          onChange={e => update('care_scope', e.target.value || null)}
          className={inputCls + ' resize-none'}
        />
      </div>

      {/* 관리자 요청 (신규) */}
      <div>
        <p className={labelCls}>관리자 요청</p>
        <textarea
          rows={2}
          value={merged.admin_request_notes ?? ''}
          onChange={e => update('admin_request_notes', e.target.value || null)}
          className={inputCls + ' resize-none'}
        />
      </div>

      {/* 관리자 메모 */}
      <div>
        <p className={labelCls}>관리자 메모</p>
        <textarea
          rows={2}
          value={merged.admin_notes ?? ''}
          onChange={e => update('admin_notes', e.target.value || null)}
          className={inputCls + ' resize-none'}
        />
      </div>

      {/* Phase 20-B: 알림 발송 UI — 1회성 알림 시나리오와 동일 (발송 시 진행/결제 상태 자동 갱신) */}
      {notifyList.length > 0 && (
        <div className="border-t border-border-subtle pt-2 mt-1">
          <p className={labelCls}>알림 발송</p>
          <div className="flex gap-1.5 mt-1">
            <select
              value={notifyType}
              onChange={e => setNotifyType(e.target.value)}
              disabled={sending}
              className={inputCls + ' flex-1'}
            >
              <option value="">알림 유형 선택...</option>
              {notifyList.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSendNotification}
              disabled={sending || !notifyType}
              className="px-2.5 py-1 text-xs font-medium bg-brand-600 hover:bg-brand-700 text-white rounded-md disabled:opacity-40 flex items-center gap-1 shrink-0"
            >
              <Send size={12} />
              {sending ? '발송 중...' : '발송'}
            </button>
          </div>
          <p className="text-[10px] text-text-tertiary mt-1">
            발송 시 진행상태·결제상태가 자동 갱신됩니다 (예: 예약확정알림 → 진행상태=예약확정)
          </p>
        </div>
      )}

      {/* Phase 22: 알림 발송 이력 (최신순 5건) */}
      {merged.notification_log && merged.notification_log.length > 0 && (
        <div className="border-t border-border-subtle pt-2">
          <p className={labelCls}>알림 이력 ({merged.notification_log.length}건)</p>
          <div className="mt-1 space-y-0.5 max-h-32 overflow-y-auto pr-1">
            {merged.notification_log.slice(0, 8).map((log, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[11px] text-text-secondary bg-surface-sunken/50 rounded px-1.5 py-0.5">
                {log.method === 'auto' && (
                  <span className="text-[9px] px-1 py-0.5 bg-indigo-100 text-indigo-600 rounded font-medium leading-none">자동</span>
                )}
                <span className="font-mono text-text-tertiary shrink-0">
                  {log.sent_at.slice(5, 10)} {log.sent_at.slice(11, 16)}
                </span>
                <span className="truncate">{log.type}</span>
              </div>
            ))}
            {merged.notification_log.length > 8 && (
              <p className="text-[10px] text-text-tertiary text-center pt-1">... {merged.notification_log.length - 8}건 더</p>
            )}
          </div>
        </div>
      )}

      {/* 상태 표시 */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <AutoSaveIndicator status={status} />
      </div>
    </>
  )
}
