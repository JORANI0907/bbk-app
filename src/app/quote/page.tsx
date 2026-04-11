'use client'

import { useState, useEffect, useRef } from 'react'

const CARE_OPTIONS = [
  { id: 'toilet',  emoji: '🚿', label: '화장실' },
  { id: 'kitchen', emoji: '🍳', label: '주방' },
  { id: 'office',  emoji: '🪑', label: '객실/사무실' },
  { id: 'glass',   emoji: '🪟', label: '유리/창문' },
  { id: 'ac',      emoji: '❄️', label: '에어컨' },
  { id: 'other',   emoji: '✨', label: '기타' },
]

export default function QuotePage() {
  const [splash, setSplash]           = useState(true)
  const [splashHide, setSplashHide]   = useState(false)
  const [appVisible, setAppVisible]   = useState(false)
  const [submitted, setSubmitted]     = useState(false)
  const [submitting, setSubmitting]   = useState(false)

  const [ownerName, setOwnerName]             = useState('')
  const [businessName, setBusinessName]       = useState('')
  const [address, setAddress]                 = useState('')
  const [email, setEmail]                     = useState('')
  const [phone, setPhone]                     = useState('')
  const [constructionDate, setConstructionDate] = useState('')
  const [careScope, setCareScope]             = useState<string[]>([])
  const [requestNotes, setRequestNotes]       = useState('')
  const [errors, setErrors]                   = useState<Record<string, string>>({})

  const todayRef = useRef('')

  useEffect(() => {
    const d = new Date()
    todayRef.current = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    // 스플래시 → 앱 전환
    const t1 = setTimeout(() => setSplashHide(true), 1400)
    const t2 = setTimeout(() => { setSplash(false); setAppVisible(true) }, 2050)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  function toggleCare(label: string) {
    setCareScope(prev =>
      prev.includes(label) ? prev.filter(x => x !== label) : [...prev, label]
    )
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!ownerName.trim())    e.ownerName    = '고객명을 입력해주세요'
    if (!businessName.trim()) e.businessName = '회사명을 입력해주세요'
    if (!phone.trim())        e.phone        = '연락처를 입력해주세요'
    if (!address.trim())      e.address      = '주소를 입력해주세요'
    if (careScope.length === 0) e.careScope  = '케어 범위를 하나 이상 선택해주세요'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSubmitting(true)

    const now = new Date()
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    const timestamp =
      `${kst.getFullYear()}-${String(kst.getMonth()+1).padStart(2,'0')}-${String(kst.getDate()).padStart(2,'0')} ` +
      `${String(kst.getHours()).padStart(2,'0')}:${String(kst.getMinutes()).padStart(2,'0')}:${String(kst.getSeconds()).padStart(2,'0')}`

    try {
      const res = await fetch('/api/webhooks/application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp,
          ownerName,
          businessName,
          phone,
          email,
          address,
          constructionDate: constructionDate || null,
          careScope: careScope.join(', '),
          requestNotes,
        }),
      })
      if (res.ok) {
        setSubmitted(true)
      } else {
        alert('전송 중 오류가 발생했습니다. 다시 시도해주세요.')
      }
    } catch {
      alert('네트워크 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  function Field({ label, required, error, children }: {
    label: string; required?: boolean; error?: string; children: React.ReactNode
  }) {
    return (
      <div className="mb-5">
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {children}
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    )
  }

  const inputCls = (err?: string) =>
    `w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-all
     ${err
       ? 'border-red-400 ring-2 ring-red-100 bg-white'
       : 'border-slate-200 bg-slate-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:bg-white'
     }`

  return (
    <>
      {/* ── 스플래시 ── */}
      {splash && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5"
          style={{
            background: '#0f172a',
            opacity: splashHide ? 0 : 1,
            transform: splashHide ? 'scale(1.03)' : 'scale(1)',
            transition: 'opacity 0.55s ease, transform 0.55s ease',
          }}
        >
          {/* 로고 팝인 */}
          <img
            src="/bbk-logo.png"
            alt="BBK"
            className="rounded-2xl shadow-2xl"
            style={{
              width: 96, height: 96, objectFit: 'cover',
              boxShadow: '0 0 48px rgba(37,99,235,0.5)',
              animation: 'bbkPop 0.7s cubic-bezier(0.34,1.56,0.64,1) both',
            }}
          />
          <div style={{ animation: 'bbkFade 0.5s ease 0.35s both' }}>
            <p className="text-2xl font-black text-white text-center tracking-tight">BBK 공간케어</p>
            <p className="text-xs font-medium text-center mt-1" style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '3px' }}>
              PROFESSIONAL CARE SERVICE
            </p>
          </div>
          {/* 하단 바 */}
          <div
            className="absolute bottom-0 left-0 right-0 h-[3px]"
            style={{
              background: 'linear-gradient(90deg, transparent, #2563eb, #818cf8, transparent)',
              animation: 'bbkBar 1.2s ease 0.1s both',
            }}
          />
          <style>{`
            @keyframes bbkPop {
              0%   { transform:scale(0.3); opacity:0 }
              60%  { transform:scale(1.08) }
              100% { transform:scale(1); opacity:1 }
            }
            @keyframes bbkFade {
              from { opacity:0; transform:translateY(8px) }
              to   { opacity:1; transform:translateY(0) }
            }
            @keyframes bbkBar {
              from { transform:scaleX(0) }
              to   { transform:scaleX(1) }
            }
          `}</style>
        </div>
      )}

      {/* ── 앱 본문 ── */}
      <div
        style={{
          opacity: appVisible ? 1 : 0,
          transform: appVisible ? 'translateY(0)' : 'translateY(14px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
          minHeight: '100vh',
          background: '#f1f5f9',
          fontFamily: "'Noto Sans KR', sans-serif",
        }}
      >
        {/* Hero */}
        <div style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #1e293b 100%)',
          padding: '48px 20px 56px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse 60% 80% at 50% 0%, rgba(37,99,235,0.12) 0%, transparent 70%)',
          }} />
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
            background: 'linear-gradient(90deg, transparent, #2563eb, #818cf8, transparent)',
          }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <img
              src="/bbk-logo.png" alt="BBK"
              style={{
                width: 72, height: 72, borderRadius: 18, objectFit: 'cover',
                boxShadow: '0 0 32px rgba(37,99,235,0.4)',
                marginBottom: 18,
                animation: 'heroFloat 5s ease-in-out infinite',
              }}
            />
            <div style={{
              display: 'inline-block',
              background: 'rgba(37,99,235,0.2)', border: '1px solid rgba(37,99,235,0.4)',
              color: '#93c5fd', fontSize: 11, fontWeight: 600,
              padding: '4px 14px', borderRadius: 999, letterSpacing: 1, marginBottom: 14,
            }}>
              SERVICE INQUIRY
            </div>
            <p style={{ fontSize: 24, fontWeight: 900, color: '#fff', marginBottom: 10, letterSpacing: '-0.5px' }}>
              공간케어 견적 신청
            </p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
              아래 정보를 입력하시면<br />담당자가 빠르게 연락드리겠습니다.
            </p>
          </div>
          <style>{`@keyframes heroFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }`}</style>
        </div>

        {submitted ? (
          /* 제출 완료 화면 */
          <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl mb-6"
              style={{ background: 'linear-gradient(135deg,#dcfce7,#bbf7d0)' }}>
              ✅
            </div>
            <h2 className="text-xl font-black text-slate-800 mb-3">신청 완료!</h2>
            <p className="text-sm text-slate-500 leading-relaxed mb-8">
              견적 신청이 접수되었습니다.<br />
              담당자가 <strong>1~2 영업일 내</strong>에 연락드리겠습니다.
            </p>
            <button
              onClick={() => {
                setSubmitted(false)
                setOwnerName(''); setBusinessName(''); setAddress('')
                setEmail(''); setPhone(''); setConstructionDate('')
                setCareScope([]); setRequestNotes(''); setErrors({})
              }}
              className="px-8 py-3 rounded-xl text-white text-sm font-bold"
              style={{ background: 'linear-gradient(135deg,#2563eb,#4f46e5)' }}
            >
              다시 신청하기
            </button>
          </div>
        ) : (
          /* 폼 */
          <div className="max-w-xl mx-auto px-4 py-7 pb-16">

            {/* 기본 정보 */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-4">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-blue-50">👤</div>
                <div>
                  <p className="text-sm font-bold text-slate-800">기본 정보</p>
                  <p className="text-xs text-slate-400">담당자 및 회사 정보를 입력해주세요</p>
                </div>
              </div>

              <Field label="고객명" required error={errors.ownerName}>
                <input
                  className={inputCls(errors.ownerName)}
                  placeholder="예) 홍길동"
                  value={ownerName}
                  onChange={e => setOwnerName(e.target.value)}
                  autoComplete="name"
                />
              </Field>
              <Field label="회사명" required error={errors.businessName}>
                <input
                  className={inputCls(errors.businessName)}
                  placeholder="예) BBK 코리아"
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  autoComplete="organization"
                />
              </Field>
              <Field label="연락처" required error={errors.phone}>
                <input
                  type="tel"
                  className={inputCls(errors.phone)}
                  placeholder="예) 010-1234-5678"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  autoComplete="tel"
                />
              </Field>
              <Field label="이메일" error={errors.email}>
                <input
                  type="email"
                  className={inputCls(errors.email)}
                  placeholder="예) hello@company.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </Field>
            </div>

            {/* 서비스 정보 */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-4">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-green-50">🏢</div>
                <div>
                  <p className="text-sm font-bold text-slate-800">서비스 정보</p>
                  <p className="text-xs text-slate-400">케어 관련 정보를 입력해주세요</p>
                </div>
              </div>

              <Field label="주소" required error={errors.address}>
                <input
                  className={inputCls(errors.address)}
                  placeholder="케어 장소 주소를 입력해주세요"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  autoComplete="street-address"
                />
              </Field>

              <Field label="희망 방문일" error={errors.constructionDate}>
                <input
                  type="date"
                  className={inputCls()}
                  min={todayRef.current}
                  value={constructionDate}
                  onChange={e => setConstructionDate(e.target.value)}
                />
              </Field>

              <Field label="케어 범위" required error={errors.careScope}>
                <p className="text-xs text-slate-400 mb-2">해당하는 항목을 모두 선택해주세요</p>
                <div className="grid grid-cols-3 gap-2">
                  {CARE_OPTIONS.map(opt => {
                    const active = careScope.includes(opt.label)
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleCare(opt.label)}
                        className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl border text-xs font-medium transition-all"
                        style={{
                          borderColor: active ? '#2563eb' : '#e2e8f0',
                          background: active ? '#eff6ff' : '#fafafa',
                          color: active ? '#1d4ed8' : '#64748b',
                          boxShadow: active ? '0 0 0 2px rgba(37,99,235,0.15)' : 'none',
                        }}
                      >
                        <span className="text-xl leading-none">{opt.emoji}</span>
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
                {errors.careScope && (
                  <p className="text-xs text-red-500 mt-1.5">{errors.careScope}</p>
                )}
              </Field>
            </div>

            {/* 요청사항 */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-4">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-purple-50">📝</div>
                <div>
                  <p className="text-sm font-bold text-slate-800">요청사항</p>
                  <p className="text-xs text-slate-400">추가로 전달하고 싶은 내용을 자유롭게 작성해주세요</p>
                </div>
              </div>
              <textarea
                className={`${inputCls()} resize-y`}
                style={{ minHeight: 100 }}
                placeholder="특이사항, 희망 시간대, 공간 크기 등 자유롭게 입력해주세요"
                value={requestNotes}
                onChange={e => setRequestNotes(e.target.value)}
              />
            </div>

            {/* 제출 */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-4 rounded-xl text-white text-base font-black flex items-center justify-center gap-2 transition-all"
                style={{
                  background: submitting ? '#94a3b8' : 'linear-gradient(135deg,#2563eb,#4f46e5)',
                  boxShadow: submitting ? 'none' : '0 4px 20px rgba(37,99,235,0.35)',
                }}
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    전송 중...
                  </>
                ) : '견적 신청하기'}
              </button>
              <p className="text-xs text-slate-400 text-center mt-3 leading-relaxed">
                제출하신 정보는 견적 상담 목적으로만 사용되며,<br />담당자 확인 후 연락드리겠습니다.
              </p>
            </div>

          </div>
        )}

        <div className="text-center py-5 text-xs text-slate-400">© 2025 BBK Korea. All rights reserved.</div>
      </div>
    </>
  )
}
