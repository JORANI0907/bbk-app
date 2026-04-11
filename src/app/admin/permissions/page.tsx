'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'

// ─── 타입 ────────────────────────────────────────────────────────

interface MenuPermission {
  href: string
  label: string
  group: string
  admin: boolean
  worker: boolean
}

// ─── Sidebar NAV_ITEMS 기반 메뉴 목록 ────────────────────────────

const MENU_LIST: Omit<MenuPermission, 'admin' | 'worker'>[] = [
  // 영업관리
  { href: '/admin/schedule', label: '배정관리', group: '영업관리' },
  { href: '/admin/applications', label: '서비스관리', group: '영업관리' },
  { href: '/admin/customers', label: '고객관리', group: '영업관리' },
  { href: '/admin/reports', label: '월간보고서', group: '영업관리' },
  // 인사·현장관리
  { href: '/admin/attendance', label: '출퇴근관리', group: '인사·현장관리' },
  { href: '/admin/workers', label: '직원관리', group: '인사·현장관리' },
  { href: '/admin/incidents', label: '경위서', group: '인사·현장관리' },
  { href: '/admin/inventory', label: '재고관리', group: '인사·현장관리' },
  { href: '/admin/requests', label: '요청관리', group: '인사·현장관리' },
  { href: '/admin/my-requests', label: '요청하기(직원)', group: '인사·현장관리' },
  // 재무관리
  { href: '/admin/payroll', label: '급여정산', group: '재무관리' },
  { href: '/admin/finance', label: '매출매입', group: '재무관리' },
  { href: '/admin/invoices', label: '세금계산서', group: '재무관리' },
  // 앱관리
  { href: '/admin/notices', label: '공지·이벤트관리', group: '앱관리' },
  { href: '/admin/automation', label: '자동화관리', group: '앱관리' },
  { href: '/admin/nav-settings', label: '하단 메뉴 설정', group: '앱관리' },
  { href: '/admin/permissions', label: '탭 권한 설정', group: '앱관리' },
  { href: '/admin/members', label: '계정관리', group: '앱관리' },
]

// 기본 권한 (admin이면 모두 허용, worker는 일부만)
const WORKER_DEFAULT_ALLOWED = new Set([
  '/admin/schedule',
  '/admin/customers',
  '/admin/attendance',
  '/admin/workers',
  '/admin/incidents',
  '/admin/inventory',
  '/admin/my-requests',
])

function buildDefaultPermissions(): MenuPermission[] {
  return MENU_LIST.map(m => ({
    ...m,
    admin: true,
    worker: WORKER_DEFAULT_ALLOWED.has(m.href),
  }))
}

// ─── 컴포넌트 ────────────────────────────────────────────────────

export default function PermissionsPage() {
  const [permissions, setPermissions] = useState<MenuPermission[]>(buildDefaultPermissions())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/app-settings?key=tab_permissions')
      const json = await res.json()
      if (json.setting?.value && typeof json.setting.value === 'object') {
        const saved = json.setting.value as Record<string, { admin: boolean; worker: boolean }>
        setPermissions(buildDefaultPermissions().map(p => ({
          ...p,
          ...(saved[p.href] ?? {}),
        })))
      }
    } catch {
      toast.error('설정을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  const togglePerm = (href: string, role: 'admin' | 'worker') => {
    // admin 권한은 항상 true 강제 (관리자는 항상 모든 탭 접근 가능)
    if (role === 'admin') {
      toast.error('관리자 권한은 변경할 수 없습니다.')
      return
    }
    setPermissions(prev =>
      prev.map(p => p.href === href ? { ...p, [role]: !p[role] } : p)
    )
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // 저장 형식: { [href]: { admin, worker } }
      const value: Record<string, { admin: boolean; worker: boolean }> = {}
      for (const p of permissions) {
        value[p.href] = { admin: p.admin, worker: p.worker }
      }
      const res = await fetch('/api/admin/app-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'tab_permissions', value }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '저장 실패'); return }
      toast.success('권한 설정이 저장되었습니다.')
    } catch {
      toast.error('네트워크 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  // 그룹별로 묶기
  const groups = Array.from(new Set(MENU_LIST.map(m => m.group)))

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">탭 권한 설정</h1>
          <p className="text-xs text-gray-400 mt-0.5">메뉴별 역할 접근 권한을 설정합니다.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors disabled:opacity-50"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>

      {/* 안내 */}
      <div className="px-4 pb-3">
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700">
          관리자(admin) 권한은 항상 모든 메뉴에 접근 가능합니다. 직원(worker) 권한만 조정할 수 있습니다.
        </div>
      </div>

      {/* 테이블 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">로딩 중...</div>
        ) : (
          groups.map(group => {
            const groupItems = permissions.filter(p => p.group === group)
            return (
              <div key={group} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {/* 그룹 헤더 */}
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">{group}</h2>
                </div>

                {/* 컬럼 헤더 */}
                <div className="grid grid-cols-3 gap-2 px-4 py-2 border-b border-gray-50 text-xs font-semibold text-gray-400">
                  <span>메뉴</span>
                  <span className="text-center">관리자</span>
                  <span className="text-center">직원</span>
                </div>

                {/* 행 */}
                {groupItems.map((item, idx) => (
                  <div
                    key={item.href}
                    className={`grid grid-cols-3 gap-2 px-4 py-3 items-center ${
                      idx !== groupItems.length - 1 ? 'border-b border-gray-50' : ''
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">{item.label}</p>
                      <p className="text-xs text-gray-400">{item.href}</p>
                    </div>

                    {/* admin 체크박스 (항상 체크, 비활성) */}
                    <div className="flex justify-center">
                      <input
                        type="checkbox"
                        checked={item.admin}
                        onChange={() => togglePerm(item.href, 'admin')}
                        className="w-4 h-4 rounded accent-brand-600 cursor-not-allowed opacity-50"
                        disabled
                      />
                    </div>

                    {/* worker 체크박스 */}
                    <div className="flex justify-center">
                      <input
                        type="checkbox"
                        checked={item.worker}
                        onChange={() => togglePerm(item.href, 'worker')}
                        className="w-4 h-4 rounded accent-brand-600 cursor-pointer"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
