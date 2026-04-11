'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'

// ─── 타입 ────────────────────────────────────────────────────────

type RoleTab = 'admin' | 'worker'

interface NavItem {
  href: string
  label: string
}

// ─── AdminMobileNav의 ADMIN_ALL_ITEMS / WORKER_ALL_ITEMS와 동기화 ──

const ADMIN_ALL: NavItem[] = [
  { href: '/admin', label: '홈' },
  { href: '/admin/schedule', label: '배정관리' },
  { href: '/admin/applications', label: '서비스' },
  { href: '/admin/customers', label: '고객관리' },
  { href: '/admin/workers', label: '직원정보' },
  { href: '/admin/attendance', label: '출퇴근' },
  { href: '/admin/inventory', label: '재고관리' },
  { href: '/admin/incidents', label: '경위서' },
  { href: '/admin/payroll', label: '급여정산' },
  { href: '/admin/finance', label: '매출매입' },
  { href: '/admin/reports', label: '월간보고서' },
  { href: '/admin/requests', label: '요청관리' },
  { href: '/admin/notices', label: '공지·이벤트' },
  { href: '/admin/invoices', label: '세금계산서' },
]

const WORKER_ALL: NavItem[] = [
  { href: '/admin', label: '홈' },
  { href: '/admin/schedule', label: '일정' },
  { href: '/admin/customers', label: '고객관리' },
  { href: '/admin/attendance', label: '출퇴근' },
  { href: '/admin/inventory', label: '재고관리' },
  { href: '/admin/incidents', label: '경위서' },
  { href: '/admin/my-requests', label: '요청하기' },
]

const DEFAULT_ADMIN_QUICK = ['/admin', '/admin/schedule', '/admin/applications', '/admin/customers']
const DEFAULT_WORKER_QUICK = ['/admin', '/admin/schedule', '/admin/customers', '/admin/attendance']

const MAX_QUICK = 4

// ─── 컴포넌트 ────────────────────────────────────────────────────

export default function NavSettingsPage() {
  const [role, setRole] = useState<RoleTab>('admin')
  const [adminSelected, setAdminSelected] = useState<string[]>(DEFAULT_ADMIN_QUICK)
  const [workerSelected, setWorkerSelected] = useState<string[]>(DEFAULT_WORKER_QUICK)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const [adminRes, workerRes] = await Promise.all([
        fetch('/api/admin/app-settings?key=nav_quick_admin'),
        fetch('/api/admin/app-settings?key=nav_quick_worker'),
      ])
      const [adminJson, workerJson] = await Promise.all([adminRes.json(), workerRes.json()])

      if (adminJson.setting?.value && Array.isArray(adminJson.setting.value)) {
        setAdminSelected(adminJson.setting.value as string[])
      }
      if (workerJson.setting?.value && Array.isArray(workerJson.setting.value)) {
        setWorkerSelected(workerJson.setting.value as string[])
      }
    } catch {
      toast.error('설정을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  const allItems = role === 'admin' ? ADMIN_ALL : WORKER_ALL
  const selected = role === 'admin' ? adminSelected : workerSelected
  const setSelected = role === 'admin' ? setAdminSelected : setWorkerSelected

  const toggleItem = (href: string) => {
    setSelected(prev => {
      if (prev.includes(href)) {
        return prev.filter(h => h !== href)
      }
      if (prev.length >= MAX_QUICK) {
        toast.error(`최대 ${MAX_QUICK}개까지 선택할 수 있습니다.`)
        return prev
      }
      return [...prev, href]
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const key = role === 'admin' ? 'nav_quick_admin' : 'nav_quick_worker'
      const res = await fetch('/api/admin/app-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: selected }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '저장 실패'); return }
      toast.success('저장되었습니다.')
    } catch {
      toast.error('네트워크 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">하단 메뉴 설정</h1>
          <p className="text-xs text-gray-400 mt-0.5">모바일 앱 하단 탭 퀵 메뉴를 설정합니다.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors disabled:opacity-50"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>

      {/* 역할 탭 */}
      <div className="flex gap-1 px-4 pb-3">
        <button
          onClick={() => setRole('admin')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            role === 'admin' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          관리자
        </button>
        <button
          onClick={() => setRole('worker')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            role === 'worker' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          직원
        </button>
      </div>

      {/* 안내 배너 */}
      <div className="px-4 pb-3">
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700">
          <strong>최대 {MAX_QUICK}개</strong>를 선택하세요. 선택된 항목이 하단 탭에 표시됩니다.
          현재 <strong>{selected.length}/{MAX_QUICK}개</strong> 선택됨.
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">로딩 중...</div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {/* 선택된 퀵탭 순서 표시 */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-4">
            <div className="px-4 py-3 border-b border-gray-50">
              <h2 className="text-sm font-bold text-gray-900">현재 퀵탭 순서</h2>
            </div>
            <div className="p-4 flex gap-2 flex-wrap">
              {selected.length === 0 ? (
                <p className="text-xs text-gray-400">선택된 메뉴가 없습니다.</p>
              ) : (
                selected.map((href, idx) => {
                  const item = allItems.find(i => i.href === href)
                  return (
                    <div key={href} className="flex items-center gap-1.5 bg-brand-50 text-brand-700 text-xs font-medium px-3 py-1.5 rounded-full">
                      <span className="text-brand-400 font-bold">{idx + 1}</span>
                      {item?.label ?? href}
                      <button
                        onClick={() => toggleItem(href)}
                        className="text-brand-400 hover:text-brand-700 leading-none ml-0.5"
                        aria-label="제거"
                      >
                        ×
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* 전체 메뉴 목록 */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <h2 className="text-sm font-bold text-gray-900">전체 메뉴 목록</h2>
            </div>
            {allItems.map((item, idx) => {
              const isSelected = selected.includes(item.href)
              const order = selected.indexOf(item.href)
              return (
                <label
                  key={item.href}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                    idx !== allItems.length - 1 ? 'border-b border-gray-50' : ''
                  } ${isSelected ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleItem(item.href)}
                    className="w-4 h-4 rounded accent-brand-600"
                  />
                  <span className="flex-1 text-sm font-medium text-gray-800">{item.label}</span>
                  <span className="text-xs text-gray-400">{item.href}</span>
                  {isSelected && (
                    <span className="text-xs font-bold text-brand-600 bg-brand-100 w-5 h-5 rounded-full flex items-center justify-center">
                      {order + 1}
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
