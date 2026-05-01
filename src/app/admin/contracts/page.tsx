'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { Modal } from '@/components/ui'
import { SectionHeader } from '@/components/ui'

type SigningStatus = 'draft' | 'pending_customer' | 'customer_signed' | 'completed'

interface ContractListItem {
  id: string
  signing_status: SigningStatus
  service_plan: string | null
  visit_option: string | null
  monthly_price: number | null
  contract_start_date: string | null
  contract_end_date: string | null
  created_at: string
  customers: {
    business_name: string
    contact_name: string
    contact_phone: string
  } | null
}

interface CustomerOption {
  id: string
  business_name: string
  contact_name: string
  contact_phone: string
  customer_type: string | null
  billing_amount: number | null
  contract_start_date: string | null
  contract_end_date: string | null
}

const STATUS_LABELS: Record<SigningStatus, string> = {
  draft: '초안',
  pending_customer: '서명 대기',
  customer_signed: '고객 서명 완료',
  completed: '완료',
}

const STATUS_COLORS: Record<SigningStatus, string> = {
  draft: 'bg-surface-sunken text-text-secondary',
  pending_customer: 'bg-state-warning-bg text-state-warning',
  customer_signed: 'bg-state-info-bg text-state-info',
  completed: 'bg-state-success-bg text-state-success',
}

const TABS: { label: string; value: string }[] = [
  { label: '전체', value: 'all' },
  { label: '서명 대기', value: 'pending_customer' },
  { label: '고객 서명 완료', value: 'customer_signed' },
  { label: '완료', value: 'completed' },
]

const SERVICE_PLANS = ['3개 순환식', '6개 순환식', '12개 순환식']
const VISIT_OPTIONS = ['월 1회', '월 2회', '월 3회']

