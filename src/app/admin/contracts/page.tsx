'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { Modal } from '@/components/ui'
import { SectionHeader } from '@/components/ui'
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
  address: string | null
  address_detail: string | null
  business_number: string | null
  email: string | null
  contract_start_date: string | null
  contract_end_date: string | null
  care_scope: string | null
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

/** 모달에서 수집·수정하는 인적사항 (자동 표 8필드 + OTP 번호) */
interface ContractFormData {
  business_name: string
  contact_name: string
  contact_phone: string
  address: string
  business_number: string
  email: string
  contract_start_date: string
  contract_end_date: string
  care_scope: string
  otp_phone: string   // OTP 수신용 (기본은 contact_phone 과 동일)
}

const EMPTY_FORM: ContractFormData = {
  business_name: '', contact_name: '', contact_phone: '',
  address: '', business_number: '', email: '',
  contract_start_date: '', contract_end_date: '', care_scope: '',
  otp_phone: '',
}

export default function AdminContractsPage() {
  const router = useRouter()
  const [contracts, setContracts] = useState<ContractListItem[]>([])
  const [activeTab, setActiveTab] = useState('all')
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [contractToDelete, setContractToDelete] = useState<ContractListItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const [contractToDuplicate, setContractToDuplicate] = useState<ContractListItem | null>(null)
  const [isDuplicating, setIsDuplicating] = useState(false)

  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [customerInputValue, setCustomerInputValue] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const customerDropdownRef = useRef<HTMLDivElement>(null)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')

  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')

  const [formData, setFormData] = useState<ContractFormData>(EMPTY_FORM)
  const [isCreating, setIsCreating] = useState(false)
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
      if (json.success) setContracts(json.data ?? [])
    } catch {
      toast.error('계약서 목록을 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [activeTab])

  useEffect(() => { void fetchContracts() }, [fetchContracts])

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/admin/customers')
      const json = await res.json()
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
        const active: TemplateOption[] = (json.data ?? []).filter((t: TemplateOption) => t.is_active)
        setTemplates(active)
      }
    } catch { /* 무시 */ }
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
    setSelectedCustomerId('')
    setShowCustomerDropdown(false)
    setSelectedTemplateId('')
    setFormData(EMPTY_FORM)
    setShowCreateModal(true)
  }

  const filteredCustomers = customers.filter((c) => {
    if (selectedCustomerId || !customerInputValue) return true
    const q = customerInputValue.toLowerCase()
    return (
      (c.business_name ?? '').toLowerCase().includes(q) ||
      (c.contact_name ?? '').toLowerCase().includes(q) ||
      (c.contact_phone ?? '').includes(q)
    )
  })

  const handleCustomerSelect = (c: CustomerOption) => {
    const address = [c.address, c.address_detail].filter(Boolean).join(' ')
    setSelectedCustomerId(c.id)
    setFormData({
      business_name:       c.business_name       ?? '',
      contact_name:        c.contact_name        ?? '',
      contact_phone:       c.contact_phone       ?? '',
      address,
      business_number:     c.business_number     ?? '',
      email:               c.email               ?? '',
      contract_start_date: c.contract_start_date ?? '',
      contract_end_date:   c.contract_end_date   ?? '',
      care_scope:          c.care_scope          ?? '',
      otp_phone:           c.contact_phone       ?? '',
    })
    setCustomerInputValue(`${c.business_name} (${c.contact_name})`)
    setShowCustomerDropdown(false)
  }

  const setField = <K extends keyof ContractFormData>(k: K) => (v: string) =>
    setFormData(prev => ({ ...prev, [k]: v }))

  const buildPayload = () => ({
    customer_id: selectedCustomerId,
    template_id: selectedTemplateId,
    customer_phone: formData.otp_phone,
    customer_info: {
      business_name:       formData.business_name.trim(),
      contact_name:        formData.contact_name.trim(),
      contact_phone:       formData.contact_phone.trim(),
      address:             formData.address.trim(),
      business_number:     formData.business_number.trim(),
      email:               formData.email.trim(),
      contract_start_date: formData.contract_start_date,
      contract_end_date:   formData.contract_end_date,
      care_scope:          formData.care_scope.trim(),
    },
  })

  const handlePreview = async () => {
    if (!selectedCustomerId) { toast.error('고객을 선택해주세요.'); return }
    if (!selectedTemplateId) { toast.error('계약서 양식을 선택해주세요.'); return }
    if (!formData.business_name.trim()) { toast.error('업체명이 필요합니다.'); return }

    setIsPreviewLoading(true)
    try {
      const res = await fetch('/api/admin/contracts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
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
    if (!selectedCustomerId) { toast.error('고객을 선택해주세요.'); return }
    setIsCreating(true)
    try {
      const res = await fetch('/api/admin/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buildPayload(), html_body: previewHtml || undefined }),
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

  const handleDuplicateConfirm = async () => {
    if (!contractToDuplicate) return
    setIsDuplicating(true)
    try {
      const res = await fetch(`/api/admin/contracts/${contractToDuplicate.id}/duplicate`, {
        method: 'POST',
      })
      const json = await res.json()
      if (json.success) {
        toast.success('계약서가 복제되었습니다.')
        setContractToDuplicate(null)
        router.push(`/admin/contracts/${json.data.id}`)
      } else {
        toast.error(json.error ?? '복제에 실패했습니다.')
      }
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setIsDuplicating(false)
    }
  }

  const formatDate = (dateStr: string | null) => dateStr ? new Date(dateStr).toLocaleDateString('ko-KR') : '-'

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
                    {formatDate(contract.start_date)} ~ {formatDate(contract.end_date)}
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
                    onClick={(e) => { e.stopPropagation(); setContractToDuplicate(contract) }}
                    className="p-1.5 rounded-lg text-text-tertiary hover:text-brand-600 hover:bg-surface-sunken transition-colors"
                    title="계약서 복제"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setContractToDelete(contract) }}
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
              휴지통에서 60일간 보관 후 자동 삭제됩니다.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setContractToDelete(null)}>취소</Button>
            <Button variant="danger" className="flex-1" onClick={handleDeleteConfirm} isLoading={isDeleting}>휴지통으로 이동</Button>
          </div>
        </div>
      </Modal>

      {/* 계약서 복제 확인 모달 */}
      <Modal
        open={contractToDuplicate !== null}
        onClose={() => setContractToDuplicate(null)}
        title="계약서 복제"
      >
        <div className="space-y-4 pt-2">
          <div className="p-4 bg-surface-sunken rounded-xl border border-border-subtle">
            <p className="text-sm font-medium text-text-primary">
              <strong>{contractToDuplicate?.customers?.business_name ?? '고객'}</strong> 계약서를 복제하시겠습니까?
            </p>
            <p className="text-xs text-text-secondary mt-1 leading-relaxed">
              계약 내용은 그대로 승계되며, 새 <strong>초안</strong> 상태로 생성됩니다.
              서명·서명 링크·PDF 등은 초기화됩니다.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setContractToDuplicate(null)}>
              취소
            </Button>
            <Button className="flex-1" onClick={handleDuplicateConfirm} isLoading={isDuplicating}>
              복제하기
            </Button>
          </div>
        </div>
      </Modal>

      {/* 새 계약서 작성 모달 — v2 */}
      <Modal open={showCreateModal} onClose={handleCloseCreateModal} title="새 계약서 작성">
        <div className="space-y-5 pt-2">

          {/* 1) 계약서 양식 */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              계약서 양식 <span className="text-state-danger">*</span>
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              <option value="">양식을 선택하세요</option>
              {templates.map((tmpl) => (
                <option key={tmpl.id} value={tmpl.id}>{tmpl.name}</option>
              ))}
            </select>
          </div>

          {/* 2) 고객 선택 */}
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
                if (selectedCustomerId) setSelectedCustomerId('')
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
            <p className="text-xs text-text-tertiary mt-1">고객 선택 시 아래 인적사항이 자동 채워집니다. 이후 수정 가능.</p>
          </div>

          {/* 3) 인적사항 (자동 채움 + 수정) */}
          <div className="rounded-xl border border-border-subtle overflow-hidden">
            <div className="px-3 py-2 bg-surface-sunken border-b border-border-subtle">
              <p className="text-xs font-semibold text-text-secondary">인적사항 — 계약서 표에 사용됩니다</p>
            </div>
            <div className="p-3 grid grid-cols-2 gap-3">
              <LabeledInput label="업체명" required value={formData.business_name} onChange={setField('business_name')} />
              <LabeledInput label="고객명" required value={formData.contact_name} onChange={setField('contact_name')} />
              <LabeledInput label="연락처" value={formData.contact_phone} onChange={setField('contact_phone')} placeholder="010-0000-0000" />
              <LabeledInput label="이메일" value={formData.email} onChange={setField('email')} type="email" />
              <LabeledInput label="사업자등록번호" value={formData.business_number} onChange={setField('business_number')} placeholder="000-00-00000" />
              <LabeledInput label="주소" value={formData.address} onChange={setField('address')} />
            </div>
          </div>

          {/* 4) 계약기간 */}
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput label="계약 시작일" value={formData.contract_start_date} onChange={setField('contract_start_date')} type="date" />
            <LabeledInput label="계약 종료일" value={formData.contract_end_date} onChange={setField('contract_end_date')} type="date" />
          </div>

          {/* 5) 케어범위 */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">케어범위</label>
            <textarea
              value={formData.care_scope}
              onChange={(e) => setField('care_scope')(e.target.value)}
              placeholder="예: 주방후드·바닥·에어컨 필터 청소"
              rows={3}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none leading-relaxed"
            />
          </div>

          {/* 6) OTP 수신 번호 */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              OTP 수신 번호 <span className="text-text-tertiary text-xs">(연락처와 다르면 별도 입력)</span>
            </label>
            <input
              type="tel"
              value={formData.otp_phone}
              onChange={(e) => setField('otp_phone')(e.target.value)}
              placeholder="010-0000-0000"
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={handleCloseCreateModal}>취소</Button>
            <Button className="flex-1" onClick={handlePreview} isLoading={isPreviewLoading}>미리보기 →</Button>
          </div>
        </div>
      </Modal>

      {/* 계약서 미리보기 + 편집 오버레이 */}
      {createStep === 'preview' && (
        <div className="fixed inset-0 z-50 bg-surface flex flex-col">
          <div className="flex items-center justify-between px-6 py-3 border-b border-border-subtle shrink-0 bg-surface">
            <button
              onClick={() => { setCreateStep('form'); setShowCreateModal(true) }}
              className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              ← 수정하기
            </button>
            <p className="text-sm font-semibold text-text-primary">계약서 확인 및 편집</p>
            <Button onClick={handleCreate} isLoading={isCreating} size="sm">계약서 생성</Button>
          </div>
          <div className="flex-1 overflow-auto p-6 max-w-5xl mx-auto w-full">
            <ContractEditor value={previewHtml} onChange={setPreviewHtml} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 재사용 인풋 ──────────────────────────────────────────────────

function LabeledInput({
  label, value, onChange, type = 'text', placeholder, required = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  required?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-primary mb-1">
        {label}{required && <span className="text-state-danger ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-border rounded-md px-2.5 py-1.5 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
      />
    </div>
  )
}
