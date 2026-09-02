'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, ChevronUp, Trash2, Send, Folder, FolderOpen, FolderPlus, Camera, Save } from 'lucide-react'
import { requestGoogleToken, createWorkFolderStructure } from '@/lib/googleDrive'

/** URL 에서 Google Drive 폴더 id 추출 (…/folders/{id} 형태) */
function extractDriveFolderId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : null
}
import toast from 'react-hot-toast'
import { NOTIFY_TYPES } from './CustomersManagementView'

// Phase 27-AU: 자동저장 → 저장 버튼 방식으로 변경.
// 편집 후 draft 축적 → 사용자가 명시적으로 저장 버튼 클릭할 때만 서버 반영.
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// Phase 27-AQ: 하드코딩 NOTIFY_TO_PROGRESS / NOTIFY_TO_PAYMENT 매핑 제거.
// → notification_templates.linked_progress_status / linked_payment_status 로 이관.
// 발송 후 응답의 new_progress_status / new_payment_status_detail 를 옵티미스틱 업데이트에 사용.

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
  /** Phase 27-AI: 이 회차 Drive 폴더 URL */
  drive_folder_url?: string | null
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
  { value: '계산서발행완료', label: '계산서발행완료' },
  { value: '예약금환급완료', label: '예약금환급완료' },
  { value: '비과세',         label: '비과세 결제' }, // DB값은 '비과세' 유지, 라벨만 '비과세 결제'
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
  /** Phase 27-AI: 고객 마스터 Drive 폴더 URL (있으면 회차 폴더를 그 하위로 생성) */
  parentDriveFolderUrl?: string | null
  /** Phase 27-AI: 고객 업체명 (Drive 폴더명에 사용) */
  parentBusinessName?: string
  /** Phase 27-AN: 이 회차가 속한 customer 유형 (dropdown 을 유형별로 분기하기 위함) */
  customerType?: string | null
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

// 서비스 유형 → 짧은 배지 라벨 (알림 이력에 병기)
// baseType 저장 통일 이후에도 어떤 유형의 template 인지 UI 에서 확인 가능.
function serviceTypeShortLabel(t: string | null | undefined): string | null {
  if (!t) return null
  if (t === '1회성케어') return '1회성'
  if (t === '정기딥케어') return '정기딥'
  if (t === '정기엔드케어') return '정기엔드'
  return null
}

