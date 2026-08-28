'use client'

/**
 * 고객 A/S 요청 접수 페이지 (3단계 UX)
 *
 * step 1 'phone': 연락처 입력 → OTP 발송
 * step 2 'otp':   OTP 입력 → 확인 버튼으로 검증 (통과하면 30분 유효)
 * step 3 'form':  이름·업체명·카테고리·내용 입력 → 접수
 * step 4 'done':  완료 화면
 *
 * URL: https://app.bbkorea.co.kr/customer/claims/new (URL 은 기존 유지)
 * 카톡비즈니스·안내 문자·명함 QR 등에 이 URL 을 배포.
 */

import { useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'

const CATEGORIES = ['청소 미흡', '파손·훼손', '시간 지연', '작업자 태도', '기타'] as const

type Step = 'phone' | 'otp' | 'form' | 'done'

export default function CustomerClaimsNewPage() {
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [category, setCategory] = useState<string>('')
  const [content, setContent] = useState('')
  const [reporterName, setReporterName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [isRework, setIsRework] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [result, setResult] = useState<{ business_name: string | null; customer_name: string | null } | null>(null)

  function startCooldown() {
    setCooldown(60)
    const timer = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  async function handleSendOtp() {
    const digits = phone.replace(/-/g, '')
    if (!/^(010|011|016|017|018|019)\d{7,8}$/.test(digits)) {
      toast.error('올바른 전화번호를 입력해주세요.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/customer/claims/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '발송 실패')
      toast.success('인증번호가 발송되었습니다.')
      setStep('otp')
      startCooldown()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '발송 실패')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp() {
    if (!otp.trim() || otp.length !== 6) {
      toast.error('6자리 인증번호를 입력해주세요.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/customer/claims/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.replace(/-/g, ''), otp: otp.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '인증 실패')
      toast.success('인증되었습니다. 30분 안에 접수를 완료해 주세요.')
      setStep('form')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '인증 실패')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit() {
    if (!category) {
      toast.error('카테고리를 선택해주세요.')
      return
    }
    if (content.trim().length < 5) {
      toast.error('세부 내용을 5자 이상 입력해주세요.')
      return
    }
    setLoading(true)
    try {
      // OTP 는 이미 verify-otp 로 사전 검증됨 → 여기서는 phone 만으로 verified 상태 소비
      const res = await fetch('/api/customer/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.replace(/-/g, ''),
          category,
          content: content.trim(),
          is_rework: isRework,
          reporter_name: reporterName.trim() || null,
          business_name: businessName.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '접수 실패')
      setResult({ business_name: data.business_name, customer_name: data.customer_name })
      setStep('done')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '접수 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-sunken flex items-center justify-center p-4">
      <Toaster position="top-center" />
      <div className="w-full max-w-md bg-surface rounded-2xl shadow-soft border border-border-subtle p-6">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-text-primary">BBK A/S 요청 접수</h1>
          <p className="text-xs text-text-tertiary mt-1">불편사항을 신속하게 확인·조치해 드리겠습니다</p>
        </div>

        {step === 'phone' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-text-primary mb-1.5">연락처</label>
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="010-1234-5678"
                className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-[10px] text-text-tertiary mt-1">본인 확인용 인증번호를 문자로 보내드립니다</p>
            </div>
            <button
              onClick={handleSendOtp}
              disabled={loading}
              className="w-full bg-brand-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
            >
              {loading ? '발송 중...' : '인증번호 발송'}
            </button>
          </div>
        )}

        {step === 'otp' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-text-primary mb-1.5">인증번호 (6자리)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  autoFocus
                  className="flex-1 border border-border rounded-lg px-3 py-2.5 text-sm font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button
                  onClick={handleVerifyOtp}
                  disabled={loading || otp.length !== 6}
                  className="px-4 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 shrink-0"
                >
                  {loading ? '확인 중' : '확인'}
                </button>
              </div>
              <p className="text-[10px] text-text-tertiary mt-1">5분간 유효 · 5회 실패 시 15분 잠금</p>
            </div>

            <button
              onClick={handleSendOtp}
              disabled={cooldown > 0 || loading}
              className="w-full border border-border rounded-lg py-2 text-xs text-text-secondary hover:bg-surface-sunken disabled:opacity-50"
            >
              {cooldown > 0 ? `${cooldown}초 후 재발송 가능` : '인증번호 재발송'}
            </button>

            <button
              onClick={() => { setStep('phone'); setOtp('') }}
              className="w-full text-[11px] text-text-tertiary hover:text-text-secondary underline underline-offset-2"
            >
              연락처 다시 입력
            </button>
          </div>
        )}

        {step === 'form' && (
          <div className="space-y-4">
            <div className="bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">
              <p className="text-xs text-brand-800">
                ✓ 인증 완료 <span className="text-brand-600">({phone.replace(/-/g, '').replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')})</span>
              </p>
              <p className="text-[10px] text-brand-700 mt-0.5">30분 안에 아래 내용을 작성해 주세요</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-primary mb-1.5">이름 <span className="text-text-tertiary font-normal">(선택)</span></label>
              <input
                type="text"
                value={reporterName}
                onChange={e => setReporterName(e.target.value)}
                placeholder="홍길동"
                className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-primary mb-1.5">업체명 <span className="text-text-tertiary font-normal">(선택)</span></label>
              <input
                type="text"
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                placeholder="예: OO식당"
                className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-[10px] text-text-tertiary mt-1">등록된 연락처면 자동으로 채워집니다. 잊으신 경우 직접 입력해주세요.</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-primary mb-1.5">카테고리</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">선택해주세요</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-primary mb-1.5">세부 내용</label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={5}
                placeholder="어떤 문제가 있었는지 최대한 자세히 알려주세요"
                className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              />
              <p className="text-[10px] text-text-tertiary mt-1">{content.length}자 (최소 5자)</p>
            </div>

            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input type="checkbox" checked={isRework} onChange={e => setIsRework(e.target.checked)} />
              재청소·재작업을 원합니다
            </label>

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-brand-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
            >
              {loading ? '접수 중...' : 'A/S 요청 접수'}
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-text-primary mb-2">접수가 완료되었습니다</h2>
            {result?.business_name && (
              <p className="text-sm text-text-secondary mb-4">
                <b>{result.business_name}</b>
                {result.customer_name && ` · ${result.customer_name}님`}
              </p>
            )}
            <p className="text-xs text-text-tertiary leading-relaxed">
              담당자가 확인 후 <b>24시간 이내</b>에<br />연락드리겠습니다.
            </p>
            <p className="mt-6 text-xs text-text-tertiary">문의: 1522-9597</p>
          </div>
        )}
      </div>
    </div>
  )
}
