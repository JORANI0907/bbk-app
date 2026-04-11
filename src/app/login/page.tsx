'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'

type LoginTab = 'employee' | 'customer'

async function setSession(user: { id: string; role: string; name: string }, session: { access_token: string; refresh_token: string }) {
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: user.id,
      role: user.role,
      name: user.name,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    }),
  })
  if (!res.ok) throw new Error('세션 설정 실패')
}

function redirectByRole(role: string) {
  if (role === 'admin') window.location.href = '/admin'
  else if (role === 'worker') window.location.href = '/worker'
  else if (role === 'customer') window.location.href = '/customer'
  else toast.error('접근 권한이 없습니다.')
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<LoginTab>('employee')
  const [empEmail, setEmpEmail] = useState('')
  const [empPassword, setEmpPassword] = useState('')
  const [custPhone, setCustPhone] = useState('')
  const [custPassword, setCustPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showEmpPw, setShowEmpPw] = useState(false)
  const [showCustPw, setShowCustPw] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('type=recovery')) {
      router.replace('/reset-password' + hash)
    }
  }, [router])

  const handleEmployeeLogin = async () => {
    if (!empEmail.trim() || !empPassword.trim()) {
      toast.error('이메일과 비밀번호를 입력해주세요.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/employee/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: empEmail.trim(), password: empPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '로그인 실패')
      await setSession(data.user, data.session)
      redirectByRole(data.user.role)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '로그인에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleCustomerLogin = async () => {
    if (!custPhone.trim() || !custPassword.trim()) {
      toast.error('연락처와 비밀번호를 입력해주세요.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/customer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: custPhone.trim(), password: custPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '로그인 실패')
      await setSession(data.user, data.session)
      redirectByRole(data.user.role)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '로그인에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">

      {/* 배경 이미지 */}
      <div
        className="absolute inset-0 bg-center bg-cover bg-no-repeat"
        style={{ backgroundImage: "url('/login-bg.png')" }}
      />
      {/* 고급스러운 다크 그라데이션 오버레이 */}
      <div className="absolute inset-0"
        style={{ background: 'linear-gradient(160deg, rgba(0,30,80,0.72) 0%, rgba(0,10,40,0.60) 50%, rgba(30,0,80,0.72) 100%)' }} />
      {/* 하단 블러 비네트 */}
      <div className="absolute bottom-0 left-0 right-0 h-48"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)' }} />

      <div className={`w-full max-w-sm relative z-10 transition-all duration-700 ease-out ${mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>

        {/* 로고 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 shadow-2xl overflow-hidden border-2 border-white/20"
            style={{ background: 'rgba(255,255,255,0.10)', backdropFilter: 'blur(12px)' }}>
            <img src="/login-bg.png" alt="BBK" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-lg">
            BBK <span className="text-sky-300">공간케어</span>
          </h1>
          <p className="text-white/70 text-sm mt-1.5 drop-shadow">청결한 공간, 신뢰할 수 있는 서비스</p>
        </div>

        {/* 카드 */}
        <div className="rounded-3xl overflow-hidden border border-white/20"
          style={{
            background: 'rgba(255,255,255,0.10)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
          }}>

          {/* 탭 */}
          <div className="flex p-1.5 m-4 rounded-2xl gap-1" style={{ background: 'rgba(0,0,0,0.25)' }}>
            {([
              { key: 'employee', label: '직원 · 관리자' },
              { key: 'customer', label: '고객' },
            ] as { key: LoginTab; label: string }[]).map(({ key, label }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 ${
                  activeTab === key
                    ? 'bg-white text-blue-700 shadow-md'
                    : 'text-white/70 hover:text-white'
                }`}>
                {label}
              </button>
            ))}
          </div>

          <div className="px-6 pb-6 pt-2">

            {/* 직원/관리자 탭 */}
            {activeTab === 'employee' && (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-semibold text-white/80 mb-1.5 block">이메일</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/50">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </span>
                    <input type="email" value={empEmail} onChange={e => setEmpEmail(e.target.value)}
                      placeholder="example@email.com" autoComplete="email"
                      onKeyDown={e => e.key === 'Enter' && handleEmployeeLogin()}
                      className="w-full pl-10 pr-4 py-3 border border-white/20 rounded-xl text-sm bg-white/15 text-white placeholder-white/40 focus:bg-white/25 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition-all" />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-white/80 mb-1.5 block">비밀번호</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/50">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </span>
                    <input type={showEmpPw ? 'text' : 'password'} value={empPassword}
                      onChange={e => setEmpPassword(e.target.value)} placeholder="비밀번호 입력"
                      autoComplete="current-password"
                      onKeyDown={e => e.key === 'Enter' && handleEmployeeLogin()}
                      className="w-full pl-10 pr-10 py-3 border border-white/20 rounded-xl text-sm bg-white/15 text-white placeholder-white/40 focus:bg-white/25 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition-all" />
                    <button type="button" onClick={() => setShowEmpPw(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80">
                      <EyeIcon open={showEmpPw} />
                    </button>
                  </div>
                </div>

                <button onClick={handleEmployeeLogin} disabled={loading}
                  className="w-full py-3.5 text-white font-bold rounded-xl transition-all disabled:opacity-60 active:scale-[0.98] mt-1"
                  style={{ background: loading ? '#93c5fd' : 'linear-gradient(135deg, #2563eb, #4f46e5)' }}>
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      로그인 중...
                    </span>
                  ) : '로그인'}
                </button>

                <div className="flex items-center justify-between text-xs pt-1">
                  <Link href="/forgot-password" className="text-white/50 hover:text-white transition-colors">
                    비밀번호 찾기
                  </Link>
                  <Link href="/signup" className="text-sky-300 font-semibold hover:text-sky-200 transition-colors">
                    직원 회원가입 →
                  </Link>
                </div>
              </div>
            )}

            {/* 고객 탭 */}
            {activeTab === 'customer' && (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-semibold text-white/80 mb-1.5 block">연락처</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/50">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </span>
                    <input type="tel" value={custPhone} onChange={e => setCustPhone(e.target.value)}
                      placeholder="01012345678" autoComplete="tel"
                      onKeyDown={e => e.key === 'Enter' && handleCustomerLogin()}
                      className="w-full pl-10 pr-4 py-3 border border-white/20 rounded-xl text-sm bg-white/15 text-white placeholder-white/40 focus:bg-white/25 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition-all" />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-white/80 mb-1.5 block">비밀번호</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/50">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </span>
                    <input type={showCustPw ? 'text' : 'password'} value={custPassword}
                      onChange={e => setCustPassword(e.target.value)} placeholder="비밀번호 입력"
                      autoComplete="current-password"
                      onKeyDown={e => e.key === 'Enter' && handleCustomerLogin()}
                      className="w-full pl-10 pr-10 py-3 border border-white/20 rounded-xl text-sm bg-white/15 text-white placeholder-white/40 focus:bg-white/25 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition-all" />
                    <button type="button" onClick={() => setShowCustPw(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80">
                      <EyeIcon open={showCustPw} />
                    </button>
                  </div>
                </div>

                <button onClick={handleCustomerLogin} disabled={loading}
                  className="w-full py-3.5 text-white font-bold rounded-xl transition-all disabled:opacity-60 active:scale-[0.98] mt-1"
                  style={{ background: loading ? '#93c5fd' : 'linear-gradient(135deg, #2563eb, #4f46e5)' }}>
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      로그인 중...
                    </span>
                  ) : '로그인'}
                </button>

                <p className="text-center text-xs text-white/50 pt-1">
                  로그인 정보는{' '}
                  <span className="text-sky-300 font-medium">031-759-4877</span>로 문의하세요
                </p>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-white/40 mt-6">© 2025 BBK Korea. All rights reserved.</p>
      </div>
    </div>
  )
}
