'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useInstallPWA } from '@/hooks/useInstallPWA'

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
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [showIOSGuide, setShowIOSGuide] = useState(false)
  const { install, installPrompt, isInstalled, isIOS } = useInstallPWA()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('type=recovery')) {
      router.replace('/reset-password' + hash)
    }
  }, [router])

  const handleLogin = async () => {
    if (!phone.trim() || !password.trim()) {
      toast.error('아이디와 비밀번호를 입력해주세요.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), password }),
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

          <div className="px-6 py-6">
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-white/80 mb-1.5 block">아이디</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/50">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </span>
                  <input type="text" value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="아이디 입력" autoComplete="username"
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
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
                  <input type={showPw ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)} placeholder="비밀번호 입력"
                    autoComplete="current-password"
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    className="w-full pl-10 pr-10 py-3 border border-white/20 rounded-xl text-sm bg-white/15 text-white placeholder-white/40 focus:bg-white/25 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition-all" />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80">
                    <EyeIcon open={showPw} />
                  </button>
                </div>
              </div>

              <button onClick={handleLogin} disabled={loading}
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
          </div>
        </div>

        {/* 앱 설치 버튼 */}
        {!isInstalled && (isIOS || installPrompt) && (
          <button
            onClick={isIOS ? () => setShowIOSGuide(true) : install}
            className="w-full mt-4 py-3 text-white/60 text-sm font-medium border border-white/20 rounded-xl hover:bg-white/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            style={{ backdropFilter: 'blur(8px)' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            앱으로 설치하기
          </button>
        )}

        {/* 공개 페이지 링크 */}
        <div className="flex justify-center gap-3 mt-5 flex-wrap">
          {[
            { href: '/services', label: '서비스 안내' },
            { href: '/terms', label: '이용약관' },
            { href: '/privacy', label: '개인정보처리방침' },
            { href: '/refund', label: '환불규정' },
            { href: '/company', label: '회사정보' },
          ].map(({ href, label }, i, arr) => (
            <span key={href} className="flex items-center gap-3">
              <Link href={href} className="text-xs text-white/45 hover:text-white/75 transition-colors underline underline-offset-2">
                {label}
              </Link>
              {i < arr.length - 1 && <span className="text-white/20 text-xs">·</span>}
            </span>
          ))}
        </div>

        <div className="mt-5 text-center space-y-1">
          <p className="text-white/25 text-[10px]">범빌드코리아 주식회사 · 대표자: 조동환 · 사업자등록번호: 398-81-04260</p>
          <p className="text-white/25 text-[10px]">주소: 경기도 성남시 중원구 둔촌대로268번길 22 201호</p>
          <p className="text-white/25 text-[10px]">서비스 요금: 1회성케어 120,000원~ · 정기딥케어 150,000원~/회 · 정기엔드케어 100,000원~/회</p>
        </div>
        <p className="text-center text-xs text-white/40 mt-3">© 2025 BBK Korea. All rights reserved.</p>
      </div>

      {/* iOS 설치 안내 모달 */}
      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4"
          onClick={e => e.target === e.currentTarget && setShowIOSGuide(false)}
        >
          <div className="w-full max-w-sm bg-[#0d1117] border border-white/15 rounded-2xl overflow-hidden text-white mb-4">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <p className="font-semibold text-sm">iPhone / iPad 앱 설치 방법</p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="text-white/50 hover:text-white p-1 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              {[
                'Safari 브라우저로 app.bbkorea.co.kr 접속',
                '화면 하단 공유 버튼 (□↑) 탭',
                '"홈 화면에 추가" 선택',
                '"추가" 버튼 탭 → 설치 완료',
              ].map((step, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 text-xs flex items-center justify-center font-bold">
                    {i + 1}
                  </span>
                  <p className="text-white/75 text-sm leading-relaxed">{step}</p>
                </div>
              ))}
              <p className="text-white/30 text-xs pt-3 border-t border-white/10">
                * Safari 브라우저에서만 설치 가능합니다.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
