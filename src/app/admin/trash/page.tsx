'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'

// ─── 타입 ─────────────────────────────────────────────────────

interface TrashedCustomer {
  id: string
  business_name: string
  contact_name: string | null
  contact_phone: string | null
  customer_type: string | null
  deleted_at: string
  created_at: string
}

interface TrashedApplication {
  id: string
  business_name: string
  owner_name: string | null
  phone: string | null
  service_type: string | null
  status: string | null
  deleted_at: string
  created_at: string
}

type TabType = 'customers' | 'applications'

// ─── 유틸 ─────────────────────────────────────────────────────

function calcDaysLeft(deletedAt: string): number {
  return 60 - Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86400000)
}

function DaysBadge({ deletedAt }: { deletedAt: string }) {
  const days = calcDaysLeft(deletedAt)
  if (days <= 3) {
    return <span className="text-red-600 font-bold text-sm">D-{days}</span>
  }
  if (days <= 7) {
    return <span className="text-orange-600 font-semibold text-sm">D-{days}</span>
  }
  return <span className="text-gray-500 text-sm">D-{days}</span>
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10)
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────

export default function TrashPage() {
  const [activeTab, setActiveTab] = useState<TabType>('customers')
  const [customers, setCustomers] = useState<TrashedCustomer[]>([])
  const [applications, setApplications] = useState<TrashedApplication[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set())
  const [selectedApplications, setSelectedApplications] = useState<Set<string>>(new Set())

  const fetchTrash = useCallback(async () => {
    setLoading(true)
    try {
      const [custRes, appRes] = await Promise.all([
        fetch('/api/admin/customers/trash'),
        fetch('/api/admin/applications/trash'),
      ])
      if (custRes.ok) {
        const data = await custRes.json() as { customers: TrashedCustomer[] }
        setCustomers(data.customers ?? [])
      }
      if (appRes.ok) {
        const data = await appRes.json() as { applications: TrashedApplication[] }
        setApplications(data.applications ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTrash()
  }, [fetchTrash])

  // ─── 고객 복원 ─────────────────────────────────────────────

  const handleRestoreCustomers = useCallback(async (ids: string[]) => {
    const res = await fetch('/api/admin/customers/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    if (!res.ok) {
      const err = await res.json() as { error?: string }
      toast.error(err.error ?? '복원 실패')
      return
    }
    toast.success(`고객 ${ids.length}건 복원되었습니다.`)
    setSelectedCustomers(new Set())
    await fetchTrash()
  }, [fetchTrash])

  // ─── 고객 완전삭제 ─────────────────────────────────────────

  const handlePurgeCustomers = useCallback(async (ids: string[]) => {
    if (!confirm('이 작업은 되돌릴 수 없습니다. 정말 완전 삭제하시겠습니까?')) return
    const res = await fetch(`/api/admin/customers/purge?ids=${ids.join(',')}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const err = await res.json() as { error?: string }
      toast.error(err.error ?? '삭제 실패')
      return
    }
    toast.success(`고객 ${ids.length}건 완전 삭제되었습니다.`)
    setSelectedCustomers(new Set())
    await fetchTrash()
  }, [fetchTrash])

  // ─── 신청서 복원 ──────────────────────────────────────────

  const handleRestoreApplications = useCallback(async (ids: string[]) => {
    const res = await fetch('/api/admin/applications/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    if (!res.ok) {
      const err = await res.json() as { error?: string }
      toast.error(err.error ?? '복원 실패')
      return
    }
    toast.success(`서비스 ${ids.length}건 복원되었습니다.`)
    setSelectedApplications(new Set())
    await fetchTrash()
  }, [fetchTrash])

  // ─── 신청서 완전삭제 ─────────────────────────────────────

  const handlePurgeApplications = useCallback(async (ids: string[]) => {
    if (!confirm('이 작업은 되돌릴 수 없습니다. 정말 완전 삭제하시겠습니까?')) return
    const res = await fetch(`/api/admin/applications/purge?ids=${ids.join(',')}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const err = await res.json() as { error?: string }
      toast.error(err.error ?? '삭제 실패')
      return
    }
    toast.success(`서비스 ${ids.length}건 완전 삭제되었습니다.`)
    setSelectedApplications(new Set())
    await fetchTrash()
  }, [fetchTrash])

  // ─── 체크박스 핸들러 ──────────────────────────────────────

  const toggleCustomer = (id: string) => {
    setSelectedCustomers(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAllCustomers = () => {
    if (selectedCustomers.size === customers.length) {
      setSelectedCustomers(new Set())
    } else {
      setSelectedCustomers(new Set(customers.map(c => c.id)))
    }
  }

  const toggleApplication = (id: string) => {
    setSelectedApplications(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAllApplications = () => {
    if (selectedApplications.size === applications.length) {
      setSelectedApplications(new Set())
    } else {
      setSelectedApplications(new Set(applications.map(a => a.id)))
    }
  }

  // ─── 렌더링 ───────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🗑️ 휴지통</h1>
        <p className="text-sm text-gray-500 mt-1">
          삭제된 항목은 60일 후 자동으로 영구 삭제됩니다.
        </p>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('customers')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'customers'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          고객관리
          {customers.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-xs font-bold bg-red-500 text-white rounded-full">
              {customers.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('applications')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'applications'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          서비스관리
          {applications.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-xs font-bold bg-red-500 text-white rounded-full">
              {applications.length}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <span>불러오는 중...</span>
        </div>
      ) : activeTab === 'customers' ? (
        <CustomersTab
          customers={customers}
          selected={selectedCustomers}
          onToggle={toggleCustomer}
          onToggleAll={toggleAllCustomers}
          onRestore={handleRestoreCustomers}
          onPurge={handlePurgeCustomers}
        />
      ) : (
        <ApplicationsTab
          applications={applications}
          selected={selectedApplications}
          onToggle={toggleApplication}
          onToggleAll={toggleAllApplications}
          onRestore={handleRestoreApplications}
          onPurge={handlePurgeApplications}
        />
      )}
    </div>
  )
}

// ─── 고객 탭 ──────────────────────────────────────────────────

interface CustomersTabProps {
  customers: TrashedCustomer[]
  selected: Set<string>
  onToggle: (id: string) => void
  onToggleAll: () => void
  onRestore: (ids: string[]) => void
  onPurge: (ids: string[]) => void
}

function CustomersTab({
  customers,
  selected,
  onToggle,
  onToggleAll,
  onRestore,
  onPurge,
}: CustomersTabProps) {
  const allSelected = customers.length > 0 && selected.size === customers.length

  if (customers.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-4xl mb-3">🗑️</p>
        <p>휴지통이 비어 있습니다.</p>
      </div>
    )
  }

  return (
    <div>
      {/* 일괄 액션 바 */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <span className="text-sm text-blue-700 font-medium">{selected.size}건 선택됨</span>
          <button
            onClick={() => onRestore(Array.from(selected))}
            className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
          >
            일괄 복원
          </button>
          <button
            onClick={() => onPurge(Array.from(selected))}
            className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            일괄 완전삭제
          </button>
        </div>
      )}

      {/* 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-10 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">업체명</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">담당자</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">서비스유형</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">삭제일</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">남은 기간</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.map(c => (
                <tr key={c.id} className={selected.has(c.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => onToggle(c.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{c.business_name}</td>
                  <td className="px-4 py-3 text-gray-600">{c.contact_name ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.customer_type ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(c.deleted_at)}</td>
                  <td className="px-4 py-3">
                    <DaysBadge deletedAt={c.deleted_at} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onRestore([c.id])}
                        className="px-2.5 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-md hover:bg-green-200 transition-colors"
                      >
                        복원
                      </button>
                      <button
                        onClick={() => onPurge([c.id])}
                        className="px-2.5 py-1 text-xs font-medium text-red-700 bg-red-100 rounded-md hover:bg-red-200 transition-colors"
                      >
                        완전삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── 서비스 탭 ────────────────────────────────────────────────

interface ApplicationsTabProps {
  applications: TrashedApplication[]
  selected: Set<string>
  onToggle: (id: string) => void
  onToggleAll: () => void
  onRestore: (ids: string[]) => void
  onPurge: (ids: string[]) => void
}

function ApplicationsTab({
  applications,
  selected,
  onToggle,
  onToggleAll,
  onRestore,
  onPurge,
}: ApplicationsTabProps) {
  const allSelected = applications.length > 0 && selected.size === applications.length

  if (applications.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-4xl mb-3">🗑️</p>
        <p>휴지통이 비어 있습니다.</p>
      </div>
    )
  }

  return (
    <div>
      {/* 일괄 액션 바 */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <span className="text-sm text-blue-700 font-medium">{selected.size}건 선택됨</span>
          <button
            onClick={() => onRestore(Array.from(selected))}
            className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
          >
            일괄 복원
          </button>
          <button
            onClick={() => onPurge(Array.from(selected))}
            className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            일괄 완전삭제
          </button>
        </div>
      )}

      {/* 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-10 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">업체명</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">담당자</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">서비스유형</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">삭제일</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">남은 기간</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {applications.map(a => (
                <tr key={a.id} className={selected.has(a.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => onToggle(a.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{a.business_name}</td>
                  <td className="px-4 py-3 text-gray-600">{a.owner_name ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{a.service_type ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(a.deleted_at)}</td>
                  <td className="px-4 py-3">
                    <DaysBadge deletedAt={a.deleted_at} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onRestore([a.id])}
                        className="px-2.5 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-md hover:bg-green-200 transition-colors"
                      >
                        복원
                      </button>
                      <button
                        onClick={() => onPurge([a.id])}
                        className="px-2.5 py-1 text-xs font-medium text-red-700 bg-red-100 rounded-md hover:bg-red-200 transition-colors"
                      >
                        완전삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
