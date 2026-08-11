'use client'

/**
 * KG이니시스 심사원 전용 격리 신청서 페이지.
 * 심사원이 여기서 신청서 작성 → 자동으로 결제 페이지로 이동 → 결제 완료 흐름 재현.
 *
 * 로그인 불필요 (middleware public path 등록).
 * 심사 완료 후: 이 파일 삭제 예정.
 */
import { useState } from 'react'

export default function KgReviewFormPage() {
  const [businessName, setBusinessName] = useState('KG이니시스 심사원(테스트)')
  const [ownerName,    setOwnerName]    = useState('')
  const [phone,        setPhone]        = useState('')
  const [email,        setEmail]        = useState('')
  const [serviceType,  setServiceType]  = useState('1회성케어')
  const [amount,       setAmount]       = useState(88000)
  const [submitting,   setSubmitting]   = useState(false)
  const [error,        setError]        = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/kg-review/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName, ownerName, phone, email, serviceType, amount }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '신청서 처리 실패')
      // 자동으로 결제 페이지로 이동
      window.location.href = data.paymentUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : '신청 실패')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* 배경 */}
      <div className="absolute inset-0 bg-center bg-cover bg-no-repeat" style={{ backgroundImage: "url('/login-bg.png')" }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, rgba(0,30,80,0.85) 0%, rgba(0,10,40,0.80) 50%, rgba(30,0,80,0.85) 100%)' }} />

      <div className="w-full max-w-md relative z-10">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <p className="text-sky-300 text-xs font-medium tracking-widest mb-2">BBK 공간케어 · KG이니시스 심사용</p>
          <h1 className="text-white font-black text-2xl leading-tight">서비스 신청 및 결제</h1>
          <p className="text-white/60 text-xs mt-3 leading-relaxed">
            신청서를 작성하시면 결제 페이지로 자동 이동됩니다.<br/>
            심사원 전용 격리 페이지 · 실제 결제 미발생 (KG이니시스 테스트 채널)
          </p>
        </div>

        {/* 폼 */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/15 p-5 space-y-4"
          style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)' }}
        >
          <FormField label="상호명" required>
            <input
              type="text" value={businessName} onChange={e => setBusinessName(e.target.value)}
              required disabled={submitting}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-sky-300"
            />
          </FormField>

          <FormField label="담당자명" required>
            <input
              type="text" value={ownerName} onChange={e => setOwnerName(e.target.value)}
              required disabled={submitting} placeholder="예: 홍길동"
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-sky-300"
            />
          </FormField>

          <FormField label="연락처" required>
            <input
              type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              required disabled={submitting} placeholder="010-0000-0000"
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-sky-300"
            />
          </FormField>

          <FormField label="이메일" required>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required disabled={submitting} placeholder="you@example.com"
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-sky-300"
            />
          </FormField>

          <FormField label="서비스 유형">
            <select
              value={serviceType} onChange={e => setServiceType(e.target.value)}
              disabled={submitting}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-sky-300"
            >
              <option value="1회성케어" className="bg-slate-900">1회성 청소케어</option>
              <option value="정기딥케어" className="bg-slate-900">정기 딥 케어</option>
              <option value="정기엔드케어" className="bg-slate-900">정기 엔드 케어</option>
            </select>
          </FormField>

          <FormField label="결제 금액 (VAT 포함 총액)">
            <div className="relative">
              <input
                type="number" value={amount} onChange={e => setAmount(Number(e.target.value))}
                min={1000} step={1000} disabled={submitting}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 pr-12 text-white text-sm focus:outline-none focus:border-sky-300"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 text-sm">원</span>
            </div>
            <p className="text-white/40 text-[10px] mt-1">기본값 88,000원 (공급가액 80,000 + VAT 8,000)</p>
          </FormField>

          {error && (
            <div className="rounded-lg bg-red-500/20 border border-red-500/40 px-3 py-2 text-red-200 text-xs">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit" disabled={submitting}
            className="w-full bg-sky-500 hover:bg-sky-400 disabled:bg-white/20 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors"
          >
            {submitting ? '결제 페이지로 이동 중...' : `${amount.toLocaleString('ko-KR')}원 결제 진행`}
          </button>
        </form>

        {/* 사업자 정보 */}
        <div className="mt-6 text-center text-white/40 text-[10px] leading-relaxed">
          <p className="text-white/50 font-semibold mb-1">범빌드코리아 주식회사 (BBK 공간케어)</p>
          <p>대표이사: 조동환 · 사업자등록번호: 398-81-04260</p>
          <p>경기도 성남시 중원구 둔촌대로268번길 22, 1동 2층 201호</p>
          <p>통신판매업 신고번호: 제 2025-경기성남중원-XXXX호 (신고 진행 중)</p>
          <p className="mt-2">결제 대행: 포트원(주) · KG이니시스 (테스트 채널)</p>
        </div>
      </div>
    </div>
  )
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-white/70 text-xs font-medium mb-1.5">
        {label} {required && <span className="text-sky-300">*</span>}
      </label>
      {children}
    </div>
  )
}
