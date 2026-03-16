'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { User, UserRole } from '@/types/database'
import toast from 'react-hot-toast'

const ROLE_LABELS: Record<UserRole, string> = {
  admin: '관리자',
  worker: '직원',
  customer: '고객',
}

const ROLE_BADGE: Record<UserRole, 'info' | 'success' | 'warning'> = {
  admin: 'warning',
  worker: 'info',
  customer: 'success',
}

interface FormData {
  role: UserRole
  name: string
  phone: string
  email: string
}

const EMPTY_FORM: FormData = { role: 'worker', name: '', phone: '', email: '' }

export default function MembersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [filterRole, setFilterRole] = useState<UserRole | 'all'>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pwModal, setPwModal] = useState<{ id: string; name: string } | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [settingPw, setSettingPw] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchUsers = async () => {
    const res = await fetch('/api/admin/users')
    const data = await res.json()
    setUsers(data.users ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [])

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error('이름과 전화번호를 입력해주세요.')
      return
    }
    setSaving(true)
    try {
      const isEdit = !!editingId
      const res = await fetch('/api/admin/users', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { id: editingId, ...form } : form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      toast.success(isEdit ? '수정되었습니다.' : `${ROLE_LABELS[form.role]} 등록 완료!`)
      setShowForm(false)
      setForm(EMPTY_FORM)
      setEditingId(null)
      fetchUsers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (user: User) => {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, is_active: !user.is_active }),
    })
    if (res.ok) {
      toast.success(user.is_active ? '비활성화했습니다.' : '활성화했습니다.')
      fetchUsers()
    }
  }

  const handleEdit = (user: User) => {
    setForm({ role: user.role, name: user.name, phone: user.phone, email: user.email ?? '' })
    setEditingId(user.id)
    setShowForm(true)
  }

  const handleDelete = async (user: User) => {
    if (!confirm(`"${user.name}" 계정을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return
    setDeletingId(user.id)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`${user.name} 계정이 삭제되었습니다.`)
      fetchUsers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '삭제 실패')
    } finally {
      setDeletingId(null)
    }
  }

  const handleResetPassword = async () => {
    if (!pwModal || !newPassword.trim()) return
    if (newPassword.length < 8) {
      toast.error('비밀번호는 8자 이상이어야 합니다.')
      return
    }
    setSettingPw(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pwModal.id, reset_password: true, new_password: newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`${pwModal.name} 비밀번호가 변경되었습니다.`)
      setPwModal(null)
      setNewPassword('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '비밀번호 변경 실패')
    } finally {
      setSettingPw(false)
    }
  }

  const filtered = filterRole === 'all' ? users : users.filter(u => u.role === filterRole)

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">회원 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">전체 계정을 등록·수정·삭제하고 비밀번호를 초기화할 수 있습니다</p>
        </div>
        <Button onClick={() => { setShowForm(true); setForm(EMPTY_FORM); setEditingId(null) }}>
          + 등록
        </Button>
      </div>

      {/* 역할 필터 */}
      <div className="flex gap-2 mb-4">
        {(['all', 'admin', 'worker', 'customer'] as const).map(r => (
          <button
            key={r}
            onClick={() => setFilterRole(r)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterRole === r ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {r === 'all' ? `전체 (${users.length})` : `${ROLE_LABELS[r]} (${users.filter(u => u.role === r).length})`}
          </button>
        ))}
      </div>

      {/* 등록/수정 폼 */}
      {showForm && (
        <Card className="p-5 mb-4 border-blue-200 bg-blue-50">
          <h2 className="font-semibold text-gray-900 mb-4">
            {editingId ? '회원 수정' : '새 회원 등록'}
          </h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">역할</label>
              <div className="flex gap-2">
                {(['admin', 'worker', 'customer'] as UserRole[]).map(r => (
                  <button
                    key={r}
                    onClick={() => setForm(f => ({ ...f, role: r }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      form.role === r
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-600 border border-gray-200'
                    }`}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">이름 *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="홍길동"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">전화번호 *</label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="01012345678"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">이메일 (선택)</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="example@email.com"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button onClick={handleSubmit} isLoading={saving} className="flex-1">
                {editingId ? '저장' : '등록하기'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => { setShowForm(false); setEditingId(null) }}
                className="flex-1"
              >
                취소
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* 비밀번호 초기화 모달 */}
      {pwModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
          <Card className="p-6 w-full max-w-sm">
            <h3 className="font-bold text-gray-900 mb-1">비밀번호 초기화</h3>
            <p className="text-sm text-gray-500 mb-4">{pwModal.name} 계정의 새 비밀번호를 설정합니다.</p>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="새 비밀번호 (8자 이상)"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
              onKeyDown={e => e.key === 'Enter' && handleResetPassword()}
            />
            <div className="flex gap-2">
              <Button onClick={handleResetPassword} isLoading={settingPw} className="flex-1">
                변경
              </Button>
              <Button variant="secondary" onClick={() => { setPwModal(null); setNewPassword('') }} className="flex-1">
                취소
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 사용자 목록 */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg mb-2">등록된 회원이 없습니다</p>
          <p className="text-sm">+ 등록 버튼으로 추가하세요</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(user => (
            <Card key={user.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-semibold text-blue-600 text-sm">
                    {user.name[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm">{user.name}</span>
                      <Badge variant={ROLE_BADGE[user.role]}>{ROLE_LABELS[user.role]}</Badge>
                      {!user.is_active && <Badge variant="default">비활성</Badge>}
                      {user.auth_id && <span className="text-xs text-green-500">●</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{user.phone}</p>
                    {user.email && <p className="text-xs text-gray-400">{user.email}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEdit(user)}
                    className="px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded-lg"
                  >
                    수정
                  </button>
                  {user.auth_id && (
                    <button
                      onClick={() => { setPwModal({ id: user.id, name: user.name }); setNewPassword('') }}
                      className="px-2.5 py-1 text-xs text-blue-500 hover:bg-blue-50 rounded-lg"
                    >
                      비밀번호
                    </button>
                  )}
                  <button
                    onClick={() => handleToggleActive(user)}
                    className={`px-2.5 py-1 text-xs rounded-lg ${
                      user.is_active
                        ? 'text-orange-500 hover:bg-orange-50'
                        : 'text-green-600 hover:bg-green-50'
                    }`}
                  >
                    {user.is_active ? '비활성화' : '활성화'}
                  </button>
                  <button
                    onClick={() => handleDelete(user)}
                    disabled={deletingId === user.id}
                    className="px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-40"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
