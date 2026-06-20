'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { User, UserRole } from '@/types/database'
import toast from 'react-hot-toast'
import RegisterForm, { CustomerItem, WorkerItem, RegisterFormData } from './RegisterForm'
import EditForm, { EditFormData } from './EditForm'
import LoginLogsDrawer from './LoginLogsDrawer'

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

interface ConfirmModal {
  title: string
  message: string
  onConfirm: () => void
}

const EMPTY_FORM: RegisterFormData = { role: 'worker', name: '', phone: '', email: '' }
const EMPTY_EDIT: EditFormData = { name: '', phone: '', email: '', new_password: '' }

function normalizePhone(phone: string) {
  return phone.replace(/-/g, '')
}

function cardPwHint(user: User): string {
  if (user.password_hint) return user.password_hint
  const phone = (user.phone ?? '').replace(/-/g, '')
  if (user.role === 'customer') return `사업자번호 (없으면 ${phone})`
  return `${phone}bbk`
}

export default function MembersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<RegisterFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [filterRole, setFilterRole] = useState<UserRole | 'all'>('all')

  // 수정 폼
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState<EditFormData>(EMPTY_EDIT)
  const [editSaving, setEditSaving] = useState(false)

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [showPwIds, setShowPwIds] = useState<Set<string>>(new Set())

  // 커스텀 확인 모달
  const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null)

  // 고객/직원 검색 드롭다운
  const [customers, setCustomers] = useState<CustomerItem[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [workers, setWorkers] = useState<WorkerItem[]>([])
  const [workerSearch, setWorkerSearch] = useState('')
  const [showWorkerDropdown, setShowWorkerDropdown] = useState(false)

  // 현재 로그인 사용자
  const [currentRole, setCurrentRole] = useState<string>('admin')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<User | null>(null)

  // worker 자신의 PW 변경
  const [selfNewPw, setSelfNewPw] = useState('')
  const [selfConfirmPw, setSelfConfirmPw] = useState('')
  const [selfSaving, setSelfSaving] = useState(false)

  // 로그인 기록 드로어
  const [logsTarget, setLogsTarget] = useState<{ id: string; name: string } | null>(null)

  // 포털 미리보기
  const [previewingId, setPreviewingId] = useState<string | null>(null)

  const isWorker = currentRole === 'worker'

  const fetchUsers = async () => {
    const res = await fetch('/api/admin/users')
    const data = await res.json()
    setUsers(data.users ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.user) {
        setCurrentRole(d.user.role ?? 'admin')
        setCurrentUserId(d.user.userId ?? null)
      }
    }).catch(() => {})
    fetchUsers()
  }, [])

  useEffect(() => {
    if (currentUserId && users.length > 0) {
      setCurrentUser(users.find(u => u.id === currentUserId) ?? null)
    }
  }, [currentUserId, users])

  useEffect(() => {
    if (showForm && form.role === 'customer') {
      fetch('/api/admin/customers?subscription_only=true').then(r => r.json()).then(d => setCustomers(d.customers ?? [])).catch(() => {})
    }
    if (showForm && (form.role === 'worker' || form.role === 'admin')) {
      fetch('/api/admin/workers').then(r => r.json()).then(d => setWorkers(d.workers ?? [])).catch(() => {})
    }
  }, [showForm, form.role])

  const closeForm = () => {
    setShowForm(false)
    setForm(EMPTY_FORM)
    setCustomerSearch('')
    setWorkerSearch('')
    setShowCustomerDropdown(false)
    setShowWorkerDropdown(false)
  }

  const closeEditForm = () => {
    setEditingUser(null)
    setEditForm(EMPTY_EDIT)
  }

  const openConfirm = (modal: ConfirmModal) => setConfirmModal(modal)

  const handleApprove = async (user: User) => {
    setApprovingId(user.id)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, is_active: true }),
      })
      if (res.ok) { toast.success(`${user.name} 계정이 승인되었습니다.`); fetchUsers() }
    } finally { setApprovingId(null) }
  }

  const handleRejectSignup = (user: User) => {
    openConfirm({
      title: '가입 신청 거절',
      message: `"${user.name}" 가입 신청을 거절하시겠습니까?\n계정이 삭제됩니다.`,
      onConfirm: async () => {
        setConfirmModal(null)
        setDeletingId(user.id)
        try {
          const res = await fetch('/api/admin/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: user.id }) })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error)
          toast.success(`${user.name} 가입 신청이 거절되었습니다.`)
          fetchUsers()
        } catch (err) { toast.error(err instanceof Error ? err.message : '처리 실패') }
        finally { setDeletingId(null) }
      },
    })
  }

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.phone.trim()) { toast.error('이름과 전화번호를 입력해주세요.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (form.worker_id && data.user?.id) {
        await fetch('/api/admin/workers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: form.worker_id, user_id: data.user.id }) })
      }
      toast.success(`${ROLE_LABELS[form.role]} 등록 완료!`)
      closeForm()
      fetchUsers()
    } catch (err) { toast.error(err instanceof Error ? err.message : '저장 실패') }
    finally { setSaving(false) }
  }

  const handleEditSubmit = async () => {
    if (!editingUser) return
    if (!editForm.name.trim() || !editForm.phone.trim()) { toast.error('이름과 전화번호를 입력해주세요.'); return }
    if (editForm.new_password && editForm.new_password.length < 8) { toast.error('비밀번호는 8자 이상이어야 합니다.'); return }
    setEditSaving(true)
    try {
      // 1) 이름/전화번호/이메일 업데이트
      const infoRes = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingUser.id, name: editForm.name, phone: editForm.phone, email: editForm.email }),
      })
      const infoData = await infoRes.json()
      if (!infoRes.ok) throw new Error(infoData.error)

      // 2) 비밀번호 별도 업데이트 (입력한 경우만)
      if (editForm.new_password) {
        const pwRes = await fetch('/api/admin/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingUser.id, reset_password: true, new_password: editForm.new_password }),
        })
        const pwData = await pwRes.json()
        if (!pwRes.ok) throw new Error(pwData.error)
      }

      toast.success('수정되었습니다.')
      closeEditForm()
      fetchUsers()
    } catch (err) { toast.error(err instanceof Error ? err.message : '저장 실패') }
    finally { setEditSaving(false) }
  }

  const handleToggleActive = (user: User) => {
    if (user.is_active) {
      openConfirm({
        title: '비활성화',
        message: '비활성화하면 해당 계정으로 로그인할 수 없습니다. 계속하시겠습니까?',
        onConfirm: async () => {
          setConfirmModal(null)
          const res = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: user.id, is_active: false }) })
          if (res.ok) { toast.success('비활성화했습니다.'); fetchUsers() }
        },
      })
    } else {
      fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: user.id, is_active: true }) })
        .then(res => { if (res.ok) { toast.success('활성화했습니다.'); fetchUsers() } })
    }
  }

  const handleEdit = (user: User) => {
    setEditingUser(user)
    setEditForm({ name: user.name, phone: user.phone ?? '', email: user.email ?? '', new_password: '' })
    setShowForm(false)
  }

  const handleDelete = (user: User) => {
    openConfirm({
      title: '계정 삭제',
      message: '삭제하면 되돌릴 수 없습니다. 계속하시겠습니까?',
      onConfirm: async () => {
        setConfirmModal(null)
        setDeletingId(user.id)
        try {
          const res = await fetch('/api/admin/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: user.id }) })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error)
          toast.success(`${user.name} 계정이 삭제되었습니다.`)
          fetchUsers()
        } catch (err) { toast.error(err instanceof Error ? err.message : '삭제 실패') }
        finally { setDeletingId(null) }
      },
    })
  }

  const handleSendAccount = async (user: User) => {
    const phone = (user.phone ?? '').replace(/-/g, '')
    if (!phone) { toast.error('전화번호가 없습니다.'); return }
    setSendingId(user.id)
    try {
      const res = await fetch('/api/admin/members/send-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`${user.name}님께 계정 정보를 발송했습니다.`)
      fetchUsers()
    } catch (err) { toast.error(err instanceof Error ? err.message : '발송 실패') }
    finally { setSendingId(null) }
  }

  const handlePortalPreview = async (user: User) => {
    setPreviewingId(user.id)
    try {
      const res = await fetch('/api/admin/portal-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: user.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      window.open(`/portal-preview/${data.token}`, '_blank')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '포털 열기 실패')
    } finally {
      setPreviewingId(null)
    }
  }

  const handleSelfPasswordChange = async () => {
    if (!currentUser) return
    if (selfNewPw.length < 8) { toast.error('비밀번호는 8자 이상이어야 합니다.'); return }
    if (selfNewPw !== selfConfirmPw) { toast.error('비밀번호가 일치하지 않습니다.'); return }
    setSelfSaving(true)
    try {
      const res = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: currentUser.id, reset_password: true, new_password: selfNewPw }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('비밀번호가 변경되었습니다.')
      setSelfNewPw('')
      setSelfConfirmPw('')
    } catch (err) { toast.error(err instanceof Error ? err.message : '변경 실패') }
    finally { setSelfSaving(false) }
  }

  const normalizedFormPhone = normalizePhone(form.phone)
  const existingCustomerUser = form.role === 'customer' && normalizedFormPhone
    ? !!users.find(u => u.role === 'customer' && normalizePhone(u.phone ?? '') === normalizedFormPhone)
    : false

  const pendingWorkers = users.filter(u => u.role === 'worker' && !u.is_active)
  const filtered = filterRole === 'all'
    ? users.filter(u => u.is_active || u.role !== 'worker')
    : users.filter(u => u.role === filterRole && (u.is_active || u.role !== 'worker'))

  // ── 직원(worker) 뷰 ──
  if (isWorker) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-text-primary mb-1">내 계정</h1>
        <p className="text-sm text-text-secondary mb-6">내 계정 정보를 확인하고 비밀번호를 변경할 수 있습니다.</p>
        {loading ? (
          <div className="text-center py-12 text-text-tertiary text-sm">불러오는 중...</div>
        ) : currentUser ? (
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center justify-center font-bold text-brand-600 text-xl">{currentUser.name[0]}</div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-text-primary">{currentUser.name}</span>
                    <Badge variant={ROLE_BADGE[currentUser.role]}>{ROLE_LABELS[currentUser.role]}</Badge>
                  </div>
                  <p className="text-sm text-text-secondary mt-0.5">{currentUser.phone}</p>
                  {currentUser.email && <p className="text-xs text-text-tertiary">{currentUser.email}</p>}
                </div>
              </div>
              <div className="bg-surface-sunken rounded-xl p-3 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-text-secondary">이름</span><span className="font-medium text-text-primary">{currentUser.name}</span></div>
                <div className="flex justify-between text-sm"><span className="text-text-secondary">전화번호</span><span className="font-medium text-text-primary">{currentUser.phone}</span></div>
                {currentUser.email && <div className="flex justify-between text-sm"><span className="text-text-secondary">이메일</span><span className="font-medium text-text-primary">{currentUser.email}</span></div>}
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">로그인 계정</span>
                  <span className={`font-medium ${currentUser.auth_id ? 'text-state-success' : 'text-text-tertiary'}`}>{currentUser.auth_id ? '활성' : '미설정'}</span>
                </div>
              </div>
            </Card>
            <Card className="p-5">
              <h2 className="font-semibold text-text-primary mb-4">비밀번호 변경</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-text-secondary mb-1.5 block">새 비밀번호 (8자 이상)</label>
                  <input type="password" value={selfNewPw} onChange={e => setSelfNewPw(e.target.value)} placeholder="새 비밀번호" className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-text-secondary mb-1.5 block">비밀번호 확인</label>
                  <input type="password" value={selfConfirmPw} onChange={e => setSelfConfirmPw(e.target.value)} placeholder="비밀번호 재입력" className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                {selfNewPw && selfConfirmPw && selfNewPw !== selfConfirmPw && <p className="text-xs text-state-danger">비밀번호가 일치하지 않습니다.</p>}
                <Button onClick={handleSelfPasswordChange} isLoading={selfSaving} className="w-full">비밀번호 변경</Button>
              </div>
            </Card>
          </div>
        ) : (
          <div className="text-center py-12 text-text-tertiary text-sm">계정 정보를 불러올 수 없습니다.</div>
        )}
      </div>
    )
  }

  // ── 관리자 뷰 ──
  return (
    <div className="p-6 max-w-2xl mx-auto">

      {/* 로그인 기록 드로어 */}
      {logsTarget && (
        <LoginLogsDrawer
          userId={logsTarget.id}
          userName={logsTarget.name}
          onClose={() => setLogsTarget(null)}
        />
      )}

      {/* 커스텀 확인 모달 */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
          <Card className="p-6 w-full max-w-sm">
            <h3 className="font-bold text-text-primary mb-2">{confirmModal.title}</h3>
            <p className="text-sm text-text-secondary mb-5 whitespace-pre-line">{confirmModal.message}</p>
            <div className="flex gap-2">
              <Button onClick={confirmModal.onConfirm} className="flex-1">확인</Button>
              <Button variant="secondary" onClick={() => setConfirmModal(null)} className="flex-1">취소</Button>
            </div>
          </Card>
        </div>
      )}

      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-text-primary">회원 관리</h1>
          <p className="text-sm text-text-secondary mt-0.5 break-keep">전체 계정을 등록·수정·삭제하고 비밀번호를 초기화할 수 있습니다</p>
        </div>
        <Button onClick={() => { setShowForm(true); setForm(EMPTY_FORM); closeEditForm() }} className="shrink-0">+ 등록</Button>
      </div>

      {/* 승인 대기 */}
      {!loading && pendingWorkers.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-orange-600">승인 대기</span>
            <span className="bg-orange-100 text-orange-600 text-xs font-bold px-2 py-0.5 rounded-full">{pendingWorkers.length}</span>
          </div>
          <div className="space-y-2">
            {pendingWorkers.map(user => (
              <Card key={user.id} className="p-4 border-orange-200 bg-orange-50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center font-semibold text-orange-600 text-sm shrink-0">{user.name[0]}</div>
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary text-sm">{user.name}</p>
                    <p className="text-xs text-text-secondary">{user.phone}</p>
                    {user.email && <p className="text-xs text-text-tertiary truncate">{user.email}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleApprove(user)} disabled={approvingId === user.id} className="flex-1 bg-green-600 hover:bg-green-700">
                    {approvingId === user.id ? '처리중...' : '승인'}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => handleRejectSignup(user)} disabled={deletingId === user.id} className="flex-1 text-state-danger border border-red-200 hover:bg-state-danger-bg">
                    거절
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 역할 필터 */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
        {(['all', 'admin', 'worker', 'customer'] as const).map(r => (
          <button
            key={r}
            onClick={() => setFilterRole(r)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 ${filterRole === r ? 'bg-brand-600 text-white' : 'bg-surface-sunken text-text-secondary'}`}
          >
            {r === 'all' ? `전체 (${users.length})` : `${ROLE_LABELS[r]} (${users.filter(u => u.role === r).length})`}
          </button>
        ))}
      </div>

      {/* 등록 폼 */}
      {showForm && (
        <RegisterForm
          form={form}
          setForm={setForm}
          saving={saving}
          onSubmit={handleSubmit}
          onClose={closeForm}
          customers={customers}
          customerSearch={customerSearch}
          setCustomerSearch={setCustomerSearch}
          showCustomerDropdown={showCustomerDropdown}
          setShowCustomerDropdown={setShowCustomerDropdown}
          workers={workers}
          workerSearch={workerSearch}
          setWorkerSearch={setWorkerSearch}
          showWorkerDropdown={showWorkerDropdown}
          setShowWorkerDropdown={setShowWorkerDropdown}
          existingCustomerUser={existingCustomerUser}
          normalizedPhone={normalizedFormPhone}
        />
      )}

      {/* 수정 폼 */}
      {editingUser && (
        <EditForm
          user={editingUser}
          form={editForm}
          setForm={setEditForm}
          saving={editSaving}
          onSubmit={handleEditSubmit}
          onClose={closeEditForm}
        />
      )}

      {/* 사용자 목록 */}
      {loading ? (
        <div className="text-center py-12 text-text-tertiary">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-text-tertiary">
          <p className="text-lg mb-2">등록된 회원이 없습니다</p>
          <p className="text-sm">+ 등록 버튼으로 추가하세요</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(user => (
            <Card key={user.id} className="p-4">
              {/* 사용자 정보 */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center font-semibold text-brand-600 text-sm shrink-0">{user.name[0]}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-text-primary text-sm">{user.name}</span>
                    <Badge variant={ROLE_BADGE[user.role]}>{ROLE_LABELS[user.role]}</Badge>
                    {!user.is_active && <Badge variant="default">비활성</Badge>}
                    <span className={`text-xs ${user.auth_id ? 'text-state-success' : 'text-text-tertiary'}`} title={user.auth_id ? '로그인 계정 있음' : '로그인 계정 없음'}>●</span>
                    {user.account_sent_at && (
                      <span className="text-xs text-state-success font-medium">발송완료</span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary mt-1">
                    <span className="text-text-tertiary">ID</span>
                    <span className="mx-1">:</span>
                    <span className="font-mono">{(user.phone ?? '').replace(/-/g, '')}</span>
                  </p>
                  <p className="text-xs text-text-secondary flex items-center gap-1">
                    <span className="text-text-tertiary">PW</span>
                    <span>:</span>
                    <span className="font-mono">
                      {showPwIds.has(user.id) ? cardPwHint(user) : '••••••••'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPwIds(prev => {
                        const next = new Set(prev)
                        next.has(user.id) ? next.delete(user.id) : next.add(user.id)
                        return next
                      })}
                      className="text-text-tertiary hover:text-text-secondary"
                    >
                      {showPwIds.has(user.id) ? (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </p>
                </div>
              </div>
              {/* 액션 버튼 — 가로 스크롤 */}
              <div className="flex items-center gap-1 overflow-x-auto border-t border-border-subtle pt-2.5 -mx-1 px-1">
                {user.auth_id && (
                  <Button size="sm" onClick={() => handleSendAccount(user)} disabled={sendingId === user.id} className="bg-yellow-300 text-yellow-900 hover:bg-yellow-400 whitespace-nowrap shrink-0">
                    {sendingId === user.id ? '발송 중...' : '계정 발송'}
                  </Button>
                )}
                {user.role === 'customer' && (
                  <Button size="sm" variant="ghost" onClick={() => handlePortalPreview(user)} disabled={previewingId === user.id} className="text-brand-600 hover:bg-brand-50 whitespace-nowrap shrink-0">
                    {previewingId === user.id ? '열기...' : '포털확인'}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setLogsTarget({ id: user.id, name: user.name })} className="shrink-0">기록</Button>
                <Button variant="ghost" size="sm" onClick={() => handleEdit(user)} className="shrink-0">수정</Button>
                <Button variant="ghost" size="sm" onClick={() => handleToggleActive(user)} className={`shrink-0 ${user.is_active ? 'text-orange-500 hover:bg-orange-50' : 'text-state-success hover:bg-state-success-bg'}`}>
                  {user.is_active ? '비활성화' : '활성화'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(user)} disabled={deletingId === user.id} className="text-state-danger hover:bg-state-danger-bg shrink-0">
                  삭제
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
