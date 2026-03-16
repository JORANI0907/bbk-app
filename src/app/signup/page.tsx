'use client'

import { useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'

export default function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignup = async () => {
    if (!name.trim() || !email.trim() || !phone.trim() || !password.trim()) {
      toast.error('모든 항목을 입력해주세요.')
      return
    }
    if (password !== confirmPassword) {
      toast.error('비밀번호가 일치하지 않습니다.')
      return
    }
    if (password.length < 8) {
      toast.error('비밀번호는 8자 이상이어야 합니다.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/employee/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '회원가입 실패')

      // 세션 설정
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

      toast.success('회원가입이 완료되었습니다!')
      window.location.href = '/worker'
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '회원가입에 실패했습니다.')
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
            <span className="text-sm text-gray-400 font-medium pb-1">Korea</span>
          </div>
          <p className="text-gray-500 text-sm">직원 회원가입</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-4">

          <div className="text-center mb-1">
            <p className="text-base font-semibold text-gray-800">직원 계정 만들기</p>
            <p className="text-xs text-gray-400 mt-1">가입 후 관리자가 역할을 지정합니다</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              autoComplete="name"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              autoComplete="email"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">전화번호</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01012345678"
              autoComplete="tel"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8자 이상 입력"
              autoComplete="new-password"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">비밀번호 확인</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="비밀번호 재입력"
              autoComplete="new-password"
              className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                confirmPassword && password !== confirmPassword
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-200'
              }`}
              onKeyDown={(e) => e.key === 'Enter' && handleSignup()}
            />
            {confirmPassword && password !== confirmPassword && (
              <p className="text-xs text-red-500">비밀번호가 일치하지 않습니다.</p>
            )}
          </div>

          <button
            onClick={handleSignup}
            disabled={loading}
            className="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-xl transition-all disabled:opacity-60 hover:bg-blue-700 active:scale-[0.98] mt-1"
          >
            {loading ? '가입 중...' : '회원가입'}
          </button>

          <div className="text-center">
            <span className="text-xs text-gray-400">이미 계정이 있으신가요? </span>
            <Link href="/login" className="text-xs text-blue-600 font-medium hover:underline">
              로그인
            </Link>
          </div>

        </div>
      </div>
    </div>
  )
}
