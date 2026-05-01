'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { Modal } from '@/components/ui'
import { SectionHeader } from '@/components/ui'

type SigningStatus = 'draft' | 'pending_customer' | 'customer_signed' | 'completed'

interface ContractDetail {
  id: string
  signing_status: SigningStatus
  service_plan: string | null
  visit_option: string | null
  monthly_price: number | null
  contract_start_date: string | null
  contract_end_date: string | null
  customer_agreed_at: string | null
  customer_ip: string | null
  admin_signed_at: string | null
  customer_phone: string | null
  signing_token: string | null
  token_expires_at: string | null
  article8_agree: boolean | null
  article14_agree: boolean | null
  contract_snapshot: { html?: string } | null
  created_at: string
  customers: {
    business_name: string
    contact_name: string
    contact_phone: string
    email: string | null
  } | null
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

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://bbk-app.vercel.app'

export default function AdminContractDetailPage() {
  const params = useParams()
  const router = useRouter()
  const contractId = params.id as string

  const [contract, setContract] = useState<ContractDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showSendModal, setShowSendModal] = useState(false)
  const [showAdminSignModal, setShowAdminSignModal] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isAdminSigning, setIsAdminSigning] = useState(false)

  const fetchContract = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/admin/contracts/${contractId}`)
      const json = await res.json()
      if (json.success) {
        setContract(json.data)
      } else {
        toast.error('계약서를 불러오지 못했습니다.')
        router.push('/admin/contracts')
      }
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [contractId, router])

  useEffect(() => {
    void fetchContract()
  }, [fetchContract])

  const handleSendSMS = async () => {
    setIsSending(true)
    try {
      const res = await fetch(`/api/admin/contracts/${contractId}/send`, { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        toast.success('서명 링크 SMS가 발송되었습니다.')
        setShowSendModal(false)
        void fetchContract()
      } else {
        toast.error(json.error ?? 'SMS 발송에 실패했습니다.')
      }
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setIsSending(false)
    }
  }

  const handleAdminSign = async () => {
    setIsAdminSigning(true)
    try {
      const res = await fetch(`/api/admin/contracts/${contractId}/admin-sign`, { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        toast.success('계약서가 최종 확인되었습니다.')
        setShowAdminSignModal(false)
        void fetchContract()
      } else {
        toast.error(json.error ?? '최종 확인에 실패했습니다.')
      }
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setIsAdminSigning(false)
    }
  }

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('ko-KR')
  }

  const signLink = contract?.signing_token
    ? `${APP_URL}/sign/${contract.signing_token}`
    : null

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <span className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!contract) return null

  const snapshotHtml = contract.contract_snapshot?.html ?? ''

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/admin/contracts')}
          className="text-text-tertiary hover:text-text-primary transition-colors"
        >
          ← 목록
        </button>
        <SectionHeader
          level="page"
          title={contract.customers?.business_name ?? '계약서 상세'}
        />
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        {/* 계약서 미리보기 */}
        <div className="flex-1 bg-surface rounded-2xl shadow-soft border border-border-subtle overflow-hidden">
          <div className="p-4 border-b border-border-subtle">
            <p className="text-sm font-medium text-text-secondary">계약서 미리보기</p>
          </div>
          {snapshotHtml ? (
            <iframe
              srcDoc={snapshotHtml}
              className="w-full"
              style={{ height: '70vh', border: 'none' }}
              title="계약서 미리보기"
            />
          ) : (
            <div className="p-8 text-center text-text-tertiary text-sm">
              계약서 내용이 없습니다.
            </div>
          )}
        </div>

        {/* 우측 패널 */}
        <div className="xl:w-80 space-y-4">
          {/* 상태 카드 */}
          <div className="bg-surface rounded-2xl shadow-soft border border-border-subtle p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-text-primary">계약 상태</p>
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  STATUS_COLORS[contract.signing_status] ?? ''
                }`}
              >
                {STATUS_LABELS[contract.signing_status] ?? contract.signing_status}
              </span>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-tertiary">서비스 플랜</span>
                <span className="text-text-primary font-medium">{contract.service_plan ?? '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-tertiary">방문 주기</span>
                <span className="text-text-primary font-medium">{contract.visit_option ?? '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-tertiary">월 요금</span>
                <span className="text-text-primary font-medium">
                  {contract.monthly_price ? `${contract.monthly_price.toLocaleString('ko-KR')}원` : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-tertiary">계약 기간</span>
                <span className="text-text-primary font-medium text-right">
                  {formatDate(contract.contract_start_date)} ~<br />{formatDate(contract.contract_end_date)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-tertiary">담당자 연락처</span>
                <span className="text-text-primary font-medium">{contract.customer_phone ?? '-'}</span>
              </div>
            </div>

            {/* 액션 버튼 */}
            <div className="pt-2 space-y-2">
              {(contract.signing_status === 'draft' || contract.signing_status === 'pending_customer') && (
                <Button
                  className="w-full"
                  onClick={() => setShowSendModal(true)}
                >
                  {contract.signing_status === 'draft' ? '서명 요청 발송' : '서명 링크 재발송'}
                </Button>
              )}

              {contract.signing_status === 'customer_signed' && (
                <Button
                  className="w-full"
                  onClick={() => setShowAdminSignModal(true)}
                >
                  최종 확인 완료
                </Button>
              )}
            </div>

            {signLink && contract.signing_status !== 'completed' && (
              <div className="pt-2">
                <p className="text-xs text-text-tertiary mb-1">서명 링크</p>
                <div className="bg-surface-sunken rounded-md p-2 flex items-center gap-2">
                  <p className="text-xs text-text-secondary truncate flex-1">{signLink}</p>
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(signLink)
                      toast.success('링크가 복사되었습니다.')
                    }}
                    className="text-xs text-brand-600 hover:underline flex-shrink-0"
                  >
                    복사
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 서명 이력 */}
          <div className="bg-surface rounded-2xl shadow-soft border border-border-subtle p-5 space-y-3">
            <p className="text-sm font-semibold text-text-primary">서명 이력</p>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-text-tertiary text-xs block">계약서 생성</span>
                <span className="text-text-primary">{formatDateTime(contract.created_at)}</span>
              </div>
              {contract.customer_agreed_at && (
                <div>
                  <span className="text-text-tertiary text-xs block">고객 서명 완료</span>
                  <span className="text-text-primary">{formatDateTime(contract.customer_agreed_at)}</span>
                  {contract.customer_ip && (
                    <span className="text-xs text-text-tertiary block">IP: {contract.customer_ip}</span>
                  )}
                  {contract.article8_agree && (
                    <span className="text-xs text-state-success block">제8조 동의 완료</span>
                  )}
                  {contract.article14_agree && (
                    <span className="text-xs text-state-success block">제14조 동의 완료</span>
                  )}
                </div>
              )}
              {contract.admin_signed_at && (
                <div>
                  <span className="text-text-tertiary text-xs block">관리자 최종 확인</span>
                  <span className="text-text-primary">{formatDateTime(contract.admin_signed_at)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 서명 요청 모달 */}
      <Modal
        open={showSendModal}
        onClose={() => setShowSendModal(false)}
        title="서명 요청 발송"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary leading-normal">
            <strong className="text-text-primary">{contract.customers?.business_name}</strong>({contract.customer_phone})에게
            계약서 서명 링크 SMS를 발송합니다.
          </p>
          <p className="text-xs text-text-tertiary bg-surface-sunken rounded-lg p-3 leading-relaxed">
            고객이 링크 접속 후 계약 내용 확인 → 조항 동의 → OTP 인증 → 서명 완료 순으로 진행됩니다.
            링크 유효기간은 7일입니다.
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowSendModal(false)}>
              취소
            </Button>
            <Button className="flex-1" onClick={handleSendSMS} isLoading={isSending}>
              SMS 발송
            </Button>
          </div>
        </div>
      </Modal>

      {/* 관리자 최종 확인 모달 */}
      <Modal
        open={showAdminSignModal}
        onClose={() => setShowAdminSignModal(false)}
        title="최종 확인"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary leading-normal">
            고객 서명이 완료된 계약서를 최종 확인합니다.
            확인 후 계약이 성립되며 고객에게 완료 SMS가 발송됩니다.
          </p>
          <div className="bg-state-success-bg rounded-lg p-3 text-sm text-state-success">
            고객 서명 일시: {formatDateTime(contract.customer_agreed_at)}
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowAdminSignModal(false)}>
              취소
            </Button>
            <Button className="flex-1" onClick={handleAdminSign} isLoading={isAdminSigning}>
              최종 확인 완료
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
