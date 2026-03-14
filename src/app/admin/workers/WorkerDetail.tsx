'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import type { Worker, WorkAssignment } from './constants'

interface Props {
  worker: Worker
  onWorkerUpdated: (w: Worker) => void
  onWorkerDeleted: (id: string) => void
}

function Field({ label, value, onChange, type = 'text', mono }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; mono?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 ${mono ? 'font-mono' : ''}`}
      />
    </div>
  )
}

function SelectField({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">선택</option>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  )
}

export default function WorkerDetail({ worker, onWorkerUpdated, onWorkerDeleted }: Props) {
  const [form, setForm] = useState({
    name: worker.name ?? '',
    employment_type: worker.employment_type ?? '',
    phone: worker.phone ?? '',
    account_number: worker.account_number ?? '',
    skill_level: worker.skill_level ?? '',
    specialties: worker.specialties ?? '',
    day_wage: worker.day_wage?.toString() ?? '',
    night_wage: worker.night_wage?.toString() ?? '',
    department: worker.department ?? '',
    position: worker.position ?? '',
    job_title: worker.job_title ?? '',
    avg_salary: worker.avg_salary?.toString() ?? '',
    email: worker.email ?? '',
    join_date: worker.join_date ?? '',
    emergency_contact: worker.emergency_contact ?? '',
    anniversary: worker.anniversary ?? '',
    hobby: worker.hobby ?? '',
    home_address: worker.home_address ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [extraExpanded, setExtraExpanded] = useState(false)
  const [assignments, setAssignments] = useState<WorkAssignment[]>([])
  const [assLoading, setAssLoading] = useState(false)
  const [showAddAss, setShowAddAss] = useState(false)
  const [newAss, setNewAss] = useState({ construction_date: '', business_name: '', salary: '' })
  const [salarySaving, setSalarySaving] = useState<Record<string, boolean>>({})
  const [salaryEdits, setSalaryEdits] = useState<Record<string, string>>({})

  // Reset form when worker changes
  useEffect(() => {
    setForm({
      name: worker.name ?? '',
      employment_type: worker.employment_type ?? '',
      phone: worker.phone ?? '',
      account_number: worker.account_number ?? '',
      skill_level: worker.skill_level ?? '',
      specialties: worker.specialties ?? '',
      day_wage: worker.day_wage?.toString() ?? '',
      night_wage: worker.night_wage?.toString() ?? '',
      department: worker.department ?? '',
      position: worker.position ?? '',
      job_title: worker.job_title ?? '',
      avg_salary: worker.avg_salary?.toString() ?? '',
      email: worker.email ?? '',
      join_date: worker.join_date ?? '',
      emergency_contact: worker.emergency_contact ?? '',
      anniversary: worker.anniversary ?? '',
      hobby: worker.hobby ?? '',
      home_address: worker.home_address ?? '',
    })
    setExtraExpanded(false)
    setShowAddAss(false)
  }, [worker.id])

  const fetchAssignments = useCallback(async () => {
    setAssLoading(true)
    try {
      const res = await fetch(`/api/admin/work-assignments?worker_id=${worker.id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '이력 로드 실패')
      const list: WorkAssignment[] = json.assignments ?? []
      setAssignments(list)
      const edits: Record<string, string> = {}
      list.forEach(a => { edits[a.id] = a.salary?.toString() ?? '' })
      setSalaryEdits(edits)
    } catch {
      toast.error('출력 이력 로드 실패')
    } finally {
      setAssLoading(false)
    }
  }, [worker.id])

  useEffect(() => { fetchAssignments() }, [fetchAssignments])

  const setField = (key: keyof typeof form) => (v: string) =>
    setForm(prev => ({ ...prev, [key]: v }))

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('이름을 입력하세요.'); return }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        id: worker.id,
        name: form.name.trim(),
        employment_type: form.employment_type || null,
        phone: form.phone || null,
        account_number: form.account_number || null,
        specialties: form.specialties || null,
        anniversary: form.anniversary || null,
        hobby: form.hobby || null,
        home_address: form.home_address || null,
      }
      const isPartTime = form.employment_type !== '정직원'
      if (isPartTime) {
        body.skill_level = form.skill_level || null
        body.day_wage = form.day_wage ? Number(form.day_wage) : null
        body.night_wage = form.night_wage ? Number(form.night_wage) : null
        body.department = null; body.position = null; body.job_title = null
        body.avg_salary = null; body.email = null; body.join_date = null
        body.emergency_contact = null
      } else {
        body.department = form.department || null
        body.position = form.position || null
        body.job_title = form.job_title || null
        body.avg_salary = form.avg_salary ? Number(form.avg_salary) : null
        body.email = form.email || null
        body.join_date = form.join_date || null
        body.emergency_contact = form.emergency_contact || null
        body.skill_level = null; body.day_wage = null; body.night_wage = null
      }

      const res = await fetch('/api/admin/workers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '저장 실패')
      toast.success('저장되었습니다.')
      onWorkerUpdated({ ...worker, ...body } as Worker)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`${worker.name}을(를) 삭제하시겠습니까?`)) return
    try {
      const res = await fetch('/api/admin/workers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: worker.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '삭제 실패')
      toast.success('삭제되었습니다.')
      onWorkerDeleted(worker.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  const handleSaveSalary = async (assId: string) => {
    setSalarySaving(prev => ({ ...prev, [assId]: true }))
    try {
      const res = await fetch('/api/admin/work-assignments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: assId, salary: salaryEdits[assId] ? Number(salaryEdits[assId]) : null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '저장 실패')
      toast.success('급여 저장됨')
      setAssignments(prev => prev.map(a =>
        a.id === assId ? { ...a, salary: salaryEdits[assId] ? Number(salaryEdits[assId]) : null } : a
      ))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSalarySaving(prev => ({ ...prev, [assId]: false }))
    }
  }

  const handleDeleteAss = async (assId: string) => {
    try {
      const res = await fetch('/api/admin/work-assignments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: assId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '삭제 실패')
      toast.success('이력 삭제됨')
      setAssignments(prev => prev.filter(a => a.id !== assId))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  const handleAddAssignment = async () => {
    if (!newAss.construction_date || !newAss.business_name.trim()) {
      toast.error('시공일자와 업체명을 입력하세요.')
      return
    }
    try {
      const res = await fetch('/api/admin/work-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: worker.id,
          construction_date: newAss.construction_date,
          business_name: newAss.business_name.trim(),
          salary: newAss.salary ? Number(newAss.salary) : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '추가 실패')
      toast.success('이력이 추가되었습니다.')
      const added: WorkAssignment = json.assignment
      setAssignments(prev => [added, ...prev])
      setSalaryEdits(prev => ({ ...prev, [added.id]: added.salary?.toString() ?? '' }))
      setNewAss({ construction_date: '', business_name: '', salary: '' })
      setShowAddAss(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '추가 실패')
    }
  }

  const isPartTime = form.employment_type !== '정직원'

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-900">{worker.name}</h2>
        <button
          onClick={handleDelete}
          className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-2 py-1 rounded-lg transition-colors"
        >
          삭제
        </button>
      </div>

      {/* Section 1: 기본 정보 */}
      <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">기본 정보</p>

        <Field label="이름" value={form.name} onChange={setField('name')} />
        <SelectField label="고용형태" value={form.employment_type} options={['정직원', '인턴', '일용직']} onChange={setField('employment_type')} />
        <Field label="연락처" value={form.phone} onChange={setField('phone')} />
        <Field label="계좌번호" value={form.account_number} onChange={setField('account_number')} mono />
        <Field label="특화작업" value={form.specialties} onChange={setField('specialties')} />

        {isPartTime && (
          <>
            <SelectField label="능력" value={form.skill_level} options={['상', '중', '하']} onChange={setField('skill_level')} />
            <Field label="주간급여" value={form.day_wage} onChange={setField('day_wage')} type="number" />
            <Field label="야간급여" value={form.night_wage} onChange={setField('night_wage')} type="number" />
          </>
        )}

        {!isPartTime && (
          <>
            <SelectField label="부서" value={form.department} options={['본부', '딥케어', '엔드케어']} onChange={setField('department')} />
            <Field label="직급" value={form.position} onChange={setField('position')} />
            <Field label="직책" value={form.job_title} onChange={setField('job_title')} />
            <Field label="평균급여" value={form.avg_salary} onChange={setField('avg_salary')} type="number" />
            <Field label="이메일" value={form.email} onChange={setField('email')} />
            <Field label="비상연락망" value={form.emergency_contact} onChange={setField('emergency_contact')} />
            <Field label="입사날짜" value={form.join_date} onChange={setField('join_date')} type="date" />
          </>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-1 bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 rounded-lg disabled:opacity-50 transition-colors"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>

      {/* Section 2: 추가정보 (collapsible) */}
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <button
          onClick={() => setExtraExpanded(v => !v)}
          className="w-full flex items-center justify-between p-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <span>추가 정보</span>
          <span>{extraExpanded ? '▲' : '▼'}</span>
        </button>
        {extraExpanded && (
          <div className="p-4 flex flex-col gap-3 bg-gray-50">
            <Field label="기념일" value={form.anniversary} onChange={setField('anniversary')} />
            <Field label="취미/특기" value={form.hobby} onChange={setField('hobby')} />
            <Field label="집주소" value={form.home_address} onChange={setField('home_address')} />
          </div>
        )}
      </div>

      {/* Section 3: 출력 이력 */}
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-600">출력 이력 ({assignments.length}건)</p>
          <button
            onClick={() => setShowAddAss(v => !v)}
            className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-2 py-1 rounded-lg transition-colors"
          >
            + 이력 추가
          </button>
        </div>

        {showAddAss && (
          <div className="p-3 bg-blue-50 border-b border-blue-100 flex flex-col gap-2">
            <input
              type="date"
              value={newAss.construction_date}
              onChange={e => setNewAss(prev => ({ ...prev, construction_date: e.target.value }))}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              value={newAss.business_name}
              onChange={e => setNewAss(prev => ({ ...prev, business_name: e.target.value }))}
              placeholder="업체명 *"
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="number"
              value={newAss.salary}
              onChange={e => setNewAss(prev => ({ ...prev, salary: e.target.value }))}
              placeholder="급여"
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddAssignment}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs py-1.5 rounded-lg transition-colors"
              >
                추가
              </button>
              <button
                onClick={() => { setShowAddAss(false); setNewAss({ construction_date: '', business_name: '', salary: '' }) }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs py-1.5 rounded-lg transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        )}

        {assLoading ? (
          <div className="p-4 text-xs text-center text-gray-400">불러오는 중...</div>
        ) : assignments.length === 0 ? (
          <div className="p-4 text-xs text-center text-gray-400">출력 이력이 없습니다.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {assignments.map(ass => (
              <div key={ass.id} className="p-3 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500">{ass.construction_date ?? '-'}</p>
                  <p className="text-xs font-medium text-gray-900 truncate">{ass.business_name ?? '-'}</p>
                </div>
                <input
                  type="number"
                  value={salaryEdits[ass.id] ?? ''}
                  onChange={e => setSalaryEdits(prev => ({ ...prev, [ass.id]: e.target.value }))}
                  placeholder="급여"
                  className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => handleSaveSalary(ass.id)}
                  disabled={salarySaving[ass.id]}
                  className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-2 py-1 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {salarySaving[ass.id] ? '...' : '저장'}
                </button>
                <button
                  onClick={() => handleDeleteAss(ass.id)}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
