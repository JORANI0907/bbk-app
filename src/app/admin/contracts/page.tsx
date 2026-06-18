'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { Modal } from '@/components/ui'
import { SectionHeader } from '@/components/ui'
import { type VarConfig, type TemplateVarConfigMap } from '@/lib/contractTemplate'
import ContractEditor from '@/components/contracts/ContractEditor'

type SigningStatus = 'draft' | 'pending_customer' | 'customer_signed' | 'completed' | 'voided'

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
  billing_cycle: string | null
  supply_amount: string | null
  vat: string | null
  contract_start_date: string | null
  contract_end_date: string | null
}

interface TemplateOption {
  id: string
  name: string
  is_active: boolean
}

const STATUS_LABELS: Record<SigningStatus, string> = {
  draft: '초안',
  pending_customer: '서명 대기',
  customer_signed: '고객 서명 완료',
  completed: '완료',
  voided: '파기',
}

const STATUS_COLORS: Record<SigningStatus, string> = {
  draft: 'bg-surface-sunken text-text-secondary',
  pending_customer: 'bg-state-warning-bg text-state-warning',
  customer_signed: 'bg-state-info-bg text-state-info',
  completed: 'bg-state-success-bg text-state-success',
  voided: 'bg-state-danger-bg text-state-danger',
}

const TABS: { label: string; value: string }[] = [
  { label: '전체', value: 'all' },
  { label: '서명 대기', value: 'pending_customer' },
  { label: '고객 서명 완료', value: 'customer_signed' },
  { label: '완료', value: 'completed' },
  { label: '파기', value: 'voided' },
]


