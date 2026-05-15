'use client'

import { useRef } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { UserRole } from '@/types/database'

const ROLE_LABELS: Record<UserRole, string> = {
  admin: '관리자',
  worker: '직원',
  customer: '고객',
}

export interface CustomerItem {
  id: string
  business_name: string
  contact_name: string
  contact_phone: string
  email?: string
  business_number?: string
  user_id?: string | null
}

export interface WorkerItem {
  id: string
  name: string
  phone: string
  employment_type?: string
  user_id?: string | null
}

export interface RegisterFormData {
  role: UserRole
  name: string
  phone: string
  email: string
  customer_id?: string
  worker_id?: string
  business_number?: string
}

interface Props {
  form: RegisterFormData
  setForm: (updater: (prev: RegisterFormData) => RegisterFormData) => void
  saving: boolean
  onSubmit: () => void
  onClose: () => void

  customers: CustomerItem[]
  customerSearch: string
  setCustomerSearch: (v: string) => void
  showCustomerDropdown: boolean
  setShowCustomerDropdown: (v: boolean) => void

  workers: WorkerItem[]
  workerSearch: string
  setWorkerSearch: (v: string) => void
  showWorkerDropdown: boolean
  setShowWorkerDropdown: (v: boolean) => void

  existingCustomerUser: boolean
  normalizedPhone: string
}

function normalizePhone(phone: string) {
  return phone.replace(/-/g, '')
}

