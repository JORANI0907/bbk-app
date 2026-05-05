'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Folder, Upload, Download, CreditCard, Pencil, Banknote, ClipboardList, BarChart2, Tag } from 'lucide-react'
import { Button } from '@/components/ui'
import {
  loadGoogleAPIs,
  requestGoogleToken,
  openFolderPicker,
  resolveFolder,
  uploadFileToDrive,
  type DriveFolder,
} from '@/lib/googleDrive'

// ─── Export Modal ─────────────────────────────────────────────────────────────

function ExportModal({
  month,
  displayMonth,
  onClose,
}: {
  month: string
  displayMonth: string
  onClose: () => void
}) {
  const [folder, setFolder] = useState<DriveFolder | null>(null)
  const [folderLoading, setFolderLoading] = useState(true)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [exporting, setExporting] = useState(false)

  // DB에서 저장된 폴더 설정 로드
  useEffect(() => {
    fetch('/api/admin/payroll/drive-folder')
      .then(r => r.json())
      .then(d => setFolder(d.folder ?? null))
      .catch(() => {})
      .finally(() => setFolderLoading(false))
  }, [])

  const handleSelectFolder = async () => {
    setSelecting(true)
    try {
      await loadGoogleAPIs()
      const token = await requestGoogleToken()
      setAccessToken(token)
      const picked = await openFolderPicker(token)
      if (!picked) return
      const resolved = await resolveFolder(picked, token)
      // DB에 영구 저장
      const res = await fetch('/api/admin/payroll/drive-folder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: resolved }),
      })
      if (!res.ok) throw new Error('폴더 저장 실패')
      setFolder(resolved)
      toast.success(`저장 위치 설정됨: ${resolved.name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '폴더 선택 실패')
    } finally {
      setSelecting(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      // 1. 서버에서 Excel 생성
      const res = await fetch('/api/admin/payroll/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? '엑셀 생성 실패')
      }
      const blob = await res.blob()
      const fileName = `BBK_급여정산_${month}.xlsx`

      if (folder) {
        // 2. Google Drive에 업로드
        let token = accessToken
        if (!token) {
          await loadGoogleAPIs()
          token = await requestGoogleToken()
          setAccessToken(token)
        }
        const file = new File([blob], fileName, { type: blob.type })
        const { fileUrl } = await uploadFileToDrive(file, folder.id, fileName, token)
        toast.success(`[${folder.name}] 에 저장되었습니다!`)
        window.open(fileUrl, '_blank')
      } else {
        // 폴더 미설정 시 로컬 다운로드
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        a.click()
        URL.revokeObjectURL(url)
        toast.success('엑셀 파일이 다운로드되었습니다.')
      }

      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-sm p-5">
        <h3 className="font-bold text-text-primary mb-1">급여정산 현황 저장</h3>
        <p className="text-xs text-text-tertiary mb-4">
          <span className="font-semibold text-brand-600">{displayMonth}</span> 급여 지급 현황을 엑셀로 내보냅니다.
        </p>

        {/* Drive 폴더 설정 영역 */}
        <div className="mb-5">
          <p className="text-xs font-medium text-text-secondary mb-2">저장 위치 (Google Drive)</p>

          {folderLoading ? (
            <div className="h-11 rounded-xl bg-surface-sunken animate-pulse" />
          ) : folder ? (
            <div className="flex items-center justify-between px-3 py-2.5 bg-state-success-bg rounded-xl">
              <div className="flex items-center gap-2 min-w-0">
                <Folder size={16} className="shrink-0" />
                <span className="text-sm font-semibold text-state-success truncate">{folder.name}</span>
              </div>
              <button
                onClick={handleSelectFolder}
                disabled={selecting}
                className="text-xs text-text-tertiary hover:text-brand-600 ml-2 shrink-0 disabled:opacity-40 transition-colors"
              >
                {selecting ? '선택 중...' : '변경'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleSelectFolder}
              disabled={selecting}
              className="w-full flex items-center justify-center gap-2 px-3 py-3 border-2 border-dashed border-border rounded-xl text-sm text-text-secondary hover:border-brand-400 hover:text-brand-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {selecting ? (
                <span className="text-text-tertiary">Google 폴더 선택 중...</span>
              ) : (
                <>
                  <Folder size={16} />
                  <span>Google Drive 폴더 선택</span>
                </>
              )}
            </button>
          )}

          {!folder && !folderLoading && (
            <p className="text-xs text-text-tertiary mt-1.5">
              폴더 미설정 시 로컬 다운로드로 저장됩니다.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-border text-text-secondary hover:bg-surface-sunken transition-colors"
          >
            취소
          </button>
          <Button
            onClick={handleExport}
            disabled={exporting || folderLoading}
            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
          >
            {exporting ? '처리 중...' : folder ? <><Upload size={14} className="inline mr-1" />Drive에 저장</> : <><Download size={14} className="inline mr-1" />다운로드</>}
          </Button>
        </div>
      </div>
    </div>
  )
}
// ─── Types ────────────────────────────────────────────────────────────────────

interface ManagerJob {
  id: string
  assigned_to: string
  business_name: string
  service_type: string
  construction_date: string
  manager_pay: number | null
  unit_price_per_visit: number | null
  resolved_pay: number
}

interface WorkerJob {
  id: string
  worker_id: string
  business_name: string
  construction_date: string
  salary: number | null
  application_id: string | null
}

interface PayrollRecord {
  id: string
  year_month: string
  person_type: 'user' | 'worker'
  person_id: string
  auto_amount: number
  final_amount: number | null
  note: string | null
  is_paid: boolean
  paid_at: string | null
}

interface ManagerEntry {
  person: { id: string; name: string; role: string; phone: string | null; account_number: string | null }
  jobs: ManagerJob[]
  auto_amount: number
  record: PayrollRecord | undefined
}

interface WorkerEntry {
  person: { id: string; name: string; employment_type: string | null; day_wage: number | null; night_wage: number | null; avg_salary: number | null; phone: string | null; account_number: string | null }
  jobs: WorkerJob[]
  auto_amount: number
  record: PayrollRecord | undefined
}

interface UnitPriceApp {
  id: string
  business_name: string
  service_type: string
  construction_date: string | null
  unit_price_per_visit: number | null
  assigned_to: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString('ko-KR') + '원'
}

function fmtDate(s: string | null) {
  if (!s) return ''
  return s.slice(5).replace('-', '/')
}

function currentYM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCards({ entries, label }: {
  entries: Array<{ auto_amount: number; record: PayrollRecord | undefined }>
  label: string
}) {
  const autoTotal = entries.reduce((s, e) => s + e.auto_amount, 0)
  const finalTotal = entries.reduce((s, e) => s + (e.record?.final_amount ?? e.auto_amount), 0)
  const paidCount = entries.filter(e => e.record?.is_paid).length

  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      <div className="bg-surface rounded-xl border border-border-subtle p-3 text-center">
        <p className="text-xs text-text-tertiary mb-1">{label} 자동합계</p>
        <p className="text-base font-bold text-text-primary">{autoTotal.toLocaleString('ko-KR')}원</p>
      </div>
      <div className="bg-surface rounded-xl border border-brand-200 p-3 text-center">
        <p className="text-xs text-brand-500 mb-1">{label} 최종합계</p>
        <p className="text-base font-bold text-brand-700">{finalTotal.toLocaleString('ko-KR')}원</p>
      </div>
      <div className="bg-surface rounded-xl border border-state-success-bg p-3 text-center">
        <p className="text-xs text-state-success mb-1">지급완료</p>
        <p className="text-base font-bold text-state-success">{paidCount}/{entries.length}명</p>
      </div>
    </div>
  )
}

// ─── Manager Card ─────────────────────────────────────────────────────────────

function ManagerCard({
  entry,
  month,
  onUpdated,
  onRefresh,
}: {
  entry: ManagerEntry
  month: string
  onUpdated: (record: PayrollRecord) => void
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [finalInput, setFinalInput] = useState(entry.record?.final_amount?.toString() ?? '')
  const [noteInput, setNoteInput] = useState(entry.record?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState(false)
  const [jobPayEdits, setJobPayEdits] = useState<Record<string, string>>({})
  const [savingJob, setSavingJob] = useState<string | null>(null)

  const isPaid = entry.record?.is_paid ?? false
  const finalAmount = entry.record?.final_amount ?? entry.auto_amount

  const handleSave = async () => {
    setSaving(true)
    try {
      const finalVal = finalInput.trim() === '' ? null : Number(finalInput)
      const res = await fetch('/api/admin/payroll', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year_month: month,
          person_type: 'user',
          person_id: entry.person.id,
          auto_amount: entry.auto_amount,
          final_amount: finalVal,
          note: noteInput,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onUpdated(data.record)
      toast.success('저장되었습니다.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleTogglePaid = async () => {
    setPaying(true)
    try {
      const res = await fetch('/api/admin/payroll', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year_month: month,
          person_type: 'user',
          person_id: entry.person.id,
          auto_amount: entry.auto_amount,
          final_amount: finalInput.trim() === '' ? null : Number(finalInput),
          note: noteInput,
          is_paid: !isPaid,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onUpdated(data.record)
      toast.success(isPaid ? '지급 취소되었습니다.' : '지급 완료 처리되었습니다.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '처리 실패')
    } finally {
      setPaying(false)
    }
  }

  const handleJobPaySave = async (job: ManagerJob) => {
    const val = jobPayEdits[job.id]
    if (val === undefined) return
    setSavingJob(job.id)
    try {
      const res = await fetch('/api/admin/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: job.id, manager_pay: val === '' ? null : Number(val) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('단가 저장됨')
      setJobPayEdits(prev => {
        const next = { ...prev }
        delete next[job.id]
        return next
      })
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSavingJob(null)
    }
  }

  return (
    <div className={`bg-surface rounded-xl border ${isPaid ? 'border-state-success-bg' : 'border-border-subtle'} shadow-soft overflow-hidden`}>
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-text-primary">{entry.person.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-600">{entry.person.role === 'admin' ? '관리자' : '직원'}</span>
              {isPaid && <span className="text-xs px-2 py-0.5 rounded-full bg-state-success-bg text-state-success flex items-center gap-0.5"><CreditCard size={11} />지급완료</span>}
            </div>
            <p className="text-xs text-text-tertiary mt-0.5">{entry.jobs.length}건 · 자동 {fmt(entry.auto_amount)}</p>
            {(entry.person.phone || entry.person.account_number) && (
              <p className="text-xs text-text-tertiary mt-0.5">
                {entry.person.phone && <span>{entry.person.phone}</span>}
                {entry.person.phone && entry.person.account_number && <span className="mx-1">·</span>}
                {entry.person.account_number && <span className="font-mono">{entry.person.account_number}</span>}
              </p>
            )}
          </div>
          <button onClick={() => setExpanded(v => !v)} className="text-text-tertiary hover:text-text-secondary text-lg leading-none p-1">
            {expanded ? '▲' : '▼'}
          </button>
        </div>

        <div className="flex gap-2 mb-3">
          <div className="flex-1">
            <label className="text-xs text-text-tertiary mb-1 block">최종 지급액</label>
            <input
              type="number"
              value={finalInput}
              onChange={e => setFinalInput(e.target.value)}
              placeholder={`${entry.auto_amount.toLocaleString('ko-KR')} (자동)`}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-text-tertiary mb-1 block">메모</label>
            <input
              type="text"
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              placeholder="조정 사유 등"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            variant="secondary"
            className="flex-1 py-2 bg-gray-800 text-white hover:bg-gray-700"
          >
            {saving ? '저장 중...' : '저장'}
          </Button>
          <button
            onClick={handleTogglePaid}
            disabled={paying}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 ${
              isPaid
                ? 'bg-surface-sunken text-text-secondary hover:bg-surface-sunken'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {paying ? '처리 중...' : isPaid ? '지급 취소' : <><CreditCard size={14} className="inline mr-1" />지급완료</>}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border-subtle">
          {entry.jobs.length === 0 ? (
            <p className="text-xs text-text-tertiary text-center py-4">일정 없음</p>
          ) : (
            <div className="divide-y divide-border-subtle">
              {entry.jobs.map(job => {
                const editVal = jobPayEdits[job.id]
                const isEditing = editVal !== undefined
                return (
                  <div key={job.id} className="px-4 py-2.5 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-text-tertiary font-mono">{fmtDate(job.construction_date)}</span>
                        <span className="text-xs text-text-tertiary">·</span>
                        <span className="text-xs text-text-secondary">{job.service_type}</span>
                      </div>
                      <p className="text-sm font-medium text-text-primary truncate">{job.business_name}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isEditing ? (
                        <>
                          <input
                            type="number"
                            value={editVal}
                            onChange={e => setJobPayEdits(prev => ({ ...prev, [job.id]: e.target.value }))}
                            className="w-24 px-2 py-1 border border-blue-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="금액"
                            autoFocus
                          />
                          <Button
                            onClick={() => handleJobPaySave(job)}
                            disabled={savingJob === job.id}
                            size="sm"
                          >
                            {savingJob === job.id ? '...' : '저장'}
                          </Button>
                          <button
                            onClick={() => setJobPayEdits(prev => { const n = { ...prev }; delete n[job.id]; return n })}
                            className="text-xs text-text-tertiary hover:text-text-secondary"
                          >
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          <span className={`text-sm font-semibold ${job.resolved_pay > 0 ? 'text-orange-600' : 'text-text-tertiary'}`}>
                            {job.resolved_pay > 0 ? job.resolved_pay.toLocaleString('ko-KR') + '원' : '미설정'}
                          </span>
                          <button
                            onClick={() => setJobPayEdits(prev => ({ ...prev, [job.id]: String(job.manager_pay ?? job.unit_price_per_visit ?? '') }))}
                            className="text-xs text-text-tertiary hover:text-brand-600 px-1"
                          >
                            <Pencil size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="px-4 py-2 bg-orange-50 flex justify-between items-center border-t border-orange-100">
            <span className="text-xs text-orange-700">건별 합계</span>
            <span className="text-sm font-bold text-orange-700">{entry.auto_amount.toLocaleString('ko-KR')}원</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Worker Card ──────────────────────────────────────────────────────────────

function WorkerCard({
  entry,
  month,
  onUpdated,
  onRefresh,
}: {
  entry: WorkerEntry
  month: string
  onUpdated: (record: PayrollRecord) => void
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [finalInput, setFinalInput] = useState(entry.record?.final_amount?.toString() ?? '')
  const [noteInput, setNoteInput] = useState(entry.record?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState(false)
  const [jobSalaryEdits, setJobSalaryEdits] = useState<Record<string, string>>({})
  const [savingJob, setSavingJob] = useState<string | null>(null)

  const isPaid = entry.record?.is_paid ?? false

  const handleSave = async () => {
    setSaving(true)
    try {
      const finalVal = finalInput.trim() === '' ? null : Number(finalInput)
      const res = await fetch('/api/admin/payroll', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year_month: month,
          person_type: 'worker',
          person_id: entry.person.id,
          auto_amount: entry.auto_amount,
          final_amount: finalVal,
          note: noteInput,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onUpdated(data.record)
      toast.success('저장되었습니다.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleTogglePaid = async () => {
    setPaying(true)
    try {
      const res = await fetch('/api/admin/payroll', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year_month: month,
          person_type: 'worker',
          person_id: entry.person.id,
          auto_amount: entry.auto_amount,
          final_amount: finalInput.trim() === '' ? null : Number(finalInput),
          note: noteInput,
          is_paid: !isPaid,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onUpdated(data.record)
      toast.success(isPaid ? '지급 취소되었습니다.' : '지급 완료 처리되었습니다.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '처리 실패')
    } finally {
      setPaying(false)
    }
  }

  const handleJobSalarySave = async (job: WorkerJob) => {
    const val = jobSalaryEdits[job.id]
    if (val === undefined) return
    setSavingJob(job.id)
    try {
      const res = await fetch('/api/admin/work-assignments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: job.id, salary: val === '' ? null : Number(val) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('급여 저장됨')
      setJobSalaryEdits(prev => {
        const next = { ...prev }
        delete next[job.id]
        return next
      })
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSavingJob(null)
    }
  }

  return (
    <div className={`bg-surface rounded-xl border ${isPaid ? 'border-state-success-bg' : 'border-border-subtle'} shadow-soft overflow-hidden`}>
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-text-primary">{entry.person.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">{entry.person.employment_type ?? '기타'}</span>
              {isPaid && <span className="text-xs px-2 py-0.5 rounded-full bg-state-success-bg text-state-success flex items-center gap-0.5"><CreditCard size={11} />지급완료</span>}
            </div>
            <p className="text-xs text-text-tertiary mt-0.5">{entry.jobs.length}건 · 자동 {fmt(entry.auto_amount)}</p>
            {(entry.person.phone || entry.person.account_number) && (
              <p className="text-xs text-text-tertiary mt-0.5">
                {entry.person.phone && <span>{entry.person.phone}</span>}
                {entry.person.phone && entry.person.account_number && <span className="mx-1">·</span>}
                {entry.person.account_number && <span className="font-mono">{entry.person.account_number}</span>}
              </p>
            )}
          </div>
          <button onClick={() => setExpanded(v => !v)} className="text-text-tertiary hover:text-text-secondary text-lg leading-none p-1">
            {expanded ? '▲' : '▼'}
          </button>
        </div>

        {entry.person.employment_type === '정직원' ? (
          <div className="mb-3 px-3 py-2 bg-amber-50 rounded-lg">
            <p className="text-xs text-amber-700">월급 참고: <span className="font-semibold">{fmt(entry.person.avg_salary)}</span></p>
          </div>
        ) : entry.person.day_wage || entry.person.night_wage ? (
          <div className="mb-3 px-3 py-2 bg-amber-50 rounded-lg">
            <p className="text-xs text-amber-700">
              주간 <span className="font-semibold">{fmt(entry.person.day_wage)}</span>
              <span className="mx-1.5 text-amber-300">·</span>
              야간 <span className="font-semibold">{fmt(entry.person.night_wage)}</span>
              <span className="ml-1 text-amber-500">(참고용)</span>
            </p>
          </div>
        ) : null}

        <div className="flex gap-2 mb-3">
          <div className="flex-1">
            <label className="text-xs text-text-tertiary mb-1 block">최종 지급액</label>
            <input
              type="number"
              value={finalInput}
              onChange={e => setFinalInput(e.target.value)}
              placeholder={`${entry.auto_amount.toLocaleString('ko-KR')} (자동)`}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-text-tertiary mb-1 block">메모</label>
            <input
              type="text"
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              placeholder="조정 사유 등"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            variant="secondary"
            className="flex-1 py-2 bg-gray-800 text-white hover:bg-gray-700"
          >
            {saving ? '저장 중...' : '저장'}
          </Button>
          <button
            onClick={handleTogglePaid}
            disabled={paying}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 ${
              isPaid
                ? 'bg-surface-sunken text-text-secondary hover:bg-surface-sunken'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {paying ? '처리 중...' : isPaid ? '지급 취소' : <><CreditCard size={14} className="inline mr-1" />지급완료</>}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border-subtle">
          {entry.jobs.length === 0 ? (
            <p className="text-xs text-text-tertiary text-center py-4">배정 없음</p>
          ) : (
            <div className="divide-y divide-border-subtle">
              {entry.jobs.map(job => {
                const editVal = jobSalaryEdits[job.id]
                const isEditing = editVal !== undefined
                return (
                  <div key={job.id} className="px-4 py-2.5 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-text-tertiary font-mono">{fmtDate(job.construction_date)}</span>
                      <p className="text-sm font-medium text-text-primary truncate">{job.business_name}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isEditing ? (
                        <>
                          <input
                            type="number"
                            value={editVal}
                            onChange={e => setJobSalaryEdits(prev => ({ ...prev, [job.id]: e.target.value }))}
                            className="w-24 px-2 py-1 border border-blue-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="금액"
                            autoFocus
                          />
                          <Button
                            onClick={() => handleJobSalarySave(job)}
                            disabled={savingJob === job.id}
                            size="sm"
                          >
                            {savingJob === job.id ? '...' : '저장'}
                          </Button>
                          <button
                            onClick={() => setJobSalaryEdits(prev => { const n = { ...prev }; delete n[job.id]; return n })}
                            className="text-xs text-text-tertiary hover:text-text-secondary"
                          >
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          <span className={`text-sm font-semibold ${(job.salary ?? 0) > 0 ? 'text-orange-600' : 'text-text-tertiary'}`}>
                            {(job.salary ?? 0) > 0 ? (job.salary!).toLocaleString('ko-KR') + '원' : '미설정'}
                          </span>
                          <button
                            onClick={() => setJobSalaryEdits(prev => ({ ...prev, [job.id]: String(job.salary ?? '') }))}
                            className="text-xs text-text-tertiary hover:text-brand-600 px-1"
                          >
                            <Pencil size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="px-4 py-2 bg-orange-50 flex justify-between items-center border-t border-orange-100">
            <span className="text-xs text-orange-700">건별 합계</span>
            <span className="text-sm font-bold text-orange-700">{entry.auto_amount.toLocaleString('ko-KR')}원</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Unit Price Settings ──────────────────────────────────────────────────────

function getPrevMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface CustomerGroup {
  business_name: string
  service_type: string
  applicationIds: string[]
  base_unit_price: number | null
  first_app_id: string
}

function UnitPriceSettings({ month }: { month: string }) {
  const [apps, setApps] = useState<UnitPriceApp[]>([])
  const [monthlyPrices, setMonthlyPrices] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [carryingOver, setCarryingOver] = useState(false)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const displayMonth = (() => {
    const [y, m] = month.split('-')
    return `${y}년 ${Number(m)}월`
  })()

  const loadData = useCallback(async () => {
    setLoading(true)
    setEdits({})
    try {
      const [appsRes, pricesRes] = await Promise.all([
        fetch('/api/admin/applications?limit=200').then(r => r.json()),
        fetch(`/api/admin/unit-price-monthly?month=${month}`).then(r => r.json()),
      ])

      const list: UnitPriceApp[] = (appsRes.applications ?? []).filter(
        (a: UnitPriceApp) => a.service_type === '정기딥케어' || a.service_type === '정기엔드케어'
      )
      setApps(list)

      const priceMap = new Map<string, number>()
      for (const p of (pricesRes.prices ?? [])) {
        priceMap.set(p.application_id, p.unit_price)
      }

      // 이번 달 데이터가 없으면 전달에서 자동 이관
      if ((pricesRes.prices ?? []).length === 0 && list.length > 0) {
        const prevMonth = getPrevMonth(month)
        const prevRes = await fetch(`/api/admin/unit-price-monthly?month=${prevMonth}`).then(r => r.json())
        if ((prevRes.prices ?? []).length > 0) {
          setCarryingOver(true)
          const carryRes = await fetch('/api/admin/unit-price-monthly', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ month, from_month: prevMonth }),
          }).then(r => r.json())

          if ((carryRes.inserted ?? 0) > 0) {
            const newPricesRes = await fetch(`/api/admin/unit-price-monthly?month=${month}`).then(r => r.json())
            for (const p of (newPricesRes.prices ?? [])) {
              priceMap.set(p.application_id, p.unit_price)
            }
            const prevLabel = prevMonth.replace('-', '년 ') + '월'
            toast.success(`${prevLabel} 단가 자동 이관 완료 (${carryRes.inserted}건)`)
          }
          setCarryingOver(false)
        }
      }

      setMonthlyPrices(priceMap)
    } catch {
      toast.error('데이터 불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => { loadData() }, [loadData])

  // 업체명별 그룹핑
  const groups: CustomerGroup[] = (() => {
    const map = new Map<string, CustomerGroup>()
    for (const app of apps) {
      const existing = map.get(app.business_name)
      if (existing) {
        existing.applicationIds.push(app.id)
      } else {
        map.set(app.business_name, {
          business_name: app.business_name,
          service_type: app.service_type,
          applicationIds: [app.id],
          base_unit_price: app.unit_price_per_visit,
          first_app_id: app.id,
        })
      }
    }
    return Array.from(map.values())
  })()

  // 그룹의 이번 달 단가 (월별 설정 > 계약 기본단가 순)
  const getGroupPrice = (group: CustomerGroup): { price: number | null; isMonthly: boolean } => {
    const monthly = monthlyPrices.get(group.first_app_id)
    if (monthly !== undefined) return { price: monthly || null, isMonthly: true }
    return { price: group.base_unit_price, isMonthly: false }
  }

  const handleSave = async (group: CustomerGroup) => {
    const val = edits[group.business_name]
    if (val === undefined) return
    setSaving(group.business_name)
    try {
      const unitPrice = val === '' ? 0 : Number(val)
      await Promise.all(
        group.applicationIds.map(appId =>
          fetch('/api/admin/unit-price-monthly', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ application_id: appId, year_month: month, unit_price: unitPrice }),
          }).then(r => r.json()).then(d => {
            if (d.error) throw new Error(d.error)
          })
        )
      )
      setMonthlyPrices(prev => {
        const next = new Map(prev)
        group.applicationIds.forEach(id => next.set(id, unitPrice))
        return next
      })
      setEdits(prev => { const n = { ...prev }; delete n[group.business_name]; return n })
      toast.success('단가 저장됨')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(null)
    }
  }

  const filtered = groups.filter(g =>
    !search || g.business_name.toLowerCase().includes(search.toLowerCase())
  )

  if (loading || carryingOver) {
    return (
      <div className="text-center py-12 text-sm text-text-tertiary">
        {carryingOver ? '이전달 단가 이관 중...' : '불러오는 중...'}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 px-1">
        <p className="text-xs text-text-secondary mb-1">
          <span className="font-semibold text-brand-600">{displayMonth}</span> 방문당 단가 설정
        </p>
        <p className="text-xs text-text-tertiary mb-3">
          이전달 단가가 자동 이관됩니다. 변경이 필요한 항목만 수정하세요.
        </p>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="업체명 검색..."
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="flex justify-center mb-2"><Banknote size={32} /></div>
          <p className="text-sm text-text-tertiary">정기 서비스 계약이 없습니다.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(group => {
            const editVal = edits[group.business_name]
            const isEditing = editVal !== undefined
            const { price, isMonthly } = getGroupPrice(group)
            return (
              <div key={group.business_name} className="bg-surface rounded-xl border border-border-subtle shadow-soft p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">{group.business_name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full">{group.service_type}</span>
                      <span className="text-xs text-text-tertiary">{group.applicationIds.length}건</span>
                      {isMonthly && (
                        <span className="text-xs bg-orange-50 text-orange-500 px-2 py-0.5 rounded-full">이달 설정</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isEditing ? (
                      <>
                        <input
                          type="number"
                          value={editVal}
                          onChange={e => setEdits(prev => ({ ...prev, [group.business_name]: e.target.value }))}
                          className="w-28 px-2 py-1.5 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="금액"
                          autoFocus
                        />
                        <Button
                          onClick={() => handleSave(group)}
                          disabled={saving === group.business_name}
                          size="sm"
                        >
                          {saving === group.business_name ? '...' : '저장'}
                        </Button>
                        <button
                          onClick={() => setEdits(prev => { const n = { ...prev }; delete n[group.business_name]; return n })}
                          className="text-xs text-text-tertiary hover:text-text-secondary"
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="text-right">
                          <span className={`text-sm font-bold ${price ? 'text-orange-600' : 'text-text-tertiary'}`}>
                            {price ? price.toLocaleString('ko-KR') + '원' : '미설정'}
                          </span>
                          {!isMonthly && price && (
                            <p className="text-xs text-text-tertiary">(기본단가)</p>
                          )}
                        </div>
                        <button
                          onClick={() => setEdits(prev => ({ ...prev, [group.business_name]: String(price ?? '') }))}
                          className="text-xs text-text-tertiary hover:text-brand-600 px-1"
                        >
                          <Pencil size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PayrollPage() {
  const [month, setMonth] = useState(currentYM)
  const [tab, setTab] = useState<'payroll' | 'unit_price'>('payroll')
  const [personFilter, setPersonFilter] = useState<'all' | 'manager' | 'worker'>('all')
  const [loading, setLoading] = useState(false)
  const [managers, setManagers] = useState<ManagerEntry[]>([])
  const [workersPayroll, setWorkersPayroll] = useState<WorkerEntry[]>([])
  const [showExport, setShowExport] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/payroll?month=${month}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '불러오기 실패')
      setManagers(data.managers ?? [])
      setWorkersPayroll(data.workers_payroll ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '데이터 불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => { fetchData() }, [fetchData])

  const prevMonth = () => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const nextMonth = () => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const handleManagerRecordUpdated = (record: PayrollRecord) => {
    setManagers(prev => prev.map(e =>
      e.person.id === record.person_id ? { ...e, record } : e
    ))
  }

  const handleWorkerRecordUpdated = (record: PayrollRecord) => {
    setWorkersPayroll(prev => prev.map(e =>
      e.person.id === record.person_id ? { ...e, record } : e
    ))
  }

  const displayMonth = (() => {
    const [y, m] = month.split('-')
    return `${y}년 ${Number(m)}월`
  })()

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {/* Month selector - 항상 표시 */}
        <div className="flex items-center justify-between my-4">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-surface-sunken text-text-secondary transition-colors">‹</button>
          <div className="text-center">
            <h2 className="text-base font-bold text-text-primary">{displayMonth}</h2>
            <p className="text-xs text-text-tertiary">급여 정산</p>
          </div>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-surface-sunken text-text-secondary transition-colors">›</button>
        </div>

        {/* Sub-tab selector */}
        <div className="flex gap-1 bg-surface-sunken rounded-xl p-1 mb-4">
          <button
            onClick={() => setTab('payroll')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'payroll' ? 'bg-surface text-text-primary shadow-soft' : 'text-text-secondary'}`}
          >
            <Banknote size={14} className="inline mr-1" />급여정산
          </button>
          <button
            onClick={() => setTab('unit_price')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'unit_price' ? 'bg-surface text-text-primary shadow-soft' : 'text-text-secondary'}`}
          >
            <Tag size={14} className="inline mr-1" />단가 설정
          </button>
        </div>

        {showExport && (
          <ExportModal
            month={month}
            displayMonth={displayMonth}
            onClose={() => setShowExport(false)}
          />
        )}

        {tab === 'payroll' ? (
          <>
            {/* 급여정산 현황 저장 버튼 */}
            <button
              onClick={() => setShowExport(true)}
              className="w-full mb-4 py-2.5 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 shadow-soft"
            >
              <BarChart2 size={14} className="inline mr-1" />급여 지급 현황 저장
            </button>

            {/* 인원 필터 버튼 */}
            <div className="flex gap-2 mb-4">
              {(['all', 'manager', 'worker'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setPersonFilter(f)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    personFilter === f
                      ? 'bg-brand-600 text-white'
                      : 'bg-surface-sunken text-text-secondary'
                  }`}
                >
                  {f === 'all' ? '전체' : f === 'manager' ? '담당자' : '작업자'}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="text-center py-12">
                <p className="text-sm text-text-tertiary">불러오는 중...</p>
              </div>
            ) : (
              <>
                {/* 담당자 섹션 */}
                {(personFilter === 'all' || personFilter === 'manager') && (
                  <>
                    {managers.length > 0 ? (
                      <>
                        <div className="flex items-center gap-2 mb-3">
                          <h3 className="text-sm font-bold text-text-primary">담당자</h3>
                          <span className="text-xs bg-brand-100 text-brand-600 px-2 py-0.5 rounded-full">{managers.length}명</span>
                        </div>
                        <SummaryCards entries={managers} label="담당자" />
                        <div className="flex flex-col gap-3 mb-6">
                          {managers.map(entry => (
                            <ManagerCard
                              key={entry.person.id}
                              entry={entry}
                              month={month}
                              onUpdated={handleManagerRecordUpdated}
                              onRefresh={fetchData}
                            />
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-6 text-sm text-text-tertiary mb-4">
                        {displayMonth} 담당자 배정 없음
                      </div>
                    )}
                  </>
                )}

                {/* 작업자 섹션 */}
                {(personFilter === 'all' || personFilter === 'worker') && (
                  <>
                    {workersPayroll.length > 0 ? (
                      <>
                        <div className="flex items-center gap-2 mb-3">
                          <h3 className="text-sm font-bold text-text-primary">작업자</h3>
                          <span className="text-xs bg-state-warning-bg text-state-warning px-2 py-0.5 rounded-full">{workersPayroll.length}명</span>
                        </div>
                        <SummaryCards entries={workersPayroll} label="작업자" />
                        <div className="flex flex-col gap-3">
                          {workersPayroll.map(entry => (
                            <WorkerCard
                              key={entry.person.id}
                              entry={entry}
                              month={month}
                              onUpdated={handleWorkerRecordUpdated}
                              onRefresh={fetchData}
                            />
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-6 text-sm text-text-tertiary">
                        {displayMonth} 작업자 배정 없음
                      </div>
                    )}
                  </>
                )}

                {managers.length === 0 && workersPayroll.length === 0 && (
                  <div className="text-center py-12">
                    <div className="flex justify-center mb-2"><ClipboardList size={32} /></div>
                    <p className="text-sm text-text-tertiary">{displayMonth} 급여 데이터가 없습니다.</p>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <UnitPriceSettings month={month} />
        )}
      </div>
    </div>
  )
}
