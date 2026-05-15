'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'

interface WorkerProfile {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: string
  password_hint: string | null
  employment_type?: string | null
  status?: string | null
}

export default function AccountPage() {
  const [profile, setProfile] = useState<WorkerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [pwForm, setPwForm] = useState({ next: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [showPwForm, setShowPwForm] = useState(false)
  const [showPw, setShowPw] = useState(false)

  const fetchProfile = () => {
    fetch('/api/admin/me')
      .then(r => r.json())
      .then(j => setProfile(j))
      .catch(() => toast.error('프로필 로드 실패'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchProfile() }, [])

  const handlePasswordChange = async () => {
    if (!pwForm.next || pwForm.next.length < 6) {
      toast.error('새 비밀번호는 6자 이상이어야 합니다.')
      return
    }
    if (pwForm.next !== pwForm.confirm) {
      toast.error('새 비밀번호가 일치하지 않습니다.')
      return
    }

    setPwSaving(true)
    try {
      const res = await fetch('/api/admin/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwForm.next }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '변경 실패'); return }
      toast.success('비밀번호가 변경되었습니다.')
      setPwForm({ next: '', confirm: '' })
      setShowPwForm(false)
      setShowPw(false)
      fetchProfile()
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setPwSaving(false)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      window.location.href = '/login'
    } catch {
      toast.error('로그아웃 실패')
    }
  }

  const roleLabel = (role: string) => {
    const map: Record<string, string> = { admin: '관리자', worker: '직원', customer: '고객' }
    return map[role] ?? role
  }

  const normalizedPhone = (profile?.phone ?? '').replace(/-/g, '')
  const pwHint = profile?.password_hint
    ?? (profile?.role === 'customer' ? normalizedPhone : `${normalizedPhone}bbk`)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60 text-text-tertiary text-sm">
        불러오는 중...
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-60 text-text-tertiary text-sm">
        프로필을 불러올 수 없습니다.
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">계정 관리</h1>
        <p className="text-sm text-text-secondary mt-1">내 계정 정보를 확인하고 비밀번호를 변경합니다.</p>
      </div>

      {/* 프로필 카드 */}
      <div className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
        {/* 헤더 */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-600 px-6 py-8 text-white">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-2xl font-bold mb-3">
            {profile.name?.charAt(0) ?? '?'}
          </div>
          <p className="text-xl font-bold">{profile.name}</p>
          <span className="inline-block mt-1.5 text-xs bg-white/20 px-2.5 py-0.5 rounded-full font-medium">
            {roleLabel(profile.role)}
          </span>
        </div>

        {/* 정보 */}
        <div className="divide-y divide-border-subtle">
          <InfoRow label="이름" value={profile.name} />
          <InfoRow label="회원유형" value={roleLabel(profile.role)} />
          <InfoRow label="ID" value={normalizedPhone || '-'} mono />
          {/* PW 행: 눈 아이콘 토글 */}
          <div className="flex items-center justify-between px-5 py-3.5">
            <span className="text-xs font-medium text-text-tertiary">PW</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-primary font-medium font-mono">
                {showPw ? pwHint : '••••••••'}
              </span>
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="text-text-tertiary hover:text-text-secondary"
              >
                {showPw ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 비밀번호 변경 */}
      <div className="bg-surface rounded-2xl border border-border-subtle shadow-soft p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-text-primary">비밀번호 변경</p>
            <p className="text-xs text-text-tertiary mt-0.5">보안을 위해 주기적으로 변경하세요.</p>
          </div>
          <button
            onClick={() => setShowPwForm(v => !v)}
            className="text-sm text-brand-600 font-medium hover:text-brand-700"
          >
            {showPwForm ? '취소' : '변경'}
          </button>
        </div>

        {showPwForm && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">새 비밀번호</label>
              <input
                type="password"
                value={pwForm.next}
                onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                placeholder="6자 이상"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">새 비밀번호 확인</label>
              <input
                type="password"
                value={pwForm.confirm}
                onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                placeholder="동일하게 입력"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {pwForm.next && pwForm.confirm && pwForm.next !== pwForm.confirm && (
              <p className="text-xs text-state-danger">비밀번호가 일치하지 않습니다.</p>
            )}
            <button
              onClick={handlePasswordChange}
              disabled={pwSaving}
              className="w-full py-2.5 text-sm font-semibold text-white bg-brand-600 rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {pwSaving ? '변경 중...' : '비밀번호 변경'}
            </button>
          </div>
        )}
      </div>

      {/* 로그아웃 */}
      <button
        onClick={handleLogout}
        className="w-full py-3 text-sm font-medium text-state-danger bg-surface border border-red-100 rounded-2xl hover:bg-state-danger-bg transition-colors shadow-soft"
      >
        로그아웃
      </button>
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <span className="text-xs font-medium text-text-tertiary">{label}</span>
      <span className={`text-sm text-text-primary font-medium ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}
