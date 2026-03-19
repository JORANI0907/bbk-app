'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import WorkerList from './WorkerList'
import WorkerDetail from './WorkerDetail'
import { MIGRATION_SQL, type Worker } from './constants'

function isMigrationError(msg: string) {
  return msg.includes('does not exist') || msg.includes('column') ||
    msg.includes('no such') || msg.includes('relation') || msg.includes('table')
}

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([])
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null)
  const [loading, setLoading] = useState(true)
  const [showMigration, setShowMigration] = useState(false)
  const [migrationExpanded, setMigrationExpanded] = useState(false)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterSkill, setFilterSkill] = useState('')
  const [filterSpecialty, setFilterSpecialty] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [copied, setCopied] = useState(false)

  const fetchWorkers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterType) params.set('employment_type', filterType)
      if (search) params.set('search', search)

      const res = await fetch(`/api/admin/workers?${params}`)
      const json = await res.json()

      if (!res.ok) {
        if (isMigrationError(json.error || '')) {
          setShowMigration(true)
          setWorkers([])
        } else {
          toast.error(json.error || '직원 목록 로드 실패')
        }
        return
      }

      let list: Worker[] = json.workers ?? []

      if (filterSkill) list = list.filter(w => w.skill_level === filterSkill)
      if (filterSpecialty) {
        const kw = filterSpecialty.toLowerCase()
        list = list.filter(w => w.specialties?.toLowerCase().includes(kw))
      }

      // 필터 없을 때 정직원 → 인턴 → 일용직 → 기타 순 정렬
      if (!filterType) {
        const ORDER: Record<string, number> = { '정직원': 0, '인턴': 1, '일용직': 2 }
        list = [...list].sort((a, b) => {
          const oa = ORDER[a.employment_type ?? ''] ?? 3
          const ob = ORDER[b.employment_type ?? ''] ?? 3
          return oa !== ob ? oa - ob : a.name.localeCompare(b.name, 'ko')
        })
      }

      setWorkers(list)
    } catch {
      toast.error('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [search, filterType, filterSkill, filterSpecialty])

  useEffect(() => { fetchWorkers() }, [fetchWorkers])

  const handleWorkerUpdated = useCallback((updated: Worker) => {
    setWorkers(prev => prev.map(w => w.id === updated.id ? updated : w))
    setSelectedWorker(updated)
  }, [])

  const handleWorkerAdded = useCallback((added: Worker) => {
    setWorkers(prev => [added, ...prev])
    setSelectedWorker(added)
    setShowAddForm(false)
  }, [])

  const handleWorkerDeleted = useCallback((id: string) => {
    setWorkers(prev => prev.filter(w => w.id !== id))
    if (selectedWorker?.id === id) setSelectedWorker(null)
  }, [selectedWorker])

  const handleCopySql = () => {
    navigator.clipboard.writeText(MIGRATION_SQL).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* 탭 네비게이션 */}
      <div className="flex gap-1.5 px-4 pt-4">
        <span className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl">👷 직원정보</span>
        <a href="/admin/payroll" className="px-4 py-2 text-gray-600 hover:bg-gray-100 text-sm font-medium rounded-xl transition-colors">💰 급여정산</a>
        <a href="/admin/members" className="px-4 py-2 text-gray-600 hover:bg-gray-100 text-sm font-medium rounded-xl transition-colors">🔑 계정관리</a>
      </div>

      {/* Migration Notice */}
      {showMigration && (
        <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-amber-600 font-medium text-sm">DB 마이그레이션 필요</span>
              <span className="text-amber-500 text-xs">workers 및 work_assignments 테이블을 생성해주세요.</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopySql}
                className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-700 px-3 py-1 rounded-lg transition-colors"
              >
                {copied ? '복사됨!' : 'SQL 복사'}
              </button>
              <button
                onClick={() => setMigrationExpanded(v => !v)}
                className="text-xs text-amber-600 hover:text-amber-800"
              >
                {migrationExpanded ? '접기' : 'SQL 보기'}
              </button>
            </div>
          </div>
          {migrationExpanded && (
            <pre className="mt-3 bg-gray-900 text-gray-100 text-xs rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
              {MIGRATION_SQL}
            </pre>
          )}
        </div>
      )}

      {/* Split panel */}
      <div className="flex flex-1 gap-0 overflow-hidden p-4">
        {/* Left panel */}
        <div className="w-80 shrink-0 flex flex-col bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mr-4">
          <WorkerList
            workers={workers}
            selectedId={selectedWorker?.id ?? null}
            loading={loading}
            search={search}
            filterType={filterType}
            filterSkill={filterSkill}
            filterSpecialty={filterSpecialty}
            showAddForm={showAddForm}
            onSearchChange={setSearch}
            onFilterTypeChange={setFilterType}
            onFilterSkillChange={setFilterSkill}
            onFilterSpecialtyChange={setFilterSpecialty}
            onSelectWorker={setSelectedWorker}
            onShowAddForm={setShowAddForm}
            onWorkerAdded={handleWorkerAdded}
          />
        </div>

        {/* Right panel */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 overflow-y-auto">
          {selectedWorker ? (
            <WorkerDetail
              worker={selectedWorker}
              onWorkerUpdated={handleWorkerUpdated}
              onWorkerDeleted={handleWorkerDeleted}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              왼쪽에서 직원을 선택하세요
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
