'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

type Role = 'admin' | 'worker' | 'customer' | 'franchise_hq'

interface StoredSession {
  userId: string
  name: string
}

const ROLE_LABELS: Record<Role, string> = {
  admin: '관리자',
  worker: '직원',
  customer: '고객',
  franchise_hq: '본사',
}

const ROLE_PORTAL: Record<Role, string> = {
  admin: '/admin',
  worker: '/admin',
  customer: '/customer',
  franchise_hq: '/franchise',
}

const ALL_ROLES: Role[] = ['admin', 'worker', 'customer', 'franchise_hq']

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

function saveLastPage(role: Role) {
  localStorage.setItem(`dev_last_page_${role}`, window.location.href)
}

function getLastPage(role: Role): string {
  return localStorage.getItem(`dev_last_page_${role}`) ?? ROLE_PORTAL[role]
}

interface DevUserOption {
  id: string
  name: string
  phone: string
  subtitle: string | null
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

  // 계정 리스트 (targetRole 별)
  const [userOptions, setUserOptions] = useState<DevUserOption[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [loadingUsers, setLoadingUsers] = useState(false)

  const [isOwner, setIsOwner] = useState(false)
  const pathname = usePathname()
  const HOME_PATHS = ['/admin', '/worker', '/customer', '/franchise']
  const isHomePage = HOME_PATHS.includes(pathname)

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

  // targetRole 이 세팅되면 그 role 의 계정 리스트 로드
  useEffect(() => {
    if (!targetRole) {
      setUserOptions([])
      setUserSearch('')
      return
    }
    setLoadingUsers(true)
    fetch(`/api/dev/users?role=${targetRole}`)
      .then(r => r.json())
      .then((d: { users?: DevUserOption[] }) => setUserOptions(d.users ?? []))
      .catch(() => setUserOptions([]))
      .finally(() => setLoadingUsers(false))
  }, [targetRole])

  async function swap(userId: string, role: Role, name: string) {
    if (currentRole) saveLastPage(currentRole)
    const res = await fetch('/api/dev/session-swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role, name }),
    })
    if (!res.ok) throw new Error('세션 교체 실패')
    window.location.href = getLastPage(role)
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
    // 서버 세션 삭제 + 저장된 dev 세션도 함께 정리 (다음 로그인 시 새 자격증명 요구)
    await fetch('/api/auth/session', { method: 'DELETE' })
    const previousRole = currentRole
    ALL_ROLES.forEach(r => localStorage.removeItem(`dev_session_${r}`))
    setCurrentRole(null)
    // 페이지 이동 없이 DEV 패널 안에서 로그인 폼을 바로 노출.
    // 직전 role 이 있으면 그 채널로, 없으면 관리자를 기본 선택.
    setTargetRole(previousRole ?? 'admin')
    setLoginPhone('')
    setLoginPw('')
    setErr('')
    setOpen(true)
  }

  function closePanel() {
    setOpen(false)
    setTargetRole(null)
    setErr('')
  }

  if (!isOwner || !isHomePage) return null

  return (
    // 모바일에서는 하단 네비바를 가리지 않도록 위로 띄우고, 데스크톱은 기존 위치 유지
    <div className="fixed bottom-24 right-4 md:bottom-4 z-[9999] flex flex-col items-end gap-2">
      {/* 미니 로그인 폼 */}
      {targetRole && (() => {
        const q = userSearch.trim().toLowerCase()
        const filteredUsers = q
          ? userOptions.filter(u =>
              u.name.toLowerCase().includes(q) ||
              u.phone.toLowerCase().includes(q) ||
              (u.subtitle ?? '').toLowerCase().includes(q),
            )
          : userOptions
        return (
        <div className="bg-gray-950 text-white rounded-xl p-4 w-64 shadow-2xl border border-gray-700">
          <p className="text-[11px] font-bold text-yellow-400 mb-2">
            {ROLE_LABELS[targetRole]} 계정 로그인
          </p>

          {/* 계정 검색 + 리스트 */}
          <input
            type="text"
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            placeholder="이름·연락처·사업장 검색"
            className="w-full bg-gray-800 text-white text-[11px] px-2.5 py-1.5 rounded-lg mb-1 focus:outline-none focus:ring-1 focus:ring-yellow-400 placeholder-gray-600"
          />
          <div className="max-h-32 overflow-y-auto rounded-lg border border-gray-800 bg-gray-900/60 mb-2">
            {loadingUsers ? (
              <p className="text-[10px] text-gray-500 px-2 py-2">불러오는 중...</p>
            ) : filteredUsers.length === 0 ? (
              <p className="text-[10px] text-gray-500 px-2 py-2">
                {userOptions.length === 0 ? '계정이 없습니다.' : '검색 결과 없음'}
              </p>
            ) : (
              filteredUsers.slice(0, 30).map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { setLoginPhone(u.phone); setUserSearch('') }}
                  className={`w-full text-left px-2 py-1 hover:bg-gray-800 transition-colors border-b border-gray-800 last:border-0 ${
                    loginPhone === u.phone ? 'bg-yellow-400/10' : ''
                  }`}
                >
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[11px] font-semibold text-white truncate">{u.name || '(이름없음)'}</span>
                    <span className="text-[10px] text-gray-500 font-mono truncate">{u.phone}</span>
                  </div>
                  {u.subtitle && (
                    <p className="text-[10px] text-gray-500 truncate">{u.subtitle}</p>
                  )}
                </button>
              ))
            )}
          </div>

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
        )
      })()}

      {/* 메인 패널 */}
      {open && (
        <div className="bg-gray-950 text-white rounded-xl px-3 py-3 shadow-2xl border border-gray-700 flex flex-col gap-2 w-56">
          {/* 채널 4개 (관리자·직원·고객·본사) — 2x2 그리드로 배치 */}
          <div className="grid grid-cols-2 gap-1">
            {ALL_ROLES.map(role => (
              <button
                key={role}
                onClick={() => handleRoleClick(role)}
                disabled={busy}
                title={getStored(role) ? `저장됨: ${getStored(role)?.name}` : '로그인 필요'}
                className={`text-[11px] py-1.5 rounded-lg font-semibold transition-all disabled:opacity-50 ${
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
