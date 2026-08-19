'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { Clock, CheckCircle, AlertTriangle, FileText, Check, Upload } from 'lucide-react'
import {
  MAX_FILE_SIZE_BYTES,
  ALLOWED_EXTENSIONS,
  isAllowedExtension,
  isAllowedMime,
} from '@/lib/workerDocuments'

type PageState = 'loading' | 'ready' | 'submitted' | 'error' | 'expired'

interface RequestItem {
  id: string
  documentType: string
  documentLabel: string
  uploaded: boolean
}

interface RequestData {
  requestId: string
  status: 'pending' | 'submitted' | 'expired'
  workerName: string
  otpPhoneMasked: string
  items: RequestItem[]
}

const ACCEPT_ATTR = ALLOWED_EXTENSIONS.map(ext => `.${ext}`).join(',')

export default function WorkerDocumentUploadPage() {
  const params = useParams()
  const token = params.token as string

  const [pageState, setPageState] = useState<PageState>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [data, setData] = useState<RequestData | null>(null)

  // itemId → File
  const [files, setFiles] = useState<Record<string, File | null>>({})

  // OTP
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchRequest = useCallback(async () => {
    try {
      const res = await fetch(`/api/worker-documents/${token}`)
      const json = await res.json()
      if (json.success) {
        setData(json.data)
        setPageState('ready')
      } else {
        if (res.status === 410) setPageState('expired')
        else if (res.status === 409) setPageState('submitted')
        else {
          setErrorMessage(json.error ?? '요청을 불러오지 못했습니다.')
          setPageState('error')
        }
      }
    } catch {
      setErrorMessage('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
      setPageState('error')
    }
  }, [token])

  useEffect(() => { void fetchRequest() }, [fetchRequest])

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

  const handleFileChange = (itemId: string, file: File | null) => {
    if (!file) {
      setFiles(prev => ({ ...prev, [itemId]: null }))
      return
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error('파일 크기가 10MB를 초과합니다.')
      return
    }
    if (!isAllowedExtension(file.name) || !isAllowedMime(file.type)) {
      toast.error('jpg, png, heic, pdf 형식만 업로드 가능합니다.')
      return
    }
    setFiles(prev => ({ ...prev, [itemId]: file }))
  }

  const handleSendOtp = async () => {
    setIsSendingOtp(true)
    try {
      const res = await fetch(`/api/worker-documents/${token}/send-otp`, { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        setOtpSent(true)
        setCooldown(60)
        toast.success('인증번호가 발송되었습니다.')
      } else {
        toast.error(json.error ?? '발송에 실패했습니다.')
      }
    } catch {
      toast.error('오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsSendingOtp(false)
    }
  }

  const allFilesReady = data?.items.every(it => files[it.id]) ?? false
  const canSubmit = allFilesReady && otpSent && otp.length === 6

  const handleSubmit = async () => {
    if (!data) return
    if (!allFilesReady) {
      toast.error('모든 서류의 파일을 업로드해주세요.')
      return
    }
    if (otp.length !== 6) {
      toast.error('6자리 인증번호를 입력해주세요.')
      return
    }

    setIsSubmitting(true)
    const tid = toast.loading('제출 중...')
    try {
      const fd = new FormData()
      fd.append('otp', otp)
      for (const it of data.items) {
        const file = files[it.id]
        if (file) fd.append(`file_${it.id}`, file)
      }
      const res = await fetch(`/api/worker-documents/${token}/submit`, {
        method: 'POST',
        body: fd,
      })
      const json = await res.json()
      toast.dismiss(tid)
      if (json.success) {
        toast.success('서류 제출이 완료되었습니다.')
        setPageState('submitted')
      } else {
        toast.error(json.error ?? '제출에 실패했습니다.')
      }
    } catch {
      toast.dismiss(tid)
      toast.error('오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── 상태별 화면 ──────────────────────────────────────────────

  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-surface-sunken flex items-center justify-center">
        <div className="text-center space-y-3">
          <span className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin inline-block" />
          <p className="text-sm text-text-secondary">요청을 불러오는 중입니다...</p>
        </div>
      </div>
    )
  }
  if (pageState === 'expired') {
    return (
      <StatusCard icon={<Clock size={40} className="text-text-tertiary" />} title="링크가 만료되었습니다">
        서류 요청 링크의 유효기간(7일)이 지났습니다.<br />
        담당자에게 재발송을 요청해주세요.
      </StatusCard>
    )
  }
  if (pageState === 'submitted') {
    return (
      <StatusCard icon={<CheckCircle size={40} className="text-state-success" />} title="제출이 완료되었습니다">
        서류가 정상적으로 제출되었습니다.<br />
        담당자가 확인 후 안내드립니다.
      </StatusCard>
    )
  }
  if (pageState === 'error') {
    return (
      <StatusCard icon={<AlertTriangle size={40} className="text-state-warning" />} title="접근할 수 없습니다">
        {errorMessage}
      </StatusCard>
    )
  }

  // ─── 업로드 폼 ────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-surface-sunken">
      <header className="bg-surface border-b border-border-subtle sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/bbk-logo.png"
            alt="BBK 범빌드코리아"
            className="w-9 h-9 object-contain flex-shrink-0"
          />
          <div>
            <p className="text-sm font-bold text-text-primary leading-tight">BBK 범빌드코리아</p>
            <p className="text-xs text-text-tertiary">서류 제출</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5 pb-32">
        <div className="bg-surface rounded-2xl shadow-soft border border-border-subtle p-5">
          <p className="text-lg font-bold text-text-primary">
            {data?.workerName}님, 안녕하세요
          </p>
          <p className="text-sm text-text-secondary mt-1 leading-relaxed">
            아래 서류를 모두 업로드하고 본인 인증 후 제출해주세요.
          </p>
        </div>

        {/* 서류 업로드 */}
        <div className="space-y-3">
          <p className="text-sm font-semibold text-text-primary px-1">
            서류 업로드 ({data?.items.filter(it => files[it.id]).length ?? 0}/{data?.items.length ?? 0})
          </p>
          {data?.items.map(item => {
            const file = files[item.id]
            return (
              <div key={item.id} className="bg-surface rounded-xl shadow-soft border border-border-subtle p-4">
                <div className="flex items-start gap-2 mb-2">
                  <FileText size={16} className="text-brand-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm font-medium text-text-primary flex-1">
                    {item.documentLabel}
                    <span className="text-state-danger ml-1">*</span>
                  </p>
                  {file && <Check size={16} className="text-state-success flex-shrink-0" />}
                </div>
                <label className="block cursor-pointer">
                  <div className={`border-2 border-dashed rounded-lg p-3 text-center transition-colors ${
                    file
                      ? 'border-state-success bg-state-success-bg'
                      : 'border-border hover:border-brand-600 hover:bg-brand-50'
                  }`}>
                    {file ? (
                      <div className="space-y-0.5">
                        <p className="text-xs font-medium text-text-primary truncate">{file.name}</p>
                        <p className="text-[10px] text-text-tertiary">
                          {(file.size / 1024 / 1024).toFixed(2)} MB · 다시 선택하려면 클릭
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Upload size={20} className="mx-auto text-text-tertiary" />
                        <p className="text-xs text-text-secondary">파일 선택</p>
                        <p className="text-[10px] text-text-tertiary">jpg, png, heic, pdf · 최대 10MB</p>
                      </div>
                    )}
                  </div>
                  <input
                    type="file"
                    accept={ACCEPT_ATTR}
                    onChange={e => handleFileChange(item.id, e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                </label>
              </div>
            )
          })}
        </div>

        {/* 본인 인증 */}
        <div className="bg-surface rounded-2xl shadow-soft border border-border-subtle p-5 space-y-3">
          <p className="text-sm font-semibold text-text-primary">본인 인증</p>
          <div className="bg-surface-sunken rounded-lg p-3">
            <p className="text-xs text-text-secondary">
              등록된 번호로 인증번호가 발송됩니다: <span className="font-mono font-medium text-text-primary">{data?.otpPhoneMasked}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={otpSent ? 'secondary' : 'primary'}
              onClick={handleSendOtp}
              isLoading={isSendingOtp}
              disabled={cooldown > 0 || !allFilesReady}
              className="flex-shrink-0"
            >
              {cooldown > 0 ? `${cooldown}초` : otpSent ? '재발송' : '인증번호 발송'}
            </Button>
            <input
              type="number"
              value={otp}
              onChange={e => setOtp(e.target.value.slice(0, 6))}
              placeholder="6자리 인증번호"
              maxLength={6}
              disabled={!otpSent}
              className="flex-1 border border-border rounded-md px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-600 tracking-widest text-center disabled:bg-surface-sunken disabled:text-text-tertiary"
            />
          </div>
          {!allFilesReady && (
            <p className="text-[11px] text-text-tertiary">
              모든 서류를 업로드해야 인증번호를 발송할 수 있습니다.
            </p>
          )}
          {otpSent && (
            <p className="text-[11px] text-text-tertiary">
              인증번호는 5분간 유효합니다.
            </p>
          )}
        </div>
      </main>

      {/* 하단 고정 제출 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border-subtle p-4">
        <div className="max-w-lg mx-auto">
          <Button
            className="w-full"
            size="lg"
            disabled={!canSubmit}
            isLoading={isSubmitting}
            onClick={handleSubmit}
          >
            제출하기
          </Button>
          {!canSubmit && !isSubmitting && (
            <p className="text-[11px] text-text-tertiary text-center mt-2">
              {!allFilesReady
                ? '모든 서류의 파일을 업로드해주세요.'
                : !otpSent
                  ? '인증번호를 발송해주세요.'
                  : otp.length !== 6
                    ? '6자리 인증번호를 입력해주세요.'
                    : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-sunken flex items-center justify-center px-4">
      <div className="max-w-sm w-full bg-surface rounded-2xl shadow-soft p-8 text-center space-y-4">
        <div className="mx-auto">{icon}</div>
        <h1 className="text-lg font-bold text-text-primary">{title}</h1>
        <p className="text-sm text-text-secondary leading-relaxed">{children}</p>
        <p className="text-xs text-text-tertiary">문의: 1522-9597</p>
      </div>
    </div>
  )
}
