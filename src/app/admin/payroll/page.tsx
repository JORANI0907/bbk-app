'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ManagerJob {
  id: string
  assigned_to: string
  business_name: string
  service_type: string
  construction_date: string
  manager_pay: number | null
  unit_price_per_visit: number | null
  resolved_pay: number  // 서버에서 계산된 실제 건당급여 (manager_pay → unit_price_per_visit → 고객DB 순)
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
  person: { id: string; name: string; role: string; phone: string | null }
  jobs: ManagerJob[]
  auto_amount: number
  record: PayrollRecord | undefined
}

interface WorkerEntry {
  person: { id: string; name: string; employment_type: string | null; day_wage: number | null; night_wage: number | null; avg_salary: number | null; phone: string | null }
  jobs: WorkerJob[]
  auto_amount: number
  record: PayrollRecord | undefined
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

function jobPay(job: ManagerJob): number {
  return job.manager_pay ?? (job.service_type === '정기엔드케어' ? (job.unit_price_per_visit ?? 0) : 0)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCards({ entries, label }: {
  entries: Array<{ auto_amount: number; record: PayrollRecord | undefined }>
  label: string
}) {
  const autoTotal = entries.reduce((s, e) => s + e.auto_amount, 0)
  const finalTotal = entries.reduce((s, e) => s + (e.record?.final_amount ?? e.auto_amount), 0)
  const paidCount = entries.filter(e => e.record?.is_paid).length

  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
        <p className="text-xs text-gray-400 mb-1">자동계산합계</p>
        <p className="text-base font-bold text-gray-800">{autoTotal.toLocaleString('ko-KR')}원</p>
      </div>
      <div className="bg-white rounded-xl border border-blue-100 p-3 text-center">
        <p className="text-xs text-blue-400 mb-1">최종합계</p>
        <p className="text-base font-bold text-blue-700">{finalTotal.toLocaleString('ko-KR')}원</p>
      </div>
      <div className="bg-white rounded-xl border border-green-100 p-3 text-center">
        <p className="text-xs text-green-400 mb-1">지급완료</p>
        <p className="text-base font-bold text-green-700">{paidCount}/{entries.length}명</p>
      </div>
    </div>
  )
}

// ─── Manager Card ─────────────────────────────────────────────────────────────

function ManagerCard({
  entry,
  month,
  onUpdated,
}: {
  entry: ManagerEntry
  month: string
  onUpdated: (record: PayrollRecord) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [finalInput, setFinalInput] = useState(entry.record?.final_amount?.toString() ?? '')
  const [noteInput, setNoteInput] = useState(entry.record?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState(false)
  // per-job manager_pay editing
  const [jobPayEdits, setJobPayEdits] = useState<Record<string, string>>({})
  const [savingJob, setSavingJob] = useState<string | null>(null)

  const isPaid = entry.record?.is_paid ?? false
  const finalAmount = entry.record?.final_amount ?? entry.auto_amount
  const displayFinal = finalInput !== '' ? Number(finalInput) : entry.auto_amount

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
      // Clear edit state
      setJobPayEdits(prev => {
        const next = { ...prev }
        delete next[job.id]
        return next
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSavingJob(null)
    }
  }

  return (
    <div className={`bg-white rounded-xl border ${isPaid ? 'border-green-200' : 'border-gray-100'} shadow-sm overflow-hidden`}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">{entry.person.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{entry.person.role === 'admin' ? '관리자' : '직원'}</span>
              {isPaid && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">💳 지급완료</span>}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{entry.jobs.length}건 · 자동 {fmt(entry.auto_amount)}</p>
          </div>
          <button onClick={() => setExpanded(v => !v)} className="text-gray-400 hover:text-gray-600 text-lg leading-none p-1">
            {expanded ? '▲' : '▼'}
          </button>
        </div>

        {/* Final amount + note row */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-1 block">최종 지급액</label>
            <input
              type="number"
              value={finalInput}
              onChange={e => setFinalInput(e.target.value)}
              placeholder={`${entry.auto_amount.toLocaleString('ko-KR')} (자동)`}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-1 block">메모</label>
            <input
              type="text"
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              placeholder="조정 사유 등"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 bg-gray-800 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-60 transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
          <button
            onClick={handleTogglePaid}
            disabled={paying}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 ${
              isPaid
                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {paying ? '처리 중...' : isPaid ? '지급 취소' : '💳 지급완료'}
          </button>
        </div>
      </div>

      {/* Expanded job list */}
      {expanded && (
        <div className="border-t border-gray-100">
          {entry.jobs.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">일정 없음</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {entry.jobs.map(job => {
                const editVal = jobPayEdits[job.id]
                const isEditing = editVal !== undefined
                return (
                  <div key={job.id} className="px-4 py-2.5 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400 font-mono">{fmtDate(job.construction_date)}</span>
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs text-gray-500">{job.service_type}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-800 truncate">{job.business_name}</p>
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
                          <button
                            onClick={() => handleJobPaySave(job)}
                            disabled={savingJob === job.id}
                            className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-60"
                          >
                            {savingJob === job.id ? '...' : '저장'}
                          </button>
                          <button
                            onClick={() => setJobPayEdits(prev => { const n = { ...prev }; delete n[job.id]; return n })}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          <span className={`text-sm font-semibold ${job.resolved_pay > 0 ? 'text-orange-600' : 'text-gray-300'}`}>
                            {job.resolved_pay > 0 ? job.resolved_pay.toLocaleString('ko-KR') + '원' : '미설정'}
                          </span>
                          <button
                            onClick={() => setJobPayEdits(prev => ({ ...prev, [job.id]: String(job.manager_pay ?? job.unit_price_per_visit ?? '') }))}
                            className="text-xs text-gray-400 hover:text-blue-600 px-1"
                          >
                            ✏️
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {/* Job total */}
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
}: {
  entry: WorkerEntry
  month: string
  onUpdated: (record: PayrollRecord) => void
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSavingJob(null)
    }
  }

  return (
    <div className={`bg-white rounded-xl border ${isPaid ? 'border-green-200' : 'border-gray-100'} shadow-sm overflow-hidden`}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">{entry.person.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">{entry.person.employment_type ?? '기타'}</span>
              {isPaid && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">💳 지급완료</span>}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{entry.jobs.length}건 · 자동 {fmt(entry.auto_amount)}</p>
          </div>
          <button onClick={() => setExpanded(v => !v)} className="text-gray-400 hover:text-gray-600 text-lg leading-none p-1">
            {expanded ? '▲' : '▼'}
          </button>
        </div>

        {/* Reference wage info */}
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

        {/* Final amount + note */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-1 block">최종 지급액</label>
            <input
              type="number"
              value={finalInput}
              onChange={e => setFinalInput(e.target.value)}
              placeholder={`${entry.auto_amount.toLocaleString('ko-KR')} (자동)`}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-1 block">메모</label>
            <input
              type="text"
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              placeholder="조정 사유 등"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 bg-gray-800 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-60 transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
          <button
            onClick={handleTogglePaid}
            disabled={paying}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 ${
              isPaid
                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {paying ? '처리 중...' : isPaid ? '지급 취소' : '💳 지급완료'}
          </button>
        </div>
      </div>

      {/* Expanded job list */}
      {expanded && (
        <div className="border-t border-gray-100">
          {entry.jobs.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">배정 없음</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {entry.jobs.map(job => {
                const editVal = jobSalaryEdits[job.id]
                const isEditing = editVal !== undefined
                return (
                  <div key={job.id} className="px-4 py-2.5 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-gray-400 font-mono">{fmtDate(job.construction_date)}</span>
                      <p className="text-sm font-medium text-gray-800 truncate">{job.business_name}</p>
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
                          <button
                            onClick={() => handleJobSalarySave(job)}
                            disabled={savingJob === job.id}
                            className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-60"
                          >
                            {savingJob === job.id ? '...' : '저장'}
                          </button>
                          <button
                            onClick={() => setJobSalaryEdits(prev => { const n = { ...prev }; delete n[job.id]; return n })}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          <span className={`text-sm font-semibold ${(job.salary ?? 0) > 0 ? 'text-orange-600' : 'text-gray-300'}`}>
                            {(job.salary ?? 0) > 0 ? (job.salary!).toLocaleString('ko-KR') + '원' : '미설정'}
                          </span>
                          <button
                            onClick={() => setJobSalaryEdits(prev => ({ ...prev, [job.id]: String(job.salary ?? '') }))}
                            className="text-xs text-gray-400 hover:text-blue-600 px-1"
                          >
                            ✏️
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PayrollPage() {
  const [month, setMonth] = useState(currentYM)
  const [tab, setTab] = useState<'manager' | 'worker'>('manager')
  const [loading, setLoading] = useState(false)
  const [managers, setManagers] = useState<ManagerEntry[]>([])
  const [workersPayroll, setWorkersPayroll] = useState<WorkerEntry[]>([])

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
      {/* Tab nav */}
      <div className="flex gap-1.5 px-4 pt-4">
        <a href="/admin/workers" className="px-4 py-2 text-gray-600 hover:bg-gray-100 text-sm font-medium rounded-xl transition-colors">👷 직원정보</a>
        <span className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl">💰 급여정산</span>
        <a href="/admin/members" className="px-4 py-2 text-gray-600 hover:bg-gray-100 text-sm font-medium rounded-xl transition-colors">🔑 계정관리</a>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {/* Month selector */}
        <div className="flex items-center justify-between my-4">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">‹</button>
          <div className="text-center">
            <h2 className="text-base font-bold text-gray-900">{displayMonth}</h2>
            <p className="text-xs text-gray-400">급여 정산</p>
          </div>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">›</button>
        </div>

        {/* Person type tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4">
          <button
            onClick={() => setTab('manager')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'manager' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            담당자 ({managers.length}명)
          </button>
          <button
            onClick={() => setTab('worker')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'worker' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            작업자 ({workersPayroll.length}명)
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-sm text-gray-400">불러오는 중...</p>
          </div>
        ) : tab === 'manager' ? (
          <>
            {managers.length > 0 && <SummaryCards entries={managers} label="담당자" />}
            {managers.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-2xl mb-2">📋</p>
                <p className="text-sm text-gray-400">{displayMonth} 담당자 배정 없음</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {managers.map(entry => (
                  <ManagerCard
                    key={entry.person.id}
                    entry={entry}
                    month={month}
                    onUpdated={handleManagerRecordUpdated}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {workersPayroll.length > 0 && <SummaryCards entries={workersPayroll} label="작업자" />}
            {workersPayroll.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-2xl mb-2">👷</p>
                <p className="text-sm text-gray-400">{displayMonth} 작업자 배정 없음</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {workersPayroll.map(entry => (
                  <WorkerCard
                    key={entry.person.id}
                    entry={entry}
                    month={month}
                    onUpdated={handleWorkerRecordUpdated}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
