'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'

interface WorkerProfile {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: string
  employment_type?: string | null
  status?: string | null
}

export default function AccountPage() {
  const [profile, setProfile] = useState<WorkerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [showPwForm, setShowPwForm] = useState(false)

  useEffect(() => {
    fetch('/api/admin/me')
      .then(r => r.json())
      .then(j => setProfile(j))
      .catch(() => toast.error('프로필 로드 실패'))
      .finally(() => setLoading(false))
  }, [])

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
      setPwForm({ current: '', next: '', confirm: '' })
      setShowPwForm(false)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60 text-gray-400 text-sm">
        불러오는 중...
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-60 text-gray-400 text-sm">
        프로필을 불러올 수 없습니다.
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">계정 관리</h1>
        <p className="text-sm text-gray-500 mt-1">내 계정 정보를 확인하고 비밀번호를 변경합니다.</p>
      </div>

      {/* 프로필 카드 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
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
        <div className="divide-y divide-gray-50">
          <InfoRow label="이름" value={profile.name} />
          <InfoRow label="이메일" value={profile.email ?? '-'} />
          <InfoRow label="연락처" value={profile.phone ?? '-'} />
          {profile.employment_type && (
            <InfoRow label="고용 형태" value={profile.employment_type} />
          )}
          <InfoRow label="역할" value={roleLabel(profile.role)} />
        </div>
      </div>

      {/* 비밀번호 변경 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">비밀번호 변경</p>
            <p className="text-xs text-gray-400 mt-0.5">보안을 위해 주기적으로 변경하세요.</p>
          </div>
          <button
            onClick={() => setShowPwForm(v => !v)}
            className="text-sm text-blue-600 font-medium hover:text-blue-800"
          >
            {showPwForm ? '취소' : '변경'}
          </button>
        </div>

        {showPwForm && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">새 비밀번호</label>
              <input
                type="password"
                value={pwForm.next}
                onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                placeholder="6자 이상"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">새 비밀번호 확인</label>
              <input
                type="password"
                value={pwForm.confirm}
                onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                placeholder="동일하게 입력"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handlePasswordChange}
              disabled={pwSaving}
              className="w-full py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {pwSaving ? '변경 중...' : '비밀번호 변경'}
            </button>
          </div>
        )}
      </div>

      {/* 로그아웃 */}
      <button
        onClick={handleLogout}
        className="w-full py-3 text-sm font-medium text-red-500 bg-white border border-red-100 rounded-2xl hover:bg-red-50 transition-colors shadow-sm"
      >
        로그아웃
      </button>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <span className="text-xs font-medium text-gray-400">{label}</span>
      <span className="text-sm text-gray-800 font-medium">{value}</span>
    </div>
  )
}