export default function AdminContractsPage() {
  const router = useRouter()
  const [contracts, setContracts] = useState<ContractListItem[]>([])
  const [activeTab, setActiveTab] = useState('all')
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)

  // 신규 계약서 폼 상태
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [formData, setFormData] = useState({
    customer_id: '',
    service_plan: '6개 순환식',
    visit_option: '월 2회',
    monthly_price: '',
    annual_price: '',
    contract_start_date: '',
    contract_end_date: '',
    customer_phone: '',
  })
  const [isCreating, setIsCreating] = useState(false)

  const fetchContracts = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = activeTab !== 'all' ? `?status=${activeTab}` : ''
      const res = await fetch(`/api/admin/contracts${params}`)
      const json = await res.json()
      if (json.success) {
        setContracts(json.data ?? [])
      }
    } catch {
      toast.error('계약서 목록을 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    void fetchContracts()
  }, [fetchContracts])

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/admin/customers?limit=200')
      const json = await res.json()
      if (json.success) {
        setCustomers(json.data ?? [])
      }
    } catch {
      toast.error('고객 목록을 불러오지 못했습니다.')
    }
  }

  const handleOpenCreate = () => {
    void fetchCustomers()
    setShowCreateModal(true)
  }

  const handleCustomerSelect = (customerId: string) => {
    const selected = customers.find((c) => c.id === customerId)
    if (!selected) {
      setFormData((prev) => ({ ...prev, customer_id: customerId }))
      return
    }
    setFormData((prev) => ({
      ...prev,
      customer_id: customerId,
      monthly_price: selected.billing_amount ? String(selected.billing_amount) : '',
      annual_price: selected.billing_amount ? String(selected.billing_amount * 12) : '',
      contract_start_date: selected.contract_start_date ?? '',
      contract_end_date: selected.contract_end_date ?? '',
      customer_phone: selected.contact_phone ?? '',
      service_plan: (selected.customer_type?.includes('12') ? '12개 순환식' :
        selected.customer_type?.includes('3') ? '3개 순환식' : '6개 순환식'),
    }))
  }

  const handleCreate = async () => {
    if (!formData.customer_id) {
      toast.error('고객을 선택해주세요.')
      return
    }
    setIsCreating(true)
    try {
      const res = await fetch('/api/admin/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          monthly_price: formData.monthly_price ? Number(formData.monthly_price) : null,
          annual_price: formData.annual_price ? Number(formData.annual_price) : null,
        }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success('계약서가 생성되었습니다.')
        setShowCreateModal(false)
        router.push(`/admin/contracts/${json.data.id}`)
      } else {
        toast.error(json.error ?? '생성에 실패했습니다.')
      }
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setIsCreating(false)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('ko-KR')
  }

  const formatPrice = (price: number | null) => {
    if (!price) return '-'
    return `${price.toLocaleString('ko-KR')}원`
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        level="page"
        title="온라인 계약서"
        action={<Button onClick={handleOpenCreate}>새 계약서 작성</Button>}
      />

      {/* 탭 */}
      <div className="flex gap-1 bg-surface-sunken rounded-xl p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.value
                ? 'bg-surface shadow-soft text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 목록 */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <span className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : contracts.length === 0 ? (
        <div className="bg-surface rounded-2xl shadow-soft p-12 text-center text-text-tertiary">
          계약서가 없습니다.
        </div>
      ) : (
        <div className="grid gap-3">
          {contracts.map((contract) => (
            <button
              key={contract.id}
              onClick={() => router.push(`/admin/contracts/${contract.id}`)}
              className="bg-surface rounded-2xl shadow-soft border border-border-subtle p-5 text-left hover:shadow-card transition-shadow w-full active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-text-primary truncate">
                    {contract.customers?.business_name ?? '고객명 없음'}
                  </p>
                  <p className="text-sm text-text-secondary mt-0.5">
                    {contract.service_plan ?? '-'} · {contract.visit_option ?? '-'}
                  </p>
                  <p className="text-xs text-text-tertiary mt-1">
                    {formatPrice(contract.monthly_price)}/월 · {formatDate(contract.contract_start_date)} ~ {formatDate(contract.contract_end_date)}
                  </p>
                </div>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap flex-shrink-0 ${
                    STATUS_COLORS[contract.signing_status] ?? ''
                  }`}
                >
                  {STATUS_LABELS[contract.signing_status] ?? contract.signing_status}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 새 계약서 작성 모달 */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="새 계약서 작성"
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              고객 선택 <span className="text-state-danger">*</span>
            </label>
            <select
              value={formData.customer_id}
              onChange={(e) => handleCustomerSelect(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              <option value="">고객을 선택하세요</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.business_name} ({c.contact_name})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">서비스 플랜</label>
              <select
                value={formData.service_plan}
                onChange={(e) => setFormData((prev) => ({ ...prev, service_plan: e.target.value }))}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                {SERVICE_PLANS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">방문 주기</label>
              <select
                value={formData.visit_option}
                onChange={(e) => setFormData((prev) => ({ ...prev, visit_option: e.target.value }))}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                {VISIT_OPTIONS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">월 요금 (원)</label>
              <input
                type="number"
                value={formData.monthly_price}
                onChange={(e) => setFormData((prev) => ({ ...prev, monthly_price: e.target.value }))}
                placeholder="238000"
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">연간 요금 (원)</label>
              <input
                type="number"
                value={formData.annual_price}
                onChange={(e) => setFormData((prev) => ({ ...prev, annual_price: e.target.value }))}
                placeholder="2856000"
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">계약 시작일</label>
              <input
                type="date"
                value={formData.contract_start_date}
                onChange={(e) => setFormData((prev) => ({ ...prev, contract_start_date: e.target.value }))}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">계약 종료일</label>
              <input
                type="date"
                value={formData.contract_end_date}
                onChange={(e) => setFormData((prev) => ({ ...prev, contract_end_date: e.target.value }))}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">고객 전화번호 (OTP 수신)</label>
            <input
              type="tel"
              value={formData.customer_phone}
              onChange={(e) => setFormData((prev) => ({ ...prev, customer_phone: e.target.value }))}
              placeholder="010-0000-0000"
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setShowCreateModal(false)}
            >
              취소
            </Button>
            <Button
              className="flex-1"
              onClick={handleCreate}
              isLoading={isCreating}
            >
              계약서 생성
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
