'use client'

import { useState } from 'react'

export default function KgAuditLoginPage() {
  const [email,      setEmail]      = useState('')
  const [password,   setPassword]   = useState('')
  const [error,      setError]      = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError('')
    setSubmitting(true)
    try {
      const res  = await fetch('/api/kg-audit/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '로그인에 실패했습니다.')
      window.location.href = '/kg-audit'
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-sunken px-4">
      <div className="w-full max-w-sm">
        {/* 브랜드 헤더 */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-brand-600 flex items-center justify-center text-white font-black text-xl mx-auto mb-4 shadow-card">
            BBK
          </div>
          <h1 className="text-2xl font-bold text-text-primary">BBK 공간케어</h1>
          <p className="text-sm text-text-secondary mt-1">상업 시설 전문 청소 서비스</p>
        </div>

        {/* 로그인 폼 */}
        <form onSubmit={handleSubmit} className="bg-surface rounded-2xl border border-border-subtle shadow-soft p-6 space-y-4">
          <h2 className="text-base font-bold text-text-primary">로그인</h2>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">이메일</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              required disabled={submitting} autoFocus placeholder="이메일 주소"
              className="w-full bg-surface border border-border rounded-md px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-brand-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">비밀번호</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              required disabled={submitting} placeholder="비밀번호"
              className="w-full bg-surface border border-border rounded-md px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-brand-600"
            />
          </div>

          {error && (
            <div className="rounded-md bg-state-danger-bg border border-state-danger/30 px-3 py-2 text-xs text-state-danger">
              {error}
            </div>
          )}

          <button
            type="submit" disabled={submitting}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {submitting ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <p className="text-center text-[11px] text-text-tertiary mt-6 leading-relaxed">
          © 2026 범빌드코리아 주식회사 · BBK 공간케어<br />
          고객센터 1522-9597 · sunrise@bbkorea.co.kr
        </p>
      </div>
    </div>
  )
}
