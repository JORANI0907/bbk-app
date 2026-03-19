'use client'

import { useState } from 'react'
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
  else if (role === 'worker') window.location.href = '/admin'
  else if (role === 'customer') window.location.href = '/customer'
  else toast.error('접근 권한이 없습니다.')
}

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState<LoginTab>('employee')

  // 직원 로그인 상태
  const [empEmail, setEmpEmail] = useState('')
  const [empPassword, setEmpPassword] = useState('')

  // 고객 로그인 상태
  const [custPhone, setCustPhone] = useState('')
  const [custPassword, setCustPassword] = useState('')

  const [loading, setLoading] = useState(false)

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
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* 로고 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-end gap-1 mb-2">
            <span className="text-4xl font-black text-blue-600 tracking-tight">BBK</span>
            <span className="text-sm text-gray-400 font-medium pb-1">공간케어</span>
          </div>
          <p className="text-gray-500 text-sm">청결한 공간, 신뢰할 수 있는 서비스</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          {/* 탭 */}
          <div className="flex border-b border-gray-100">
            {([
              { key: 'employee', label: '직원 / 관리자' },
              { key: 'customer', label: '고객' },
            ] as { key: LoginTab; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${
                  activeTab === key
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-6">

            {/* 직원/관리자 탭 */}
            {activeTab === 'employee' && (
              <div className="flex flex-col gap-4">
                <div className="text-center mb-2">
                  <p className="text-base font-semibold text-gray-800">직원 / 관리자 로그인</p>
                  <p className="text-xs text-gray-400 mt-1">이메일과 비밀번호로 로그인하세요</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-600">이메일</label>
                  <input
                    type="email"
                    value={empEmail}
                    onChange={(e) => setEmpEmail(e.target.value)}
                    placeholder="example@email.com"
                    autoComplete="email"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleEmployeeLogin()}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-600">비밀번호</label>
                  <input
                    type="password"
                    value={empPassword}
                    onChange={(e) => setEmpPassword(e.target.value)}
                    placeholder="비밀번호 입력"
                    autoComplete="current-password"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleEmployeeLogin()}
                  />
                </div>

                <button
                  onClick={handleEmployeeLogin}
                  disabled={loading}
                  className="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-xl transition-all disabled:opacity-60 hover:bg-blue-700 active:scale-[0.98]"
                >
                  {loading ? '로그인 중...' : '로그인'}
                </button>

                <div className="text-center pt-1 flex flex-col gap-1.5">
                  <div>
                    <span className="text-xs text-gray-400">계정이 없으신가요? </span>
                    <Link href="/signup" className="text-xs text-blue-600 font-medium hover:underline">
                      직원 회원가입
                    </Link>
                  </div>
                  <div>
                    <Link href="/forgot-password" className="text-xs text-gray-400 hover:text-blue-600 hover:underline">
                      비밀번호를 잊으셨나요?
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* 고객 탭 */}
            {activeTab === 'customer' && (
              <div className="flex flex-col gap-4">
                <div className="text-center mb-2">
                  <p className="text-base font-semibold text-gray-800">고객 로그인</p>
                  <p className="text-xs text-gray-400 mt-1">등록된 연락처와 비밀번호로 로그인하세요</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-600">연락처</label>
                  <input
                    type="tel"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    placeholder="01012345678"
                    autoComplete="tel"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleCustomerLogin()}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-600">비밀번호</label>
                  <input
                    type="password"
                    value={custPassword}
                    onChange={(e) => setCustPassword(e.target.value)}
                    placeholder="비밀번호 입력"
                    autoComplete="current-password"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleCustomerLogin()}
                  />
                </div>

                <button
                  onClick={handleCustomerLogin}
                  disabled={loading}
                  className="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-xl transition-all disabled:opacity-60 hover:bg-blue-700 active:scale-[0.98]"
                >
                  {loading ? '로그인 중...' : '로그인'}
                </button>

                <p className="text-center text-xs text-gray-400">
                  로그인 정보는 담당자에게 문의하세요
                </p>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