export default function AdminContractsPage() {
  const router = useRouter()
  const [contracts, setContracts] = useState<ContractListItem[]>([])
  const [activeTab, setActiveTab] = useState('all')
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [contractToDelete, setContractToDelete] = useState<ContractListItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // 신규 계약서 폼 상태
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [customerInputValue, setCustomerInputValue] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const customerDropdownRef = useRef<HTMLDivElement>(null)
  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [formData, setFormData] = useState({
    customer_id: '',
    monthly_price: '',
    annual_price: '',
    contract_start_date: '',
    contract_end_date: '',
    customer_phone: '',
    service_scope: '',
  })
  const [isCreating, setIsCreating] = useState(false)
  const [templateVarConfig, setTemplateVarConfig] = useState<TemplateVarConfigMap>({})
  const [manualVarValues, setManualVarValues] = useState<Record<string, string>>({})
  const [createStep, setCreateStep] = useState<'form' | 'preview'>('form')
  const [previewHtml, setPreviewHtml] = useState('')
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const handleCloseCreateModal = useCallback(() => {
    setShowCreateModal(false)
    setCreateStep('form')
    setPreviewHtml('')
  }, [])

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

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/admin/contract-templates')
      const json = await res.json()
      if (json.success) {
        const active: TemplateOption[] = (json.data ?? []).filter(
          (t: TemplateOption) => t.is_active,
        )
        setTemplates(active)
      }
    } catch {
      // 템플릿 로드 실패는 무시 (기본 양식 사용)
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
    void fetchTemplates()
    setCustomerInputValue('')
    setShowCustomerDropdown(false)
    setSelectedTemplateId('')
    setTemplateVarConfig({})
    setManualVarValues({})
    setFormData({
      customer_id: '',
      monthly_price: '',
      annual_price: '',
      contract_start_date: '',
      contract_end_date: '',
      customer_phone: '',
      service_scope: '',
    })
    setShowCreateModal(true)
  }

  const handleTemplateChange = async (templateId: string) => {
    setSelectedTemplateId(templateId)
    setTemplateVarConfig({})
    setManualVarValues({})
    if (!templateId) return
    try {
      const res = await fetch(`/api/admin/contract-templates/${templateId}`)
      const json = await res.json()
      if (json.success) {
        setTemplateVarConfig((json.data.var_config ?? {}) as TemplateVarConfigMap)
      }
    } catch { /* 무시 */ }
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
    const isAnnual = customer.billing_cycle === '연간'
    const monthly = customer.billing_amount
      ? isAnnual ? Math.round(customer.billing_amount / 12) : customer.billing_amount
      : null
    const annual = customer.billing_amount
      ? isAnnual ? customer.billing_amount : customer.billing_amount * 12
      : null

    setFormData((prev) => ({
      ...prev,
      customer_id: customer.id,
      monthly_price: monthly ? String(monthly) : '',
      annual_price: annual ? String(annual) : '',
      contract_start_date: customer.contract_start_date ?? '',
      contract_end_date: customer.contract_end_date ?? '',
      customer_phone: customer.contact_phone ?? '',
    }))
    setCustomerInputValue(`${customer.business_name} (${customer.contact_name})`)
    setShowCustomerDropdown(false)
  }

  const buildContractPayload = () => {
    const selectedItems = formData.service_scope.split('\n').map((l) => l.trim()).filter(Boolean)
    return {
      customer_id: formData.customer_id,
      monthly_price: formData.monthly_price ? Number(formData.monthly_price) : null,
      annual_price: formData.annual_price ? Number(formData.annual_price) : null,
      contract_start_date: formData.contract_start_date || null,
      contract_end_date: formData.contract_end_date || null,
      customer_phone: formData.customer_phone,
      selected_items: selectedItems,
      template_id: selectedTemplateId || undefined,
      custom_vars: Object.keys(manualVarValues).length > 0 ? manualVarValues : undefined,
    }
  }

  const handlePreview = async () => {
    if (!formData.customer_id) {
      toast.error('고객을 선택해주세요.')
      return
    }
    setIsPreviewLoading(true)
    try {
      const res = await fetch('/api/admin/contracts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildContractPayload()),
      })
      const json = await res.json()
      if (json.success) {
        setPreviewHtml(json.data.html)
        setShowCreateModal(false)
        setCreateStep('preview')
      } else {
        toast.error(json.error ?? '미리보기 생성에 실패했습니다.')
      }
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setIsPreviewLoading(false)
    }
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
          ...buildContractPayload(),
          html_body: previewHtml || undefined,
        }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success('계약서가 생성되었습니다.')
        setShowCreateModal(false)
        setCreateStep('form')
        setPreviewHtml('')
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

  const selectedCustomer = customers.find(c => c.id === formData.customer_id) ?? null

  const today = new Date()
  const varPreviewEntries = selectedTemplateId && Object.keys(templateVarConfig).length > 0
    ? (Object.entries(templateVarConfig) as [string, VarConfig][]).map(([varName, cfg]) => {
        let value = ''
        if (cfg.mode === 'manual') {
          value = manualVarValues[varName] ?? ''
        } else if (cfg.autoField) {
          const f = cfg.autoField
          if (f === 'customer.business_name') value = selectedCustomer?.business_name ?? ''
          else if (f === 'customer.contact_name') value = selectedCustomer?.contact_name ?? ''
          else if (f === 'customer.contact_phone') value = selectedCustomer?.contact_phone ?? ''
          else if (f === 'contract.monthly_price') value = formData.monthly_price ? `${Number(formData.monthly_price).toLocaleString()}원` : ''
          else if (f === 'contract.annual_price') value = formData.annual_price ? `${Number(formData.annual_price).toLocaleString()}원` : ''
          else if (f === 'contract.start_date') value = formData.contract_start_date
          else if (f === 'contract.end_date') value = formData.contract_end_date
          else if (f === 'system.today_year') value = String(today.getFullYear())
          else if (f === 'system.today_month') value = String(today.getMonth() + 1).padStart(2, '0')
          else if (f === 'system.today_day') value = String(today.getDate()).padStart(2, '0')
          else if (f === 'contract.selected_items_list') value = formData.service_scope.trim() ? `${formData.service_scope.split('\n').filter(Boolean).length}개 항목` : ''
        }
        return { name: varName, label: cfg.label || varName, mode: cfg.mode, value }
      })
    : [
        { name: 'CUSTOMER_BUSINESS_NAME', label: '고객사명', mode: 'auto' as const, value: selectedCustomer?.business_name ?? '' },
        { name: 'CUSTOMER_OWNER_NAME', label: '담당자명', mode: 'auto' as const, value: selectedCustomer?.contact_name ?? '' },
        { name: 'CUSTOMER_PHONE', label: '고객 연락처', mode: 'auto' as const, value: selectedCustomer?.contact_phone ?? '' },
        { name: 'CONTRACT_YEAR', label: '계약 연도', mode: 'auto' as const, value: String(today.getFullYear()) },
        { name: 'CONTRACT_MONTH', label: '계약 월', mode: 'auto' as const, value: String(today.getMonth() + 1).padStart(2, '0') },
        { name: 'CONTRACT_DAY', label: '계약 일', mode: 'auto' as const, value: String(today.getDate()).padStart(2, '0') },
        { name: 'MONTHLY_PRICE', label: '월 요금', mode: 'auto' as const, value: formData.monthly_price ? `${Number(formData.monthly_price).toLocaleString()}원` : '' },
        { name: 'ANNUAL_PRICE', label: '연간 요금', mode: 'auto' as const, value: formData.annual_price ? `${Number(formData.annual_price).toLocaleString()}원` : '' },
        { name: 'CONTRACT_START_DATE', label: '계약 시작일', mode: 'auto' as const, value: formData.contract_start_date },
        { name: 'CONTRACT_END_DATE', label: '계약 종료일', mode: 'auto' as const, value: formData.contract_end_date },
        { name: 'SELECTED_ITEMS_LIST', label: '서비스 항목', mode: 'auto' as const, value: formData.service_scope.trim() ? `${formData.service_scope.split('\n').filter(Boolean).length}개 항목` : '' },
      ]

  const handleDeleteConfirm = async () => {
    if (!contractToDelete) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/admin/contracts/${contractToDelete.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.success) {
        toast.success('계약서가 휴지통으로 이동되었습니다.')
        setContractToDelete(null)
        void fetchContracts()
      } else {
        toast.error(json.error ?? '삭제에 실패했습니다.')
      }
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setIsDeleting(false)
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
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => router.push('/admin/contracts/templates')}>
              양식 관리
            </Button>
            <Button onClick={handleOpenCreate}>새 계약서 작성</Button>
          </div>
        }
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
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${
                      STATUS_COLORS[contract.signing_status] ?? ''
                    }`}
                  >
                    {STATUS_LABELS[contract.signing_status] ?? contract.signing_status}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setContractToDelete(contract)
                    }}
                    className="p-1.5 rounded-lg text-text-tertiary hover:text-state-danger hover:bg-state-danger-bg transition-colors"
                    title="휴지통으로 이동"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 삭제 확인 모달 */}
      <Modal
        open={contractToDelete !== null}
        onClose={() => setContractToDelete(null)}
        title="계약서 삭제"
      >
        <div className="space-y-4 pt-2">
          <div className="p-4 bg-state-danger-bg rounded-xl border border-red-200">
            <p className="text-sm font-medium text-state-danger">
              {contractToDelete?.customers?.business_name ?? '고객'} 계약서를 휴지통으로 이동하시겠습니까?
            </p>
            <p className="text-xs text-text-secondary mt-1">
              휴지통에서 60일간 보관 후 자동 삭제됩니다. 복원은 휴지통 탭에서 가능합니다.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setContractToDelete(null)}
            >
              취소
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={handleDeleteConfirm}
              isLoading={isDeleting}
            >
              휴지통으로 이동
            </Button>
          </div>
        </div>
      </Modal>

      {/* 새 계약서 작성 모달 */}
      <Modal
        open={showCreateModal}
        onClose={handleCloseCreateModal}
        title="새 계약서 작성"
      >
        <div className="space-y-4 pt-2">
          {/* 템플릿 선택 */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              계약서 양식
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => void handleTemplateChange(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              <option value="">양식 선택 안함 (기본 양식 사용)</option>
              {templates.map((tmpl) => (
                <option key={tmpl.id} value={tmpl.id}>
                  {tmpl.name}
                </option>
              ))}
            </select>
          </div>

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
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                월 요금 (원)
                <span className="ml-1.5 text-[10px] font-mono text-brand-600 bg-brand-50 px-1 py-0.5 rounded">{'{{MONTHLY_PRICE}}'}</span>
              </label>
              <input
                type="number"
                value={formData.monthly_price}
                onChange={(e) => setFormData((prev) => ({ ...prev, monthly_price: e.target.value }))}
                placeholder="238000"
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                연간 요금 (원)
                <span className="ml-1.5 text-[10px] font-mono text-brand-600 bg-brand-50 px-1 py-0.5 rounded">{'{{ANNUAL_PRICE}}'}</span>
              </label>
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
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                계약 시작일
                <span className="ml-1.5 text-[10px] font-mono text-brand-600 bg-brand-50 px-1 py-0.5 rounded">{'{{CONTRACT_START_DATE}}'}</span>
              </label>
              <input
                type="date"
                value={formData.contract_start_date}
                onChange={(e) => setFormData((prev) => ({ ...prev, contract_start_date: e.target.value }))}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                계약 종료일
                <span className="ml-1.5 text-[10px] font-mono text-brand-600 bg-brand-50 px-1 py-0.5 rounded">{'{{CONTRACT_END_DATE}}'}</span>
              </label>
              <input
                type="date"
                value={formData.contract_end_date}
                onChange={(e) => setFormData((prev) => ({ ...prev, contract_end_date: e.target.value }))}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              서비스 범위 (품목)
              <span className="ml-1.5 text-[10px] font-mono text-brand-600 bg-brand-50 px-1 py-0.5 rounded">{'{{SELECTED_ITEMS_LIST}}'}</span>
            </label>
            <textarea
              value={formData.service_scope}
              onChange={(e) => setFormData((prev) => ({ ...prev, service_scope: e.target.value }))}
              placeholder={'주방후드 청소\n바닥 왁스 코팅\n에어컨 필터 세척'}
              rows={4}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none leading-relaxed"
            />
            <p className="text-xs text-text-tertiary mt-1">한 줄에 항목 하나씩 입력하세요. 계약서 본문에 목록으로 표시됩니다.</p>
          </div>

          {/* 수동 입력 변수 */}
          {Object.entries(templateVarConfig).some(([, cfg]: [string, VarConfig]) => cfg.mode === 'manual') && (
            <div className="space-y-3 border-t border-border-subtle pt-3">
              <p className="text-sm font-medium text-text-primary">추가 정보 입력</p>
              {(Object.entries(templateVarConfig) as [string, VarConfig][])
                .filter(([, cfg]) => cfg.mode === 'manual')
                .map(([varName, cfg]) => (
                  <div key={varName}>
                    <label className="block text-sm font-medium text-text-primary mb-1.5">
                      {cfg.label || varName}
                      <span className="ml-1.5 text-xs font-normal text-text-tertiary font-mono">{`{{${varName}}}`}</span>
                    </label>
                    <input
                      type="text"
                      value={manualVarValues[varName] ?? ''}
                      onChange={(e) => setManualVarValues(prev => ({ ...prev, [varName]: e.target.value }))}
                      placeholder={cfg.label || varName}
                      className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
                    />
                  </div>
                ))}
            </div>
          )}

          {/* 변수 매핑 확인 패널 */}
          {formData.customer_id && (
            <div className="rounded-xl border border-border-subtle overflow-hidden">
              <div className="px-3 py-2 bg-surface-sunken border-b border-border-subtle flex items-center justify-between">
                <p className="text-xs font-semibold text-text-secondary">변수 매핑 확인</p>
                <span className="text-[10px] text-text-tertiary">
                  {varPreviewEntries.filter(e => e.value).length}/{varPreviewEntries.length} 매핑됨
                </span>
              </div>
              <div className="divide-y divide-border-subtle max-h-48 overflow-y-auto">
                {varPreviewEntries.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-2 px-3 py-1.5">
                    <code className="text-[10px] font-mono text-brand-600 shrink-0 leading-none">
                      {`{{${entry.name}}}`}
                    </code>
                    <span className="text-xs text-text-tertiary flex-1 truncate">{entry.label}</span>
                    {entry.value ? (
                      <span className="text-[11px] text-state-success font-medium truncate max-w-[100px] shrink-0">
                        ✓ {entry.value}
                      </span>
                    ) : (
                      <span className="text-[11px] text-state-warning shrink-0">⚠ 미입력</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

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
              onClick={handlePreview}
              isLoading={isPreviewLoading}
            >
              미리보기 →
            </Button>
          </div>
        </div>
      </Modal>
      {/* 계약서 미리보기 + 편집 오버레이 */}
      {createStep === 'preview' && (
        <div className="fixed inset-0 z-50 bg-surface flex flex-col">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-border-subtle shrink-0 bg-surface">
            <button
              onClick={() => { setCreateStep('form'); setShowCreateModal(true) }}
              className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              ← 수정하기
            </button>
            <p className="text-sm font-semibold text-text-primary">계약서 확인 및 편집</p>
            <Button onClick={handleCreate} isLoading={isCreating} size="sm">
              계약서 생성
            </Button>
          </div>
          {/* 에디터 본문 */}
          <div className="flex-1 overflow-auto p-6 max-w-5xl mx-auto w-full">
            <ContractEditor value={previewHtml} onChange={setPreviewHtml} />
          </div>
        </div>
      )}
    </div>
  )
}
