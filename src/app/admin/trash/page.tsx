'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'

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

interface TrashedContract {
  id: string
  signing_status: string
  subscription_plan: string | null
  customer_phone: string | null
  deleted_at: string
  created_at: string
  customers: { business_name: string; contact_name: string | null } | null
}

type TabType = 'customers' | 'applications' | 'contracts'

// ─── 유틸 ─────────────────────────────────────────────────────

function calcDaysLeft(deletedAt: string): number {
  return 60 - Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86400000)
}

function DaysBadge({ deletedAt }: { deletedAt: string }) {
  const days = calcDaysLeft(deletedAt)
  if (days <= 3) {
    return <span className="text-state-danger font-bold text-sm">D-{days}</span>
  }
  if (days <= 7) {
    return <span className="text-orange-600 font-semibold text-sm">D-{days}</span>
  }
  return <span className="text-text-secondary text-sm">D-{days}</span>
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10)
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────

export default function TrashPage() {
  const [activeTab, setActiveTab] = useState<TabType>('customers')
  const [customers, setCustomers] = useState<TrashedCustomer[]>([])
  const [applications, setApplications] = useState<TrashedApplication[]>([])
  const [contracts, setContracts] = useState<TrashedContract[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set())
  const [selectedApplications, setSelectedApplications] = useState<Set<string>>(new Set())
  const [selectedContracts, setSelectedContracts] = useState<Set<string>>(new Set())

  const fetchTrash = useCallback(async () => {
    setLoading(true)
    try {
      const [custRes, appRes, contractRes] = await Promise.all([
        fetch('/api/admin/customers/trash'),
        fetch('/api/admin/applications/trash'),
        fetch('/api/admin/contracts/trash'),
      ])
      if (custRes.ok) {
        const data = await custRes.json() as { customers: TrashedCustomer[] }
        setCustomers(data.customers ?? [])
      }
      if (appRes.ok) {
        const data = await appRes.json() as { applications: TrashedApplication[] }
        setApplications(data.applications ?? [])
      }
      if (contractRes.ok) {
        const data = await contractRes.json() as { contracts: TrashedContract[] }
        setContracts(data.contracts ?? [])
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

  // ─── 계약서 복원 ──────────────────────────────────────────

  const handleRestoreContracts = useCallback(async (ids: string[]) => {
    const res = await fetch('/api/admin/contracts/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    if (!res.ok) {
      const err = await res.json() as { error?: string }
      toast.error(err.error ?? '복원 실패')
      return
    }
    toast.success(`계약서 ${ids.length}건 복원되었습니다.`)
    setSelectedContracts(new Set())
    await fetchTrash()
  }, [fetchTrash])

  // ─── 계약서 완전삭제 ─────────────────────────────────────

  const handlePurgeContracts = useCallback(async (ids: string[]) => {
    if (!confirm('이 작업은 되돌릴 수 없습니다. 정말 완전 삭제하시겠습니까?')) return
    const res = await fetch(`/api/admin/contracts/purge?ids=${ids.join(',')}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const err = await res.json() as { error?: string }
      toast.error(err.error ?? '삭제 실패')
      return
    }
    toast.success(`계약서 ${ids.length}건 완전 삭제되었습니다.`)
    setSelectedContracts(new Set())
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

  const toggleContract = (id: string) => {
    setSelectedContracts(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAllContracts = () => {
    if (selectedContracts.size === contracts.length) {
      setSelectedContracts(new Set())
    } else {
      setSelectedContracts(new Set(contracts.map(c => c.id)))
    }
  }

  // ─── 렌더링 ───────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">🗑️ 휴지통</h1>
        <p className="text-sm text-text-secondary mt-1">
          삭제된 항목은 60일 후 자동으로 영구 삭제됩니다.
        </p>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-6 border-b border-border">
        <button
          onClick={() => setActiveTab('customers')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'customers'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-text-secondary hover:text-text-primary'
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
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          서비스관리
          {applications.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-xs font-bold bg-red-500 text-white rounded-full">
              {applications.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('contracts')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'contracts'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          온라인계약서
          {contracts.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-xs font-bold bg-red-500 text-white rounded-full">
              {contracts.length}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-text-tertiary">
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
      ) : activeTab === 'applications' ? (
        <ApplicationsTab
          applications={applications}
          selected={selectedApplications}
          onToggle={toggleApplication}
          onToggleAll={toggleAllApplications}
          onRestore={handleRestoreApplications}
          onPurge={handlePurgeApplications}
        />
      ) : (
        <ContractsTab
          contracts={contracts}
          selected={selectedContracts}
          onToggle={toggleContract}
          onToggleAll={toggleAllContracts}
          onRestore={handleRestoreContracts}
          onPurge={handlePurgeContracts}
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
      <div className="text-center py-20 text-text-tertiary">
        <p className="text-4xl mb-3">🗑️</p>
        <p>휴지통이 비어 있습니다.</p>
      </div>
    )
  }

  return (
    <div>
      {/* 일괄 액션 바 */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-brand-50 rounded-lg border border-brand-200">
          <span className="text-sm text-brand-700 font-medium">{selected.size}건 선택됨</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onRestore(Array.from(selected))}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            일괄 복원
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => onPurge(Array.from(selected))}
          >
            일괄 완전삭제
          </Button>
        </div>
      )}

      {/* 테이블 */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken border-b border-border">
              <tr>
                <th className="w-10 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleAll}
                    className="rounded border-border"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-text-secondary">업체명</th>
                <th className="px-4 py-3 text-left font-medium text-text-secondary">담당자</th>
                <th className="px-4 py-3 text-left font-medium text-text-secondary">서비스유형</th>
                <th className="px-4 py-3 text-left font-medium text-text-secondary">삭제일</th>
                <th className="px-4 py-3 text-left font-medium text-text-secondary">남은 기간</th>
                <th className="px-4 py-3 text-right font-medium text-text-secondary">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {customers.map(c => (
                <tr key={c.id} className={selected.has(c.id) ? 'bg-brand-50' : 'hover:bg-surface-sunken'}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => onToggle(c.id)}
                      className="rounded border-border"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-text-primary">{c.business_name}</td>
                  <td className="px-4 py-3 text-text-secondary">{c.contact_name ?? '-'}</td>
                  <td className="px-4 py-3 text-text-secondary">{c.customer_type ?? '-'}</td>
                  <td className="px-4 py-3 text-text-secondary">{fmtDate(c.deleted_at)}</td>
                  <td className="px-4 py-3">
                    <DaysBadge deletedAt={c.deleted_at} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onRestore([c.id])}
                        className="text-state-success bg-state-success-bg hover:bg-green-200"
                      >
                        복원
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => onPurge([c.id])}
                        className="text-state-danger bg-state-danger-bg hover:bg-red-200"
                      >
                        완전삭제
                      </Button>
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

// ─── 계약서 탭 ────────────────────────────────────────────────

const CONTRACT_STATUS_LABELS: Record<string, string> = {
  draft: '초안',
  pending_customer: '서명 대기',
  customer_signed: '고객 서명 완료',
  completed: '완료',
  voided: '파기',
}

interface ContractsTabProps {
  contracts: TrashedContract[]
  selected: Set<string>
  onToggle: (id: string) => void
  onToggleAll: () => void
  onRestore: (ids: string[]) => void
  onPurge: (ids: string[]) => void
}

function ContractsTab({
  contracts,
  selected,
  onToggle,
  onToggleAll,
  onRestore,
  onPurge,
}: ContractsTabProps) {
  const allSelected = contracts.length > 0 && selected.size === contracts.length

  if (contracts.length === 0) {
    return (
      <div className="text-center py-20 text-text-tertiary">
        <p className="text-4xl mb-3">🗑️</p>
        <p>휴지통이 비어 있습니다.</p>
      </div>
    )
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-brand-50 rounded-lg border border-brand-200">
          <span className="text-sm text-brand-700 font-medium">{selected.size}건 선택됨</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onRestore(Array.from(selected))}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            일괄 복원
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => onPurge(Array.from(selected))}
          >
            일괄 완전삭제
          </Button>
        </div>
      )}

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken border-b border-border">
              <tr>
                <th className="w-10 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleAll}
                    className="rounded border-border"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-text-secondary">업체명</th>
                <th className="px-4 py-3 text-left font-medium text-text-secondary">담당자</th>
                <th className="px-4 py-3 text-left font-medium text-text-secondary">상태</th>
                <th className="px-4 py-3 text-left font-medium text-text-secondary">삭제일</th>
                <th className="px-4 py-3 text-left font-medium text-text-secondary">남은 기간</th>
                <th className="px-4 py-3 text-right font-medium text-text-secondary">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {contracts.map(c => (
                <tr key={c.id} className={selected.has(c.id) ? 'bg-brand-50' : 'hover:bg-surface-sunken'}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => onToggle(c.id)}
                      className="rounded border-border"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-text-primary">
                    {c.customers?.business_name ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {c.customers?.contact_name ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {CONTRACT_STATUS_LABELS[c.signing_status] ?? c.signing_status}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{fmtDate(c.deleted_at)}</td>
                  <td className="px-4 py-3">
                    <DaysBadge deletedAt={c.deleted_at} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onRestore([c.id])}
                        className="text-state-success bg-state-success-bg hover:bg-green-200"
                      >
                        복원
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => onPurge([c.id])}
                        className="text-state-danger bg-state-danger-bg hover:bg-red-200"
                      >
                        완전삭제
                      </Button>
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
      <div className="text-center py-20 text-text-tertiary">
        <p className="text-4xl mb-3">🗑️</p>
        <p>휴지통이 비어 있습니다.</p>
      </div>
    )
  }

  return (
    <div>
      {/* 일괄 액션 바 */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-brand-50 rounded-lg border border-brand-200">
          <span className="text-sm text-brand-700 font-medium">{selected.size}건 선택됨</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onRestore(Array.from(selected))}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            일괄 복원
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => onPurge(Array.from(selected))}
          >
            일괄 완전삭제
          </Button>
        </div>
      )}

      {/* 테이블 */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken border-b border-border">
              <tr>
                <th className="w-10 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleAll}
                    className="rounded border-border"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-text-secondary">업체명</th>
                <th className="px-4 py-3 text-left font-medium text-text-secondary">담당자</th>
                <th className="px-4 py-3 text-left font-medium text-text-secondary">서비스유형</th>
                <th className="px-4 py-3 text-left font-medium text-text-secondary">삭제일</th>
                <th className="px-4 py-3 text-left font-medium text-text-secondary">남은 기간</th>
                <th className="px-4 py-3 text-right font-medium text-text-secondary">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {applications.map(a => (
                <tr key={a.id} className={selected.has(a.id) ? 'bg-brand-50' : 'hover:bg-surface-sunken'}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => onToggle(a.id)}
                      className="rounded border-border"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-text-primary">{a.business_name}</td>
                  <td className="px-4 py-3 text-text-secondary">{a.owner_name ?? '-'}</td>
                  <td className="px-4 py-3 text-text-secondary">{a.service_type ?? '-'}</td>
                  <td className="px-4 py-3 text-text-secondary">{fmtDate(a.deleted_at)}</td>
                  <td className="px-4 py-3">
                    <DaysBadge deletedAt={a.deleted_at} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onRestore([a.id])}
                        className="text-state-success bg-state-success-bg hover:bg-green-200"
                      >
                        복원
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => onPurge([a.id])}
                        className="text-state-danger bg-state-danger-bg hover:bg-red-200"
                      >
                        완전삭제
                      </Button>
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