function StatusPill({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${tone}`}>
      {label}
    </span>
  )
}

function SaveStatusIndicator({ status, isDirty }: { status: SaveStatus; isDirty: boolean }) {
  if (status === 'saving') return <span className="text-[10px] text-text-secondary">저장중…</span>
  if (status === 'saved') return <span className="text-[10px] text-state-success">✓ 저장됨</span>
  if (status === 'error') return <span className="text-[10px] text-state-danger">✕ 실패</span>
  if (isDirty) return <span className="text-[10px] text-amber-600">변경 있음 · 저장 필요</span>
  return null
}

/**
 * Phase 2-D: 접힘 상태 2줄 요약 + 클릭 시 아코디언 펼침 편집.
 * 첫 줄: 날짜 · 담당자 · 작업자
 * 둘째 줄: 상태 뱃지 2개
 */
export function ScheduleAccordionRow({ app, users, workers, onOptimisticUpdate, onDelete, defaultExpanded = false, parentDriveFolderUrl, parentBusinessName, customerType }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [draft, setDraft] = useState<Partial<ScheduleAppRow>>({})
  const [deleting, setDeleting] = useState(false)
  const [status, setStatus] = useState<SaveStatus>('idle')

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

  useEffect(() => { setDraft({}); setStatus('idle') }, [app.id])

  const merged: ScheduleAppRow = { ...app, ...draft }
  const isDirty = Object.keys(draft).length > 0

  // Phase 27-AU: 자동저장 제거 → 수동 저장. 명시적 클릭 시에만 서버 반영.
  const handleSave = async () => {
    if (!isDirty || status === 'saving') return
    setStatus('saving')
    const patch = draft
    const {
      assigned_worker_id,
      assigned_worker_ids,
      ...restPatch
    } = patch as Partial<ScheduleAppRow> & { assigned_worker_id?: string | null; assigned_worker_ids?: string[] }
    try {
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

      setDraft({})
      setStatus('saved')
      toast.success('저장되었습니다.')
      // 잠시 후 저장됨 뱃지 숨김
      setTimeout(() => setStatus(s => s === 'saved' ? 'idle' : s), 2000)
    } catch (e) {
      setStatus('error')
      toast.error(e instanceof Error ? e.message : '저장 실패')
    }
  }

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
              <StatusPill label={merged.progress_status} tone="bg-brand-50 text-brand-700 border-brand-200" />
            )}
            {merged.payment_status_detail && (
              <StatusPill
                label={merged.payment_status_detail === '비과세' ? '비과세 결제' : merged.payment_status_detail}
                tone="bg-brand-50 text-brand-700 border-brand-200"
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
            isDirty={isDirty}
            onSave={handleSave}
            onOptimisticUpdate={onOptimisticUpdate}
            parentDriveFolderUrl={parentDriveFolderUrl}
            parentBusinessName={parentBusinessName ?? merged.business_name}
            appId={app.id}
            customerType={customerType}
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
  status: SaveStatus
  isDirty: boolean
  onSave: () => void | Promise<void>
  onOptimisticUpdate: (id: string, patch: Partial<ScheduleAppRow>) => void
  parentDriveFolderUrl?: string | null
  parentBusinessName?: string
  appId: string
  /** Phase 27-AN: 이 회차가 속한 customer 의 유형 (정기딥/엔드) → dropdown 이 그 유형용 템플릿만 노출 */
  customerType?: string | null
}

function ExpandedEditor({ merged, users, workers, update, status, isDirty, onSave, onOptimisticUpdate, parentDriveFolderUrl, parentBusinessName, appId, customerType }: ExpandedProps) {
  const inputCls = 'w-full text-xs border border-border rounded-md px-2 py-1 bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500'
  const labelCls = 'text-[10px] font-semibold text-text-secondary'

  // Phase 27-AN: dropdown 알림 목록을 customer 유형(정기딥/엔드) 별로 분기.
  // 이전엔 type=1회성케어 하드코딩 → 정기딥/엔드 회차에서 잘못된 리스트 노출.
  // 이번엔 customerType 기반으로 문자알림 관리 탭의 그 유형 활성 템플릿만 노출.
  const notifyTemplateType = customerType || '1회성케어'
  const [notifyType, setNotifyType] = useState('')
  const [sending, setSending] = useState(false)
  const [dbCodes, setDbCodes] = useState<string[] | null>(null)
  useEffect(() => {
    fetch(`/api/admin/notification-templates?type=${encodeURIComponent(notifyTemplateType)}&location=monthly_schedule&active_only=true`)
      .then(r => r.json())
      .then(j => setDbCodes(((j.templates ?? []) as Array<{ code: string }>).map(t => t.code)))
      .catch(() => setDbCodes(null))
  }, [notifyTemplateType])
  const notifyList = dbCodes ?? []

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
      // Phase 27-AQ: 서버 응답의 linked_* 값으로 옵티미스틱 업데이트 (하드코딩 매핑 제거).
      // 관리자가 관리 페이지에서 dropdown 으로 지정한 값이 그대로 세팅됨.
      const patch: Partial<ScheduleAppRow> = {}
      if (data?.new_progress_status) patch.progress_status = data.new_progress_status
      if (data?.new_payment_status_detail) patch.payment_status_detail = data.new_payment_status_detail
      // 작업완료알림은 서버에서 결제방법에 따라 세분화됨 → 응답의 final_type 을 우선 사용
      const finalType: string = data?.final_type ?? notifyType
      const newLog = { type: finalType, sent_at: new Date().toISOString(), method: 'manual' as const }
      patch.notification_log = [newLog, ...(merged.notification_log ?? [])]
      onOptimisticUpdate(merged.id, patch)
      toast.success(`${finalType} 발송 완료`)
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

  // Phase 27-AI: 회차 Drive 폴더 관리 (부모 폴더 있으면 그 안에 자식 생성, 없으면 피커)
  const [driveCreating, setDriveCreating] = useState(false)

  // 작업자 드롭다운 상태 (회차별 독립)
  const [workerDropdownOpen, setWorkerDropdownOpen] = useState(false)
  const workerDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!workerDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (workerDropdownRef.current && !workerDropdownRef.current.contains(e.target as Node)) {
        setWorkerDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [workerDropdownOpen])
  const parentFolderId = extractDriveFolderId(parentDriveFolderUrl)
  async function handleCreateChildFolder() {
    if (driveCreating) return
    const bizName = parentBusinessName?.trim() || merged.business_name?.trim() || '업체'
    // 시공일자 미지정 시 폴더 생성 거부 (과거엔 오늘 날짜로 조용히 대체되던 버그 fix — 2026-08-26)
    const date = merged.construction_date?.slice(0, 10)
    if (!date) {
      toast.error('시공일자가 설정되지 않아 폴더를 만들 수 없습니다. 먼저 시공일자를 입력하고 저장해주세요.', { duration: 6000 })
      return
    }
    setDriveCreating(true)
    try {
      const token = await requestGoogleToken()
      if (!parentFolderId) {
        toast.error('먼저 고객 마스터 폴더를 만들어야 회차 폴더를 그 안에 생성할 수 있습니다.', { duration: 6000 })
        return
      }
      const result = await createWorkFolderStructure(parentFolderId, bizName, date, token)
      // 저장 (application PATCH)
      await fetch('/api/admin/applications', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: appId, drive_folder_url: result.folderUrl }),
      })
      onOptimisticUpdate(appId, { drive_folder_url: result.folderUrl })
      toast.success(`"${result.folderName}" 회차 폴더 생성 완료`, { duration: 5000 })
      window.open(result.folderUrl, '_blank')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(`회차 폴더 생성 실패: ${msg}`, { duration: 8000 })
    } finally {
      setDriveCreating(false)
    }
  }

  return (
    <>
      {/* Phase 27-AI: 회차 Drive 폴더 섹션 */}
      <div className="border border-green-200 rounded-lg p-2 bg-green-50/50 flex items-center flex-wrap gap-1.5">
        <Folder size={12} className="text-green-700 shrink-0" />
        <span className="text-[11px] font-semibold text-green-900 mr-1">회차 폴더</span>
        {merged.drive_folder_url ? (
          <>
            <a href={merged.drive_folder_url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-green-600 text-white rounded hover:bg-green-700"
              title="Drive 폴더 열기">
              <FolderOpen size={11} /> 사진 보기
            </a>
            <a href={merged.drive_folder_url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-white border border-green-300 text-green-800 rounded hover:bg-green-100"
              title="Drive 폴더에서 사진 업로드">
              <Camera size={11} /> 사진 올리기
            </a>
          </>
        ) : (
          <button
            type="button"
            disabled={driveCreating}
            onClick={handleCreateChildFolder}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            title={parentFolderId ? '고객 마스터 폴더 안에 회차 폴더 생성' : '먼저 상단 고객DB에서 마스터 폴더를 만드세요'}
          >
            <FolderPlus size={11} /> {driveCreating ? '생성 중...' : '회차 폴더 생성'}
          </button>
        )}
        {!parentFolderId && !merged.drive_folder_url && (
          <span className="text-[10px] text-text-tertiary">고객 마스터 폴더가 필요합니다</span>
        )}
      </div>

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
          {/* 다중 선택 드롭다운 — 접힘 요약 + 클릭 시 팝오버(체크박스, 스크롤). */}
          <div className="relative" ref={workerDropdownRef}>
            {(() => {
              const selectedNames = workerIdsView
                .map(id => workers.find(w => w.id === id)?.name)
                .filter((n): n is string => !!n)
              const summary = selectedNames.length === 0
                ? '작업자 선택'
                : selectedNames.length <= 2
                  ? selectedNames.join(', ')
                  : `${selectedNames[0]}, ${selectedNames[1]} 외 ${selectedNames.length - 2}명`
              return (
                <button
                  type="button"
                  onClick={() => setWorkerDropdownOpen(v => !v)}
                  className="w-full flex items-center justify-between gap-2 px-2 py-1.5 border border-border rounded-md bg-surface text-xs text-left hover:bg-surface-sunken transition-colors"
                >
                  <span className={`truncate ${workerIdsView.length === 0 ? 'text-text-tertiary' : 'text-text-primary'}`}>
                    {summary}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {workerIdsView.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-100 text-brand-700 font-semibold">
                        {workerIdsView.length}명
                      </span>
                    )}
                    <ChevronDown className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${workerDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>
              )
            })()}
            {workerDropdownOpen && (
              <div className="absolute z-20 mt-1 left-0 right-0 max-h-64 overflow-y-auto bg-surface border border-border rounded-md shadow-lg py-1">
                {workers.length === 0 ? (
                  <p className="text-xs text-text-tertiary px-3 py-2">등록된 작업자 없음</p>
                ) : (
                  workers.map(w => {
                    const selected = workerIdsView.includes(w.id)
                    return (
                      <label
                        key={w.id}
                        className={`flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-surface-sunken transition-colors ${selected ? 'bg-brand-50' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => {
                            const next = selected
                              ? workerIdsView.filter(id => id !== w.id)
                              : [...workerIdsView, w.id]
                            update('assigned_worker_ids', next)
                            update('assigned_worker_id', next[0] ?? null)  // 하위호환 프리뷰 동기화
                          }}
                          className="accent-brand-600 shrink-0"
                        />
                        <span className={selected ? 'text-brand-700 font-medium' : 'text-text-primary'}>
                          {w.name}
                        </span>
                      </label>
                    )
                  })
                )}
              </div>
            )}
          </div>
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
        {/* 공급가액: 정기케어는 마스터 DB 기준(결제 시 조정) → 회차별 필드 제거.
            1회성/일반일정만 회차별 금액 입력. */}
        {customerType !== '정기딥케어' && customerType !== '정기엔드케어' && (
          <div>
            <p className={labelCls}>공급가액</p>
            <input
              type="number"
              value={merged.supply_amount ?? ''}
              onChange={e => update('supply_amount', e.target.value ? Number(e.target.value) : null)}
              className={inputCls}
            />
          </div>
        )}
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
            {merged.notification_log.slice(0, 8).map((log, i) => {
              const svcLabel = serviceTypeShortLabel(customerType)
              return (
                <div key={i} className="flex items-center gap-1.5 text-[11px] text-text-secondary bg-surface-sunken/50 rounded px-1.5 py-0.5">
                  {log.method === 'auto' && (
                    <span className="text-[9px] px-1 py-0.5 bg-brand-100 text-brand-600 rounded font-medium leading-none">자동</span>
                  )}
                  <span className="font-mono text-text-tertiary shrink-0">
                    {log.sent_at.slice(5, 10)} {log.sent_at.slice(11, 16)}
                  </span>
                  <span className="truncate">{log.type}</span>
                  {svcLabel && (
                    <span className="text-[9px] px-1 py-0.5 bg-slate-100 text-slate-600 rounded font-medium leading-none shrink-0">{svcLabel}</span>
                  )}
                </div>
              )
            })}
            {merged.notification_log.length > 8 && (
              <p className="text-[10px] text-text-tertiary text-center pt-1">... {merged.notification_log.length - 8}건 더</p>
            )}
          </div>
        </div>
      )}

      {/* Phase 27-AU: 상태 표시 + 저장 버튼 (자동저장 대체) */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle mt-1">
        <SaveStatusIndicator status={status} isDirty={isDirty} />
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={!isDirty || status === 'saving'}
          className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            isDirty && status !== 'saving'
              ? 'bg-brand-600 hover:bg-brand-700 text-white'
              : 'bg-surface-sunken text-text-tertiary cursor-not-allowed'
          }`}
        >
          <Save size={12} />
          {status === 'saving' ? '저장 중…' : '저장'}
        </button>
      </div>
    </>
  )
}
