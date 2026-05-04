'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { Modal } from '@/components/ui'
import { SectionHeader } from '@/components/ui'

type SigningStatus = 'draft' | 'pending_customer' | 'customer_signed' | 'completed'

interface ContractListItem {
  id: string
  signing_status: SigningStatus
  monthly_price: number | null
  start_date: string | null
  end_date: string | null
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


export default function AdminContractsPage() {
  const router = useRouter()
  const [contracts, setContracts] = useState<ContractListItem[]>([])
  const [activeTab, setActiveTab] = useState('all')
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)

  // 신규 계약서 폼 상태
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [customerInputValue, setCustomerInputValue] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const customerDropdownRef = useRef<HTMLDivElement>(null)
  const [formData, setFormData] = useState({
    customer_id: '',
    monthly_price: '',
    annual_price: '',
    contract_start_date: '',
    contract_end_date: '',
    customer_phone: '',
  })
  const [isCreating, setIsCreating] = useState(false)
  const handleCloseCreateModal = useCallback(() => setShowCreateModal(false), [])

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
      const res = await fetch('/api/admin/customers')
      const json = await res.json()
      // API는 { customers: [...] } 형태로 반환
      const list: CustomerOption[] = json.customers ?? json.data ?? []
      setCustomers(list)
    } catch {
      toast.error('고객 목록을 불러오지 못했습니다.')
    }
  }

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleOpenCreate = () => {
    void fetchCustomers()
    setCustomerInputValue('')
    setShowCustomerDropdown(false)
    setFormData({
      customer_id: '',
      monthly_price: '',
      annual_price: '',
      contract_start_date: '',
      contract_end_date: '',
      customer_phone: '',
    })
    setShowCreateModal(true)
  }

  // 검색어로 필터링된 고객 목록 (고객이 이미 선택된 상태면 전체 표시)
  const filteredCustomers = customers.filter((c) => {
    if (formData.customer_id || !customerInputValue) return true
    const q = customerInputValue.toLowerCase()
    return (
      (c.business_name ?? '').toLowerCase().includes(q) ||
      (c.contact_name ?? '').toLowerCase().includes(q) ||
      (c.contact_phone ?? '').includes(q)
    )
  })

  const handleCustomerSelect = (customer: CustomerOption) => {
    setFormData((prev) => ({
      ...prev,
      customer_id: customer.id,
      monthly_price: customer.billing_amount ? String(customer.billing_amount) : '',
      annual_price: customer.billing_amount ? String(customer.billing_amount * 12) : '',
      contract_start_date: customer.contract_start_date ?? '',
      contract_end_date: customer.contract_end_date ?? '',
      customer_phone: customer.contact_phone ?? '',
    }))
    setCustomerInputValue(`${customer.business_name} (${customer.contact_name})`)
    setShowCustomerDropdown(false)
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
                  <p className="text-xs text-text-tertiary mt-1">
                    {formatPrice(contract.monthly_price)}/월 · {formatDate(contract.start_date)} ~ {formatDate(contract.end_date)}
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
        onClose={handleCloseCreateModal}
        title="새 계약서 작성"
      >
        <div className="space-y-4 pt-2">
          <div ref={customerDropdownRef} className="relative">
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              고객 선택 <span className="text-state-danger">*</span>
            </label>
            <input
              type="text"
              value={customerInputValue}
              onChange={(e) => {
                setCustomerInputValue(e.target.value)
                setShowCustomerDropdown(true)
                if (formData.customer_id) {
                  setFormData((prev) => ({ ...prev, customer_id: '' }))
                }
              }}
              onFocus={() => setShowCustomerDropdown(true)}
              placeholder="고객명·담당자·전화번호 검색"
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
            {showCustomerDropdown && (
              <div className="absolute z-50 mt-1 w-full bg-surface border border-border rounded-md shadow-pop max-h-52 overflow-y-auto">
                {filteredCustomers.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-text-tertiary">검색 결과 없음</div>
                ) : (
                  filteredCustomers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => handleCustomerSelect(c)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-surface-sunken transition-colors"
                    >
                      <span className="font-medium text-text-primary">{c.business_name}</span>
                      <span className="text-text-secondary ml-1">({c.contact_name})</span>
                      {c.contact_phone && (
                        <span className="text-text-tertiary ml-1 text-xs">{c.contact_phone}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
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
              onClick={handleCloseCreateModal}
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
