'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { Modal } from '@/components/ui'
import { SectionHeader } from '@/components/ui'
import SignaturePad, { type SignaturePadHandle } from '@/components/contracts/SignaturePad'
import { generateContractPdf } from '@/lib/generateContractPdf'

type SigningStatus = 'draft' | 'pending_customer' | 'customer_signed' | 'completed' | 'voided'

interface ContractDetail {
  id: string
  signing_status: SigningStatus
  subscription_plan: string | null
  visit_frequency: string | null
  monthly_price: number | null
  start_date: string | null
  end_date: string | null
  customer_agreed_at: string | null
  customer_ip: string | null
  admin_signed_at: string | null
  customer_phone: string | null
  signing_token: string | null
  token_expires_at: string | null
  article8_agree: boolean | null
  article14_agree: boolean | null
  contract_snapshot: { html?: string } | null
  customer_signature: string | null
  admin_signature: string | null
  signed_pdf_url: string | null
  voided_at: string | null
  void_reason: string | null
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
  voided: '파기',
}

const STATUS_COLORS: Record<SigningStatus, string> = {
  draft: 'bg-surface-sunken text-text-secondary',
  pending_customer: 'bg-state-warning-bg text-state-warning',
  customer_signed: 'bg-state-info-bg text-state-info',
  completed: 'bg-state-success-bg text-state-success',
  voided: 'bg-state-danger-bg text-state-danger',
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
  const [showVoidModal, setShowVoidModal] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isAdminSigning, setIsAdminSigning] = useState(false)
  const [isVoiding, setIsVoiding] = useState(false)
  const [voidReason, setVoidReason] = useState('')

  const sigPadRef = useRef<SignaturePadHandle | null>(null)

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

  useEffect(() => { void fetchContract() }, [fetchContract])

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
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
      toast.error('서명란에 서명을 그려주세요.')
      return
    }
    setIsAdminSigning(true)
    const tid = toast.loading('PDF 생성 중...')
    try {
      const adminSig = sigPadRef.current.toDataURL()
      const snapshotHtml = contract?.contract_snapshot?.html ?? ''
      const businessName = contract?.customers?.business_name ?? ''

      const pdfBase64 = await generateContractPdf({
        contractHtml: snapshotHtml,
        customerSignature: contract?.customer_signature ?? '',
        adminSignature: adminSig,
        businessName,
        customerAgreedAt: contract?.customer_agreed_at ?? null,
        adminSignedAt: new Date().toISOString(),
      })

      toast.loading('저장 중...', { id: tid })

      const res = await fetch(`/api/admin/contracts/${contractId}/admin-sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminSignature: adminSig, pdfBase64 }),
      })
      const json = await res.json()
      toast.dismiss(tid)

      if (json.success) {
        toast.success('계약서가 최종 확인되었습니다. 이메일이 발송됩니다.')
        setShowAdminSignModal(false)
        void fetchContract()
      } else {
        toast.error(json.error ?? '최종 확인에 실패했습니다.')
      }
    } catch {
      toast.dismiss(tid)
      toast.error('PDF 생성 중 오류가 발생했습니다.')
    } finally {
      setIsAdminSigning(false)
    }
  }

  const handleVoid = async () => {
    if (!voidReason.trim()) { toast.error('파기 사유를 입력해주세요.'); return }
    setIsVoiding(true)
    try {
      const res = await fetch(`/api/admin/contracts/${contractId}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: voidReason }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success('계약서가 파기되었습니다.')
        setShowVoidModal(false)
        setVoidReason('')
        void fetchContract()
      } else {
        toast.error(json.error ?? '파기에 실패했습니다.')
      }
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setIsVoiding(false)
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

  const SIG_PLACEHOLDER = (label: string) =>
    `<span style="display:inline-block;width:180px;height:60px;border:1px dashed #bbb;border-radius:6px;text-align:center;line-height:60px;color:#ccc;font-size:11px;font-family:sans-serif;">${label}</span>`
  const rawSnapshot = contract.contract_snapshot?.html ?? ''
  const snapshotHtml = rawSnapshot
    .replace(/\{\{CUSTOMER_SIGNATURE\}\}/g,
      contract.customer_signature
        ? `<img src="${contract.customer_signature}" style="max-width:200px;max-height:80px;object-fit:contain;" />`
        : SIG_PLACEHOLDER('(고객 서명)'))
    .replace(/\{\{ADMIN_SIGNATURE\}\}/g,
      contract.admin_signature
        ? `<img src="${contract.admin_signature}" style="max-width:200px;max-height:80px;object-fit:contain;" />`
        : SIG_PLACEHOLDER('(관리자 서명)'))
  const isVoided = contract.signing_status === 'voided'

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
            <div className="p-8 text-center text-text-tertiary text-sm">계약서 내용이 없습니다.</div>
          )}
        </div>

        {/* 우측 패널 */}
        <div className="xl:w-80 space-y-4">
          {/* 상태 카드 */}
          <div className="bg-surface rounded-2xl shadow-soft border border-border-subtle p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-text-primary">계약 상태</p>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[contract.signing_status] ?? ''}`}>
                {STATUS_LABELS[contract.signing_status] ?? contract.signing_status}
              </span>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-tertiary">서비스 플랜</span>
                <span className="text-text-primary font-medium">{contract.subscription_plan ?? '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-tertiary">방문 주기</span>
                <span className="text-text-primary font-medium">{contract.visit_frequency ?? '-'}</span>
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
                  {formatDate(contract.start_date)} ~<br />{formatDate(contract.end_date)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-tertiary">담당자 연락처</span>
                <span className="text-text-primary font-medium">{contract.customer_phone ?? '-'}</span>
              </div>
            </div>

            {/* 액션 버튼 */}
            {!isVoided && (
              <div className="pt-2 space-y-2">
                {(contract.signing_status === 'draft' || contract.signing_status === 'pending_customer') && (
                  <Button className="w-full" onClick={() => setShowSendModal(true)}>
                    {contract.signing_status === 'draft' ? '서명 요청 발송' : '서명 링크 재발송'}
                  </Button>
                )}
                {contract.signing_status === 'customer_signed' && (
                  <Button className="w-full" onClick={() => setShowAdminSignModal(true)}>
                    최종 확인 완료
                  </Button>
                )}
                {contract.signed_pdf_url && (
                  <a
                    href={contract.signed_pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <Button variant="secondary" className="w-full">PDF 다운로드</Button>
                  </a>
                )}
                <Button
                  variant="danger"
                  className="w-full"
                  onClick={() => setShowVoidModal(true)}
                >
                  계약 파기
                </Button>
              </div>
            )}

            {signLink && !isVoided && contract.signing_status !== 'completed' && (
              <div className="pt-2">
                <p className="text-xs text-text-tertiary mb-1">서명 링크</p>
                <div className="bg-surface-sunken rounded-md p-2 flex items-center gap-2">
                  <p className="text-xs text-text-secondary truncate flex-1">{signLink}</p>
                  <button
                    onClick={() => { void navigator.clipboard.writeText(signLink); toast.success('링크가 복사되었습니다.') }}
                    className="text-xs text-brand-600 hover:underline flex-shrink-0"
                  >
                    복사
                  </button>
                </div>
              </div>
            )}

            {isVoided && (
              <div className="bg-state-danger-bg rounded-lg p-3 text-sm space-y-1">
                <p className="font-medium text-state-danger">파기된 계약서</p>
                <p className="text-xs text-text-secondary">사유: {contract.void_reason ?? '-'}</p>
                <p className="text-xs text-text-tertiary">{formatDateTime(contract.voided_at)}</p>
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
                  {contract.customer_signature && (
                    <img
                      src={contract.customer_signature}
                      alt="고객 서명"
                      className="mt-1 max-h-12 border border-border rounded-md bg-white"
                    />
                  )}
                </div>
              )}
              {contract.admin_signed_at && (
                <div>
                  <span className="text-text-tertiary text-xs block">관리자 최종 확인</span>
                  <span className="text-text-primary">{formatDateTime(contract.admin_signed_at)}</span>
                  {contract.admin_signature && (
                    <img
                      src={contract.admin_signature}
                      alt="관리자 서명"
                      className="mt-1 max-h-12 border border-border rounded-md bg-white"
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 서명 요청 모달 */}
      <Modal open={showSendModal} onClose={() => setShowSendModal(false)} title="서명 요청 발송">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary leading-normal">
            <strong className="text-text-primary">{contract.customers?.business_name}</strong>({contract.customer_phone})에게
            계약서 서명 링크 SMS를 발송합니다.
          </p>
          <p className="text-xs text-text-tertiary bg-surface-sunken rounded-lg p-3 leading-relaxed">
            고객이 링크 접속 후 계약 내용 확인 → 조항 동의 → 서명 → OTP 인증 → 서명 완료 순으로 진행됩니다.
            링크 유효기간은 7일입니다.
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowSendModal(false)}>취소</Button>
            <Button className="flex-1" onClick={handleSendSMS} isLoading={isSending}>SMS 발송</Button>
          </div>
        </div>
      </Modal>

      {/* 관리자 최종 확인 모달 */}
      <Modal
        open={showAdminSignModal}
        onClose={() => { setShowAdminSignModal(false); sigPadRef.current?.clear() }}
        title="최종 확인 — 관리자 서명"
      >
        <div className="space-y-4">
          <div className="bg-state-success-bg rounded-lg p-3 text-sm text-state-success">
            고객 서명 일시: {formatDateTime(contract.customer_agreed_at)}
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary mb-2">관리자 서명</p>
            <SignaturePad ref={sigPadRef} />
            <div className="flex justify-end mt-1">
              <button
                type="button"
                onClick={() => sigPadRef.current?.clear()}
                className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
              >
                다시 그리기
              </button>
            </div>
          </div>
          <p className="text-xs text-text-tertiary leading-relaxed">
            서명 후 PDF가 자동 생성되어 고객 및 관리자 이메일로 발송됩니다.
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowAdminSignModal(false); sigPadRef.current?.clear() }}>
              취소
            </Button>
            <Button className="flex-1" onClick={handleAdminSign} isLoading={isAdminSigning}>
              최종 확인 완료
            </Button>
          </div>
        </div>
      </Modal>

      {/* 계약 파기 모달 */}
      <Modal open={showVoidModal} onClose={() => { setShowVoidModal(false); setVoidReason('') }} title="계약 파기">
        <div className="space-y-4 pt-2">
          <div className="bg-state-danger-bg rounded-lg p-3 text-sm text-state-danger">
            파기된 계약서는 복구할 수 없습니다. 신중하게 진행해주세요.
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              파기 사유 <span className="text-state-danger">*</span>
            </label>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="파기 사유를 입력해주세요."
              rows={3}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowVoidModal(false); setVoidReason('') }}>
              취소
            </Button>
            <Button variant="danger" className="flex-1" onClick={handleVoid} isLoading={isVoiding}>
              파기 확인
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