export default function RegisterForm({
  form, setForm, saving, onSubmit, onClose,
  customers, customerSearch, setCustomerSearch, showCustomerDropdown, setShowCustomerDropdown,
  workers, workerSearch, setWorkerSearch, showWorkerDropdown, setShowWorkerDropdown,
  existingCustomerUser, normalizedPhone,
}: Props) {
  const customerInputRef = useRef<HTMLInputElement>(null)
  const workerInputRef = useRef<HTMLInputElement>(null)

  const filteredCustomers = customers.filter(c => {
    const q = customerSearch.toLowerCase()
    return (
      c.business_name.toLowerCase().includes(q) ||
      (c.contact_name ?? '').toLowerCase().includes(q) ||
      (c.contact_phone ?? '').replace(/-/g, '').includes(q)
    )
  }).slice(0, 50)

  const filteredWorkers = workers.filter(w => {
    const q = workerSearch.toLowerCase()
    return (
      (w.name ?? '').toLowerCase().includes(q) ||
      (w.phone ?? '').replace(/-/g, '').includes(q)
    )
  }).slice(0, 50)

  const selectedWorker = workers.find(w => w.id === form.worker_id)
  const workerHasAccount = !!selectedWorker?.user_id
  const selectedCustomer = customers.find(c => c.id === form.customer_id)
  const customerHasAccount = !!selectedCustomer?.user_id
  const showCredentials =
    normalizedPhone.length >= 10 &&
    !customerHasAccount &&
    !existingCustomerUser &&
    !(form.role !== 'customer' && workerHasAccount)

  return (
    <Card className="p-5 mb-4 border-brand-200 bg-brand-50">
      <h2 className="font-semibold text-text-primary mb-4">새 회원 등록</h2>
      <div className="space-y-3">

        {/* 역할 선택 */}
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1.5 block">역할</label>
          <div className="flex gap-2">
            {(['admin', 'worker', 'customer'] as UserRole[]).map(r => (
              <button
                key={r}
                onClick={() => {
                  setForm(() => ({ role: r, name: '', phone: '', email: '' }))
                  setCustomerSearch('')
                  setWorkerSearch('')
                  setShowCustomerDropdown(false)
                  setShowWorkerDropdown(false)
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  form.role === r
                    ? 'bg-brand-600 text-white'
                    : 'bg-surface text-text-secondary border border-border'
                }`}
              >
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        {/* 고객: 고객DB 검색 */}
        {form.role === 'customer' ? (
          <>
            <div className="relative">
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">
                고객 검색 *
                <span className="text-text-tertiary font-normal ml-1">— 업체명, 담당자명, 전화번호</span>
              </label>
              <input
                ref={customerInputRef}
                type="text"
                value={customerSearch}
                onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true) }}
                onFocus={() => setShowCustomerDropdown(true)}
                onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                placeholder="예: 스타벅스, 홍길동, 01012345678"
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface"
              />
              {showCustomerDropdown && (
                <div className="absolute z-20 mt-1 w-full bg-surface border border-border rounded-lg shadow-pop max-h-56 overflow-y-auto">
                  {filteredCustomers.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-text-tertiary text-center">
                      {customers.length === 0 ? '고객 목록 불러오는 중...' : '검색 결과 없음'}
                    </p>
                  ) : filteredCustomers.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => {
                        const normalized = normalizePhone(c.contact_phone ?? '')
                        setForm(f => ({
                          ...f,
                          name: c.contact_name || c.business_name,
                          phone: normalized,
                          email: c.email ?? '',
                          customer_id: c.id,
                          business_number: (c.business_number ?? '').replace(/-/g, ''),
                        }))
                        setCustomerSearch(c.business_name)
                        setShowCustomerDropdown(false)
                      }}
                      className="w-full text-left px-3 py-2.5 hover:bg-brand-50 text-sm border-b border-border-subtle last:border-0"
                    >
                      <span className="font-medium text-text-primary">{c.business_name}</span>
                      {c.contact_name && <span className="text-text-secondary ml-2 text-xs">{c.contact_name}</span>}
                      {c.contact_phone && <span className="text-text-tertiary ml-2 text-xs">{c.contact_phone}</span>}
                      {c.user_id && <span className="ml-2 text-xs text-orange-600 font-semibold">계정있음</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {form.phone && !customerHasAccount && !existingCustomerUser && (
              <div className="bg-surface border border-border rounded-lg p-3 space-y-1.5 text-xs">
                <p className="text-xs font-semibold text-text-secondary mb-1">선택된 고객 정보</p>
                <div className="flex justify-between"><span className="text-text-secondary">이름</span><span className="font-medium text-text-primary">{form.name}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">회원유형</span><span className="font-medium text-text-primary">고객</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">ID</span><span className="font-mono font-medium text-text-primary">{normalizePhone(form.phone)}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">PW</span><span className="font-mono font-medium text-text-primary">{form.business_number || normalizePhone(form.phone)}</span></div>
              </div>
            )}

            {(existingCustomerUser || customerHasAccount) && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="text-xs text-orange-700 font-semibold">이미 계정이 존재합니다</p>
                <p className="text-xs text-orange-600 mt-0.5">이 고객은 이미 로그인 계정이 있습니다. 목록에서 수정을 사용하세요.</p>
              </div>
            )}
          </>
        ) : (
          /* 관리자/직원: workers DB 검색 */
          <>
            <div className="relative">
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">
                직원 검색 *
                <span className="text-text-tertiary font-normal ml-1">— 이름, 전화번호</span>
              </label>
              <input
                ref={workerInputRef}
                type="text"
                value={workerSearch}
                onChange={e => { setWorkerSearch(e.target.value); setShowWorkerDropdown(true) }}
                onFocus={() => setShowWorkerDropdown(true)}
                onBlur={() => setTimeout(() => setShowWorkerDropdown(false), 150)}
                placeholder="예: 홍길동, 01012345678"
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface"
              />
              {showWorkerDropdown && (
                <div className="absolute z-20 mt-1 w-full bg-surface border border-border rounded-lg shadow-pop max-h-56 overflow-y-auto">
                  {filteredWorkers.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-text-tertiary text-center">
                      {workers.length === 0 ? '직원 목록 불러오는 중...' : '검색 결과 없음'}
                    </p>
                  ) : filteredWorkers.map(w => (
                    <button
                      key={w.id}
                      type="button"
                      onMouseDown={() => {
                        setForm(f => ({ ...f, name: w.name, phone: normalizePhone(w.phone ?? ''), worker_id: w.id }))
                        setWorkerSearch(w.name)
                        setShowWorkerDropdown(false)
                      }}
                      className="w-full text-left px-3 py-2.5 hover:bg-brand-50 text-sm border-b border-border-subtle last:border-0"
                    >
                      <span className="font-medium text-text-primary">{w.name}</span>
                      {w.employment_type && <span className="text-text-tertiary ml-2 text-xs">{w.employment_type}</span>}
                      {w.phone && <span className="text-text-tertiary ml-2 text-xs">{w.phone}</span>}
                      {w.user_id && <span className="ml-2 text-xs text-orange-600 font-semibold">계정있음</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {form.worker_id && form.phone && (
              workerHasAccount ? (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <p className="text-xs text-orange-700 font-semibold">이미 계정이 존재합니다</p>
                  <p className="text-xs text-orange-600 mt-0.5">이 직원은 이미 로그인 계정이 있습니다. 목록에서 수정을 사용하세요.</p>
                </div>
              ) : (
                <div className="bg-surface border border-border rounded-lg p-3 space-y-1.5 text-xs">
                  <p className="text-xs font-semibold text-text-secondary mb-1">선택된 직원 정보</p>
                  <div className="flex justify-between"><span className="text-text-secondary">이름</span><span className="font-medium text-text-primary">{form.name}</span></div>
                  <div className="flex justify-between"><span className="text-text-secondary">회원유형</span><span className="font-medium text-text-primary">{ROLE_LABELS[form.role]}</span></div>
                  <div className="flex justify-between"><span className="text-text-secondary">ID</span><span className="font-mono font-medium text-text-primary">{normalizePhone(form.phone)}</span></div>
                  <div className="flex justify-between"><span className="text-text-secondary">PW</span><span className="font-mono font-medium text-text-primary">{normalizePhone(form.phone)}bbk</span></div>
                </div>
              )
            )}
          </>
        )}

        {/* 자동 생성 로그인 정보 미리보기 */}
        {showCredentials && (
          <div className="bg-state-success-bg border border-green-200 rounded-lg p-3 space-y-1.5">
            <p className="text-xs font-semibold text-state-success mb-1">자동 생성 로그인 정보</p>
            <div className="flex justify-between text-xs"><span className="text-text-secondary">이름</span><span className="font-medium text-text-primary">{form.name || '-'}</span></div>
            <div className="flex justify-between text-xs"><span className="text-text-secondary">회원유형</span><span className="font-medium text-text-primary">{ROLE_LABELS[form.role]}</span></div>
            <div className="flex justify-between text-xs">
              <span className="text-text-secondary">ID</span>
              <span className="font-mono font-medium text-text-primary">{normalizedPhone}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-secondary">PW</span>
              <span className="font-mono font-medium text-text-primary">
                {form.role === 'customer' ? (form.business_number || normalizedPhone) : `${normalizedPhone}bbk`}
              </span>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            onClick={onSubmit}
            isLoading={saving}
            className="flex-1"
            disabled={existingCustomerUser || customerHasAccount || workerHasAccount}
          >
            등록하기
          </Button>
          <Button variant="secondary" onClick={onClose} className="flex-1">취소</Button>
        </div>
      </div>
    </Card>
  )
}
