'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import type { Worker } from './constants'

const EMP_BADGE: Record<string, string> = {
  '정직원': 'bg-green-100 text-green-700',
  '인턴':   'bg-red-100 text-red-700',
  '일용직': 'bg-yellow-100 text-yellow-700',
}

const SKILL_BADGE: Record<string, string> = {
  '상': 'bg-blue-100 text-blue-700',
  '중': 'bg-green-100 text-green-700',
  '하': 'bg-yellow-100 text-yellow-700',
}

interface AddFormState {
  name: string
  employment_type: string
  phone: string
  skill_level: string
}

const DEFAULT_ADD: AddFormState = {
  name: '',
  employment_type: '정직원',
  phone: '',
  skill_level: '',
}

interface Props {
  workers: Worker[]
  selectedId: string | null
  loading: boolean
  search: string
  filterType: string
  filterSkill: string
  filterSpecialty: string
  showAddForm: boolean
  onSearchChange: (v: string) => void
  onFilterTypeChange: (v: string) => void
  onFilterSkillChange: (v: string) => void
  onFilterSpecialtyChange: (v: string) => void
  onSelectWorker: (w: Worker) => void
  onShowAddForm: (v: boolean) => void
  onWorkerAdded: (w: Worker) => void
}

export default function WorkerList({
  workers, selectedId, loading,
  search, filterType, filterSkill, filterSpecialty,
  showAddForm,
  onSearchChange, onFilterTypeChange, onFilterSkillChange, onFilterSpecialtyChange,
  onSelectWorker, onShowAddForm, onWorkerAdded,
}: Props) {
  const [addForm, setAddForm] = useState<AddFormState>(DEFAULT_ADD)
  const [saving, setSaving] = useState(false)

  const handleAdd = async () => {
    if (!addForm.name.trim()) {
      toast.error('이름을 입력하세요.')
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: addForm.name.trim(),
        employment_type: addForm.employment_type || null,
        phone: addForm.phone.trim() || null,
      }
      if (addForm.skill_level) body.skill_level = addForm.skill_level

      const res = await fetch('/api/admin/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '추가 실패')
      toast.success('직원이 추가되었습니다.')
      setAddForm(DEFAULT_ADD)
      onWorkerAdded(json.worker)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '추가 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Header */}
      <div className="p-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">직원 목록 ({workers.length}명)</span>
          <button
            onClick={() => onShowAddForm(!showAddForm)}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded-lg transition-colors"
          >
            + 직원 추가
          </button>
        </div>

        {/* Search */}
        <input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="이름, 연락처 검색"
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* Filters */}
        <div className="flex gap-1 mb-1">
          <select
            value={filterType}
            onChange={e => onFilterTypeChange(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-1.5 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">고용형태</option>
            <option>정직원</option>
            <option>인턴</option>
            <option>일용직</option>
          </select>
          <select
            value={filterSkill}
            onChange={e => onFilterSkillChange(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-1.5 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">능력</option>
            <option>상</option>
            <option>중</option>
            <option>하</option>
          </select>
        </div>
        <input
          value={filterSpecialty}
          onChange={e => onFilterSpecialtyChange(e.target.value)}
          placeholder="특화작업 검색"
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Add form (inline) */}
      {showAddForm && (
        <div className="p-3 bg-blue-50 border-b border-blue-100">
          <p className="text-xs font-semibold text-blue-700 mb-2">새 직원 추가</p>
          <div className="flex flex-col gap-1.5">
            <input
              value={addForm.name}
              onChange={e => setAddForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="이름 *"
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={addForm.employment_type}
              onChange={e => setAddForm(prev => ({ ...prev, employment_type: e.target.value }))}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option>정직원</option>
              <option>인턴</option>
              <option>일용직</option>
            </select>
            <input
              value={addForm.phone}
              onChange={e => setAddForm(prev => ({ ...prev, phone: e.target.value }))}
              placeholder="연락처"
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-1.5">
              <button
                onClick={handleAdd}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs py-1.5 rounded-lg disabled:opacity-50 transition-colors"
              >
                {saving ? '추가 중...' : '추가'}
              </button>
              <button
                onClick={() => { onShowAddForm(false); setAddForm(DEFAULT_ADD) }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs py-1.5 rounded-lg transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Worker list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-xs text-gray-400">불러오는 중...</div>
        ) : workers.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-400">직원이 없습니다.</div>
        ) : (
          workers.map(worker => (
            <button
              key={worker.id}
              onClick={() => onSelectWorker(worker)}
              className={`w-full text-left p-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                selectedId === worker.id ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-sm font-semibold text-gray-900 truncate">{worker.name}</span>
                    {worker.employment_type && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${EMP_BADGE[worker.employment_type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {worker.employment_type}
                      </span>
                    )}
                    {worker.skill_level && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${SKILL_BADGE[worker.skill_level] ?? 'bg-gray-100 text-gray-600'}`}>
                        {worker.skill_level}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{worker.phone ?? '-'}</p>
                  {worker.specialties && (
                    <p className="text-xs text-gray-400 truncate">{worker.specialties}</p>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </>
  )
}
