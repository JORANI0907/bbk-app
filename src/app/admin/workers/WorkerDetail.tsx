'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import type { Worker } from './constants'

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
  }, [worker.id])

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

    </div>
  )
}
