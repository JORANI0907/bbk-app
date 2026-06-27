'use client'

import { useState, useEffect } from 'react'

type Role = 'admin' | 'worker' | 'customer'

interface StoredSession {
  userId: string
  name: string
}

const ROLE_LABELS: Record<Role, string> = {
  admin: '관리자',
  worker: '직원',
  customer: '고객',
}

const ROLE_PORTAL: Record<Role, string> = {
  admin: '/admin',
  worker: '/admin',
  customer: '/customer',
}

function getStored(role: Role): StoredSession | null {
  try {
    const raw = localStorage.getItem(`dev_session_${role}`)
    return raw ? (JSON.parse(raw) as StoredSession) : null
  } catch {
    return null
  }
}

function saveStored(role: Role, data: StoredSession) {
  localStorage.setItem(`dev_session_${role}`, JSON.stringify(data))
}

// 내부 구현 — hooks를 여기에 모음
function DevRoleSwitcherInner() {
  const [currentRole, setCurrentRole] = useState<Role | null>(null)
  const [open, setOpen] = useState(false)
  const [targetRole, setTargetRole] = useState<Role | null>(null)
  const [loginPhone, setLoginPhone] = useState('')
  const [loginPw, setLoginPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const [isOwner, setIsOwner] = useState(false)

  useEffect(() => {
    fetch('/api/dev/me')
      .then(r => r.json())
      .then((d: { role: string | null; isOwner?: boolean }) => {
        if (d.isOwner) {
          setIsOwner(true)
          if (d.role) setCurrentRole(d.role as Role)
        }
      })
      .catch(() => {})
  }, [])

  async function swap(userId: string, role: Role, name: string) {
    const res = await fetch('/api/dev/session-swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role, name }),
    })
    if (!res.ok) throw new Error('세션 교체 실패')
    window.location.href = ROLE_PORTAL[role]
  }

  async function handleRoleClick(role: Role) {
    if (role === currentRole || busy) return
    const stored = getStored(role)
    if (stored) {
      setBusy(true)
      try {
        await swap(stored.userId, role, stored.name)
      } catch {
        setErr('세션 전환 실패')
        setBusy(false)
      }
    } else {
      setTargetRole(role)
      setLoginPhone('')
      setLoginPw('')
      setErr('')
    }
  }

  async function handleLogin() {
    if (!loginPhone.trim() || !loginPw.trim() || !targetRole) return
    setBusy(true)
    setErr('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: loginPhone.trim(), password: loginPw }),
      })
      const data = await res.json() as {
        error?: string
        user?: { id: string; role: string; name: string }
      }
      if (!res.ok) throw new Error(data.error ?? '로그인 실패')
      if (!data.user) throw new Error('사용자 정보 없음')

      saveStored(targetRole, { userId: data.user.id, name: data.user.name })
      await swap(data.user.id, targetRole, data.user.name)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '로그인 실패')
      setBusy(false)
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/session', { method: 'DELETE' })
    window.location.href = '/login'
  }

  function closePanel() {
    setOpen(false)
    setTargetRole(null)
    setErr('')
  }

  if (!isOwner) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-2">
      {/* 미니 로그인 폼 */}
      {targetRole && (
        <div className="bg-gray-950 text-white rounded-xl p-4 w-56 shadow-2xl border border-gray-700">
          <p className="text-[11px] font-bold text-yellow-400 mb-3">
            {ROLE_LABELS[targetRole]} 계정 로그인
          </p>
          <input
            type="text"
            value={loginPhone}
            onChange={e => setLoginPhone(e.target.value)}
            placeholder="전화번호 (아이디)"
            className="w-full bg-gray-800 text-white text-xs px-3 py-2 rounded-lg mb-1.5 focus:outline-none focus:ring-1 focus:ring-yellow-400 placeholder-gray-600"
          />
          <input
            type="password"
            value={loginPw}
            onChange={e => setLoginPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="비밀번호"
            className="w-full bg-gray-800 text-white text-xs px-3 py-2 rounded-lg mb-2 focus:outline-none focus:ring-1 focus:ring-yellow-400 placeholder-gray-600"
          />
          {err && <p className="text-red-400 text-[11px] mb-2">{err}</p>}
          <div className="flex gap-1.5">
            <button
              onClick={handleLogin}
              disabled={busy}
              className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-black text-xs py-2 rounded-lg font-bold disabled:opacity-50 transition-colors"
            >
              {busy ? '...' : '로그인'}
            </button>
            <button
              onClick={() => { setTargetRole(null); setErr('') }}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-xs py-2 rounded-lg transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 메인 패널 */}
      {open && (
        <div className="bg-gray-950 text-white rounded-xl px-3 py-3 shadow-2xl border border-gray-700 flex flex-col gap-2 w-48">
          <div className="flex gap-1">
            {(['admin', 'worker', 'customer'] as Role[]).map(role => (
              <button
                key={role}
                onClick={() => handleRoleClick(role)}
                disabled={busy}
                title={getStored(role) ? `저장됨: ${getStored(role)?.name}` : '로그인 필요'}
                className={`flex-1 text-[11px] py-1.5 rounded-lg font-semibold transition-all disabled:opacity-50 ${
                  currentRole === role
                    ? 'bg-yellow-400 text-black'
                    : getStored(role)
                    ? 'bg-gray-600 hover:bg-gray-500 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-400'
                }`}
              >
                {ROLE_LABELS[role]}
              </button>
            ))}
          </div>
          <button
            onClick={handleLogout}
            className="w-full text-[11px] py-1.5 rounded-lg bg-gray-800 hover:bg-red-950 text-gray-500 hover:text-red-400 transition-all"
          >
            로그아웃
          </button>
        </div>
      )}

      {/* 토글 버튼 */}
      <button
        onClick={() => (open ? closePanel() : setOpen(true))}
        className="bg-gray-950 text-yellow-400 border border-gray-700 text-[11px] font-bold px-3 py-2 rounded-xl shadow-2xl hover:bg-gray-800 transition-all select-none"
      >
        🔧 DEV{currentRole ? ` · ${ROLE_LABELS[currentRole]}` : ''}
      </button>
    </div>
  )
}

// 외부 진입점 — isOwner 체크는 내부에서 처리
export default function DevRoleSwitcher() {
  return <DevRoleSwitcherInner />
}
