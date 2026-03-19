'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    // Supabase가 URL의 토큰(해시 또는 ?code=)을 자동 감지해 PASSWORD_RECOVERY 이벤트를 발생시킴
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async () => {
    if (!password.trim()) {
      toast.error('새 비밀번호를 입력해주세요.')
      return
    }
    if (password.length < 8) {
      toast.error('비밀번호는 8자 이상이어야 합니다.')
      return
    }
    if (password !== confirmPassword) {
      toast.error('비밀번호가 일치하지 않습니다.')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw new Error(error.message)
      setDone(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '비밀번호 변경에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <div className="text-center">
          <p className="text-gray-400 text-sm mb-2">링크 확인 중...</p>
          <p className="text-gray-300 text-xs">잠시만 기다려주세요</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-end gap-1 mb-2">
            <span className="text-4xl font-black text-blue-600 tracking-tight">BBK</span>
            <span className="text-sm text-gray-400 font-medium pb-1">공간케어</span>
          </div>
          <p className="text-gray-500 text-sm">비밀번호 재설정</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {done ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">✅</span>
              </div>
              <h2 className="text-base font-bold text-gray-900 mb-2">비밀번호가 변경되었습니다</h2>
              <p className="text-sm text-gray-500 mb-6">새 비밀번호로 로그인해주세요.</p>
              <button
                onClick={() => router.push('/login')}
                className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl text-sm hover:bg-blue-700 transition-colors"
              >
                로그인하기
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="text-center mb-1">
                <p className="text-base font-semibold text-gray-800">새 비밀번호 설정</p>
                <p className="text-xs text-gray-400 mt-1">8자 이상의 새 비밀번호를 입력해주세요</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-600">새 비밀번호</label>
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
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-red-500">비밀번호가 일치하지 않습니다.</p>
                )}
              </div>

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-xl transition-all disabled:opacity-60 hover:bg-blue-700 active:scale-[0.98]"
              >
                {loading ? '변경 중...' : '비밀번호 변경'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
