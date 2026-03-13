'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

type LoginTab = 'worker' | 'customer'
type OtpStep = 'phone' | 'otp'

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState<LoginTab>('worker')

  const [step, setStep] = useState<OtpStep>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)

  // 전화번호 정규화 (하이픈 제거)
  const normalizePhone = (raw: string) => raw.replace(/-/g, '').trim()

  // ① 인증번호 발송 (커스텀 Solapi API 호출)
  const handleSendOtp = async () => {
    if (!phone.trim()) {
      toast.error('전화번호를 입력해주세요.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalizePhone(phone) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '발송 실패')
      setStep('otp')
      toast.success('인증번호가 발송되었습니다.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '인증번호 발송에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // ② 인증번호 검증 + 로그인
  const handleVerifyOtp = async () => {
    if (!otp.trim() || otp.length < 6) {
      toast.error('6자리 인증번호를 입력해주세요.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalizePhone(phone), otp }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '인증 실패')

      // 서버에서 세션 쿠키 설정
      if (data.session) {
        const sessionRes = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: data.user.id,
            role: data.user.role,
            name: data.user.name,
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
          }),
        })
        if (!sessionRes.ok) throw new Error('세션 설정 실패')
      }

      const role = data.user?.role
      if (role === 'admin') {
        window.location.href = '/admin'
      } else if (role === 'worker') {
        window.location.href = '/worker'
      } else if (role === 'customer') {
        window.location.href = '/customer'
      } else {
        toast.error('접근 권한이 없습니다.')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '인증에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleKakaoLogin = async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'kakao',
        options: { redirectTo: `${window.location.origin}/` },
      })
      if (error) throw error
    } catch {
      toast.error('카카오 로그인에 실패했습니다.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* 로고 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-end gap-1 mb-2">
            <span className="text-4xl font-black text-blue-600 tracking-tight">BBK</span>
            <span className="text-sm text-gray-400 font-medium pb-1">Korea</span>
          </div>
          <p className="text-gray-500 text-sm">청결한 공간, 신뢰할 수 있는 서비스</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          {/* 탭 */}
          <div className="flex border-b border-gray-100">
            {(['worker', 'customer'] as LoginTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setStep('phone'); setOtp('') }}
                className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${
                  activeTab === tab
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-400'
                }`}
              >
                {tab === 'worker' ? '직원 / 관리자' : '고객'}
              </button>
            ))}
          </div>

          <div className="p-6">

            {/* 직원/관리자 탭 */}
            {activeTab === 'worker' && (
              <div className="flex flex-col gap-4">
                <div className="text-center mb-2">
                  <p className="text-base font-semibold text-gray-800">직원 / 관리자 로그인</p>
                  <p className="text-xs text-gray-400 mt-1">등록된 전화번호로 OTP 인증</p>
                </div>

                {step === 'phone' ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-gray-600">전화번호</label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="01012345678"
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
                      />
                    </div>
                    <button
                      onClick={handleSendOtp}
                      disabled={loading}
                      className="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-xl transition-all disabled:opacity-60"
                    >
                      {loading ? '발송 중...' : '인증번호 받기'}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-gray-600">인증번호</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="6자리 입력"
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-xl tracking-widest font-mono"
                        onKeyDown={(e) => e.key === 'Enter' && handleVerifyOtp()}
                      />
                      <p className="text-xs text-gray-400 text-center">
                        {phone}으로 발송된 6자리 번호를 입력해주세요 (5분 유효)
                      </p>
                    </div>
                    <button
                      onClick={handleVerifyOtp}
                      disabled={loading}
                      className="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-xl transition-all disabled:opacity-60"
                    >
                      {loading ? '확인 중...' : '로그인'}
                    </button>
                    <button
                      onClick={() => { setStep('phone'); setOtp('') }}
                      className="text-sm text-gray-400 text-center w-full"
                    >
                      ← 전화번호 다시 입력
                    </button>
                  </>
                )}
              </div>
            )}

            {/* 고객 탭 */}
            {activeTab === 'customer' && (
              <div className="flex flex-col gap-4">
                <div className="text-center mb-2">
                  <p className="text-base font-semibold text-gray-800">고객 로그인</p>
                </div>

                <button
                  onClick={handleKakaoLogin}
                  disabled={loading}
                  className="w-full py-3.5 bg-yellow-400 text-yellow-900 font-semibold rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                >
                  <span className="text-lg">💬</span>
                  카카오로 로그인
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400">또는 전화번호</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                {step === 'phone' ? (
                  <>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="01012345678"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
                    />
                    <button
                      onClick={handleSendOtp}
                      disabled={loading}
                      className="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-xl transition-all disabled:opacity-60"
                    >
                      {loading ? '발송 중...' : '인증번호 받기'}
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="6자리 인증번호"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-xl tracking-widest font-mono"
                      onKeyDown={(e) => e.key === 'Enter' && handleVerifyOtp()}
                    />
                    <button
                      onClick={handleVerifyOtp}
                      disabled={loading}
                      className="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-xl transition-all disabled:opacity-60"
                    >
                      {loading ? '확인 중...' : '로그인'}
                    </button>
                    <button
                      onClick={() => { setStep('phone'); setOtp('') }}
                      className="text-sm text-gray-400 text-center w-full"
                    >
                      ← 전화번호 다시 입력
                    </button>
                  </>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
