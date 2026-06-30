'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui'
import { Modal } from '@/components/ui'
import SignaturePad, { type SignaturePadHandle } from '@/components/contracts/SignaturePad'
import { Clock, CheckCircle, AlertTriangle, Maximize2, X } from 'lucide-react'
import { injectProcessFieldPlaceholders } from '@/lib/contractTemplate'
import { StampUpload } from '@/components/contracts/StampUpload'

interface ContractData {
  id: string
  signingStatus: string
  html: string
  servicePlan: string | null
  visitOption: string | null
  contractStartDate: string | null
  contractEndDate: string | null
  businessName: string | null
}

type PageState = 'loading' | 'ready' | 'signed' | 'error' | 'expired'
type ModalStep = 'signature' | 'otp'

export default function SignContractPage() {
  const params = useParams()
  const token = params.token as string

  const [pageState, setPageState] = useState<PageState>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [contractData, setContractData] = useState<ContractData | null>(null)

  // 동의 체크박스
  const [allChecked, setAllChecked] = useState(false)
  const [article8, setArticle8] = useState(false)
  const [article14, setArticle14] = useState(false)

  // 서명 + OTP 모달
  const [showModal, setShowModal] = useState(false)
  const [modalStep, setModalStep] = useState<ModalStep>('signature')
  const [signerName, setSignerName] = useState('') // 성명 손글씨 data URL
  const [customerStamp, setCustomerStamp] = useState<string | null>(null) // 고객사 직인
  const [sigError, setSigError] = useState('')
  const sigPadRef = useRef<SignaturePadHandle | null>(null)
  const signerNamePadRef = useRef<SignaturePadHandle | null>(null)
  const [signatureDataUrl, setSignatureDataUrl] = useState('')
  const [showContractFull, setShowContractFull] = useState(false)

  // OTP
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [isAgreeing, setIsAgreeing] = useState(false)
  const [otpError, setOtpError] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 계약서 데이터 조회
  useEffect(() => {
    const fetchContract = async () => {
      try {
        const res = await fetch(`/api/contracts/sign/${token}`)
        const json = await res.json()
        if (json.success) {
          if (json.data.signingStatus === 'customer_signed' || json.data.signingStatus === 'completed') {
            setPageState('signed')
          } else {
            setContractData(json.data)
            setPageState('ready')
          }
        } else {
          if (res.status === 410) setPageState('expired')
          else if (res.status === 409) setPageState('signed')
          else {
            setErrorMessage(json.error ?? '계약서를 불러오지 못했습니다.')
            setPageState('error')
          }
        }
      } catch {
        setErrorMessage('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
        setPageState('error')
      }
    }
    void fetchContract()
  }, [token])

  useEffect(() => {
    setAllChecked(article8 && article14)
  }, [article8, article14])

  const handleAllCheck = (checked: boolean) => {
    setAllChecked(checked)
    setArticle8(checked)
    setArticle14(checked)
  }

  useEffect(() => {
    if (cooldown <= 0) return
    cooldownRef.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current!); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current) }
  }, [cooldown])

  const resetModal = () => {
    setShowModal(false)
    setModalStep('signature')
    setSignerName('')
    setCustomerStamp(null)
    setSigError('')
    setSignatureDataUrl('')
    setOtpError('')
    setOtp('')
    setOtpSent(false)
    setCooldown(0)
    signerNamePadRef.current?.clear()
  }

  const handleNextToOtp = () => {
    if (!signerNamePadRef.current || signerNamePadRef.current.isEmpty()) {
      setSigError('성명란에 성명을 손으로 써주세요.')
      return
    }
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
      setSigError('서명란에 서명을 그려주세요.')
      return
    }
    setSigError('')
    setSignerName(signerNamePadRef.current.toDataURL())
    setSignatureDataUrl(sigPadRef.current.toDataURL())
    setModalStep('otp')
  }

  const handleSendOtp = async () => {
    if (!phone.trim()) { setOtpError('전화번호를 입력해주세요.'); return }
    setIsSendingOtp(true)
    setOtpError('')
    try {
      const res = await fetch(`/api/contracts/sign/${token}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const json = await res.json()
      if (json.success) { setOtpSent(true); setCooldown(60) }
      else setOtpError(json.error ?? '발송에 실패했습니다.')
    } catch {
      setOtpError('오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsSendingOtp(false)
    }
  }

  const handleAgree = async () => {
    if (!otp.trim() || otp.length !== 6) {
      setOtpError('6자리 인증번호를 입력해주세요.')
      return
    }
    setIsAgreeing(true)
    setOtpError('')
    try {
      const res = await fetch(`/api/contracts/sign/${token}/agree`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          otp,
          article8Agree: true,
          article14Agree: true,
          customerSignature: signatureDataUrl,
          customerSignerName: signerName.trim(),
          customerStamp: customerStamp ?? undefined,
        }),
      })
      const json = await res.json()
      if (json.success) { resetModal(); setPageState('signed') }
      else setOtpError(json.error ?? '인증에 실패했습니다.')
    } catch {
      setOtpError('오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsAgreeing(false)
    }
  }

  // ── 로딩 ──────────────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-surface-sunken flex items-center justify-center">
        <div className="text-center space-y-3">
          <span className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin inline-block" />
          <p className="text-sm text-text-secondary">계약서를 불러오는 중입니다...</p>
        </div>
      </div>
    )
  }

  if (pageState === 'expired') {
    return (
      <div className="min-h-screen bg-surface-sunken flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-surface rounded-2xl shadow-soft p-8 text-center space-y-4">
          <Clock size={40} className="mx-auto text-text-tertiary" />
          <h1 className="text-lg font-bold text-text-primary">링크가 만료되었습니다</h1>
          <p className="text-sm text-text-secondary leading-relaxed">
            서명 링크의 유효기간(7일)이 지났습니다.<br />
            담당자에게 연락하여 링크 재발송을 요청해주세요.
          </p>
          <p className="text-sm text-text-tertiary">031-759-4877 / 010-5434-4877</p>
        </div>
      </div>
    )
  }

  if (pageState === 'signed') {
    return (
      <div className="min-h-screen bg-surface-sunken flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-surface rounded-2xl shadow-soft p-8 text-center space-y-4">
          <CheckCircle size={40} className="mx-auto text-state-success" />
          <h1 className="text-lg font-bold text-text-primary">서명이 완료되었습니다</h1>
          <p className="text-sm text-text-secondary leading-relaxed">
            계약서 서명이 완료되었습니다.<br />
            담당자가 최종 확인 후 계약이 성립됩니다.
          </p>
          <p className="text-xs text-text-tertiary">
            문의: 031-759-4877 / sunrise@bbkorea.co.kr
          </p>
        </div>
      </div>
    )
  }

  if (pageState === 'error') {
    return (
      <div className="min-h-screen bg-surface-sunken flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-surface rounded-2xl shadow-soft p-8 text-center space-y-4">
          <AlertTriangle size={40} className="mx-auto text-state-warning" />
          <h1 className="text-lg font-bold text-text-primary">접근할 수 없습니다</h1>
          <p className="text-sm text-text-secondary leading-relaxed">{errorMessage}</p>
          <p className="text-xs text-text-tertiary">031-759-4877 / 010-5434-4877</p>
        </div>
      </div>
    )
  }

  // ── 서명 메인 화면 ─────────────────────────────────────────
  const canSign = article8 && article14
  const contractDisplayHtml = injectProcessFieldPlaceholders(contractData?.html ?? '')

  return (
    <div className="min-h-screen bg-surface-sunken">
      {/* 헤더 */}
      <header className="bg-surface border-b border-border-subtle sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">B</span>
          </div>
          <div>
            <p className="text-sm font-bold text-text-primary leading-tight">BBK 공간케어</p>
            <p className="text-xs text-text-tertiary">계약서 서명</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-32">
        {/* 계약 정보 요약 */}
        <div className="bg-surface rounded-2xl shadow-soft border border-border-subtle p-5">
          <p className="text-sm font-semibold text-text-primary mb-3">계약 정보</p>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-text-tertiary">고객사</span>
              <span className="text-text-primary font-medium">{contractData?.businessName ?? '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-tertiary">서비스 플랜</span>
              <span className="text-text-primary font-medium">{contractData?.servicePlan ?? '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-tertiary">방문 주기</span>
              <span className="text-text-primary font-medium">{contractData?.visitOption ?? '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-tertiary">계약 기간</span>
              <span className="text-text-primary font-medium">
                {contractData?.contractStartDate ?? '-'} ~ {contractData?.contractEndDate ?? '-'}
              </span>
            </div>
          </div>
        </div>

        {/* 계약서 본문 */}
        <div className="bg-surface rounded-2xl shadow-soft border border-border-subtle overflow-hidden">
          <div className="p-4 border-b border-border-subtle flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-secondary">계약서 전문</p>
              <p className="text-xs text-text-tertiary mt-0.5">아래 내용을 끝까지 읽어주세요</p>
            </div>
            <button
              type="button"
              onClick={() => setShowContractFull(true)}
              className="flex items-center gap-1 text-xs text-brand-600 font-medium hover:underline flex-shrink-0 ml-3"
            >
              <Maximize2 size={13} />
              전체 보기
            </button>
          </div>
          <div
            className="overflow-y-auto p-4"
            style={{ maxHeight: '50vh' }}
            dangerouslySetInnerHTML={{ __html: contractDisplayHtml }}
          />
        </div>

        {/* 동의 체크박스 */}
        <div className="bg-surface rounded-2xl shadow-soft border border-border-subtle p-5 space-y-3">
          <p className="text-sm font-semibold text-text-primary">동의 사항</p>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={(e) => handleAllCheck(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-brand-600 flex-shrink-0"
            />
            <span className="text-sm font-medium text-text-primary">
              위 계약 내용을 모두 확인하였으며, 전체 조항에 동의합니다.
            </span>
          </label>
          <div className="border-t border-border-subtle pt-3 space-y-2.5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={article8}
                onChange={(e) => setArticle8(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-brand-600 flex-shrink-0"
              />
              <span className="text-sm text-text-secondary">
                <span className="font-medium text-text-primary">[필수]</span> 제8조 (서비스 제공 장소 및 환경) 동의
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={article14}
                onChange={(e) => setArticle14(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-brand-600 flex-shrink-0"
              />
              <span className="text-sm text-text-secondary">
                <span className="font-medium text-text-primary">[필수]</span> 제14조 (개인정보 보호) 동의
              </span>
            </label>
          </div>
        </div>
      </main>

      {/* 하단 고정 서명 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border-subtle p-4 safe-area-inset-bottom">
        <div className="max-w-2xl mx-auto">
          <Button
            className="w-full"
            size="lg"
            disabled={!canSign}
            onClick={() => { setModalStep('signature'); setShowModal(true) }}
          >
            서명하기
          </Button>
          {!canSign && (
            <p className="text-xs text-text-tertiary text-center mt-2">
              모든 동의 항목을 체크해야 서명할 수 있습니다.
            </p>
          )}
        </div>
      </div>

      {/* 서명 + 인증 모달 */}
      <Modal
        open={showModal}
        onClose={resetModal}
        title={modalStep === 'signature' ? '서명' : '본인 인증'}
        description={
          modalStep === 'signature'
            ? '아래 서명란에 직접 서명해주세요.'
            : '계약서 서명을 위해 전화번호로 인증번호를 발송합니다.'
        }
      >
        {modalStep === 'signature' ? (
          <div className="space-y-4 pt-1">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                성명 <span className="text-state-danger">*</span>
              </label>
              <p className="text-xs text-text-tertiary mb-2">아래 칸에 성함을 직접 손으로 써주세요</p>
              <SignaturePad ref={signerNamePadRef} />
              <div className="flex justify-end mt-1">
                <button
                  type="button"
                  onClick={() => { signerNamePadRef.current?.clear(); setSigError('') }}
                  className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
                >
                  다시 쓰기
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                서명 <span className="text-state-danger">*</span>
              </label>
              <p className="text-xs text-text-tertiary mb-2">아래 칸에 서명을 그려주세요</p>
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

            <div className="border-t border-border-subtle pt-4">
              <StampUpload
                label="고객사 직인 (선택)"
                hint="서명 외에 직인을 추가할 수 있습니다. 이미지는 자동으로 2MB 이하로 압축됩니다."
                value={customerStamp}
                onChange={setCustomerStamp}
              />
            </div>

            {sigError && (
              <p className="text-sm text-state-danger bg-state-danger-bg rounded-lg px-3 py-2">
                {sigError}
              </p>
            )}
            <Button className="w-full" size="lg" onClick={handleNextToOtp}>
              다음 — 본인 인증
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            {/* 성명 + 서명 미리보기 */}
            {(signerName || signatureDataUrl) && (
              <div className="border border-border rounded-xl p-3 bg-surface-sunken space-y-2">
                {signerName && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-tertiary w-10 shrink-0">성명</span>
                    <img src={signerName} alt="성명" className="max-h-10 object-contain" />
                  </div>
                )}
                {signatureDataUrl && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-tertiary w-10 shrink-0">서명</span>
                    <img src={signatureDataUrl} alt="서명" className="max-h-12 object-contain" />
                  </div>
                )}
              </div>
            )}

            {/* 전화번호 */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">전화번호</label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010-0000-0000"
                  className="flex-1 border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600"
                  disabled={otpSent && cooldown > 0}
                />
                <Button
                  size="sm"
                  variant={otpSent ? 'secondary' : 'primary'}
                  onClick={handleSendOtp}
                  isLoading={isSendingOtp}
                  disabled={!phone.trim() || cooldown > 0}
                >
                  {cooldown > 0 ? `${cooldown}초` : otpSent ? '재발송' : '인증번호 발송'}
                </Button>
              </div>
            </div>

            {/* OTP */}
            {otpSent && (
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">인증번호 (6자리)</label>
                <input
                  type="number"
                  value={otp}
                  onChange={(e) => { setOtpError(''); setOtp(e.target.value.slice(0, 6)) }}
                  placeholder="000000"
                  maxLength={6}
                  className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600 tracking-widest text-center text-lg"
                />
                <p className="text-xs text-text-tertiary mt-1.5">인증번호는 5분간 유효합니다.</p>
              </div>
            )}

            {otpError && (
              <p className="text-sm text-state-danger bg-state-danger-bg rounded-lg px-3 py-2">
                {otpError}
              </p>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => { setModalStep('signature'); setOtpError('') }}
              >
                이전
              </Button>
              <Button
                className="flex-1"
                size="lg"
                onClick={handleAgree}
                isLoading={isAgreeing}
                disabled={!otpSent || otp.length !== 6}
              >
                서명 완료
              </Button>
            </div>

            <p className="text-xs text-text-tertiary text-center leading-relaxed">
              본인 인증 후 서명이 완료되며, 이는 전자서명법에 따라 서면 서명과 동일한 법적 효력을 가집니다.
            </p>
          </div>
        )}
      </Modal>

      {/* 계약서 전체 보기 풀스크린 */}
      {showContractFull && (
        <div className="fixed inset-0 z-50 bg-surface flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-surface sticky top-0">
            <p className="text-sm font-semibold text-text-primary">계약서 전문</p>
            <button
              type="button"
              onClick={() => setShowContractFull(false)}
              className="p-2 rounded-lg hover:bg-surface-sunken text-text-secondary"
              aria-label="닫기"
            >
              <X size={20} />
            </button>
          </div>
          <div
            className="flex-1 overflow-auto p-4"
            dangerouslySetInnerHTML={{ __html: contractDisplayHtml }}
          />
          <div className="p-4 border-t border-border-subtle bg-surface">
            <Button className="w-full" onClick={() => setShowContractFull(false)}>
              확인했습니다
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
