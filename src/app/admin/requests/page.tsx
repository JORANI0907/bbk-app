'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'

interface Request {
  id: string
  requester_id: string
  requester_role: string
  requester_name: string
  category: string
  content: string
  extra_data: Record<string, unknown> | null
  status: 'pending' | 'approved' | 'rejected'
  admin_memo: string | null
  checked_by: string | null
  checked_at: string | null
  requester_read: boolean
  created_at: string
  updated_at: string
}

// ─── 카테고리 정의 ─────────────────────────────────────────────────

const WORKER_CATEGORIES = [
  { value: 'suggestion', label: '건의사항' },
  { value: 'vacation', label: '휴가신청' },
  { value: 'material', label: '자료요청' },
  { value: 'supply', label: '비품/소모품요청' },
  { value: 'inquiry', label: '업무문의' },
]

const CUSTOMER_CATEGORIES = [
  { value: 'service_inquiry', label: '서비스문의' },
  { value: 'schedule_change', label: '일정변경요청' },
  { value: 'complaint', label: '불만/클레임' },
  { value: 'additional_service', label: '추가서비스요청' },
  { value: 'other', label: '기타문의' },
]

const ALL_CATEGORY_LABELS: Record<string, string> = {
  suggestion: '건의사항',
  vacation: '휴가신청',
  material: '자료요청',
  supply: '비품/소모품요청',
  inquiry: '업무문의',
  // legacy
  schedule: '일정조정',
  other: '기타',
  // customer
  service_inquiry: '서비스문의',
  schedule_change: '일정변경요청',
  complaint: '불만/클레임',
  additional_service: '추가서비스요청',
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const STATUS_LABELS: Record<string, string> = {
  pending: '대기중',
  approved: '승인',
  rejected: '거절',
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'

// ─── 직원용 제출 폼 ────────────────────────────────────────────────

function WorkerSubmitForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [category, setCategory] = useState(WORKER_CATEGORIES[0].value)
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) { toast.error('내용을 입력하세요.'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, content: content.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '제출 실패'); return }
      toast.success('요청이 제출되었습니다.')
      setContent('')
      onSubmitted()
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
      <h2 className="text-sm font-bold text-gray-800">새 요청 작성</h2>

      {/* 카테고리 선택 */}
      <div className="flex gap-2 flex-wrap">
        {WORKER_CATEGORIES.map(cat => (
          <button
            key={cat.value}
            type="button"
            onClick={() => setCategory(cat.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              category === cat.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* 내용 */}
      <textarea
        rows={4}
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder={
          category === 'vacation' ? '휴가 기간, 사유를 입력하세요.' :
          category === 'supply' ? '필요한 물품명, 수량, 용도를 입력하세요.' :
          category === 'material' ? '필요한 자료 종류와 목적을 입력하세요.' :
          '내용을 자유롭게 입력하세요.'
        }
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />

      <button
        type="submit"
        disabled={submitting}
        className="self-end px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {submitting ? '제출 중...' : '요청 제출'}
      </button>
    </form>
  )
}

// ─── 직원용 내 요청 목록 ────────────────────────────────────────────

function WorkerRequestList({ refreshKey }: { refreshKey: number }) {
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(false)

  const fetchMyRequests = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/requests?limit=50')
      const json = await res.json()
      if (res.ok) setRequests(json.data ?? [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchMyRequests() }, [fetchMyRequests, refreshKey])

  if (loading) return <div className="text-center py-8 text-sm text-gray-400">불러오는 중...</div>
  if (requests.length === 0) return (
    <div className="text-center py-12 text-sm text-gray-400">아직 제출한 요청이 없습니다.</div>
  )

  return (
    <div className="flex flex-col gap-2">
      {requests.map(req => (
        <div key={req.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {ALL_CATEGORY_LABELS[req.category] ?? req.category}
            </span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[req.status]}`}>
              {STATUS_LABELS[req.status]}
            </span>
          </div>
          <p className="text-sm text-gray-800">{req.content}</p>
          {req.admin_memo && (
            <div className="mt-2 bg-blue-50 rounded-lg p-2.5">
              <p className="text-xs text-blue-500 font-medium mb-0.5">관리자 답변</p>
              <p className="text-xs text-blue-800">{req.admin_memo}</p>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-2">{new Date(req.created_at).toLocaleDateString('ko-KR')}</p>
        </div>
      ))}
    </div>
  )
}

// ─── 관리자용 요청 목록 ────────────────────────────────────────────

function AdminRequestView() {
  const [requesterTab, setRequesterTab] = useState<'worker' | 'customer'>('worker')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [requests, setRequests] = useState<Request[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Request | null>(null)
  const [adminMemo, setAdminMemo] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50', role: 'admin' })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await fetch(`/api/admin/requests?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '로드 실패'); return }
      setRequests(json.data ?? [])
      setTotal(json.total ?? 0)
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  const handleStatusChange = async (newStatus: 'approved' | 'rejected') => {
    if (!selected) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, status: newStatus, admin_memo: adminMemo }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '저장 실패'); return }
      toast.success(newStatus === 'approved' ? '승인되었습니다.' : '거절되었습니다.')
      setSelected(null)
      fetchRequests()
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setSaving(false)
    }
  }

  // 탭에 따라 필터링
  const filtered = requests.filter(r =>
    requesterTab === 'worker'
      ? r.requester_role === 'worker' || r.requester_role === 'admin'
      : r.requester_role === 'customer'
  )

  const workerPending = requests.filter(r =>
    (r.requester_role === 'worker' || r.requester_role === 'admin') && r.status === 'pending'
  ).length
  const customerPending = requests.filter(r =>
    r.requester_role === 'customer' && r.status === 'pending'
  ).length

  return (
    <>
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
          <p className="text-xs font-medium text-amber-600 mb-0.5">직원 대기중</p>
          <p className="text-2xl font-bold text-amber-700">{workerPending}</p>
        </div>
        <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
          <p className="text-xs font-medium text-purple-600 mb-0.5">고객 대기중</p>
          <p className="text-2xl font-bold text-purple-700">{customerPending}</p>
        </div>
      </div>

      {/* 요청자 탭 */}
      <div className="flex gap-1 mb-3 bg-gray-100 rounded-xl p-1 w-fit">
        {([
          { key: 'worker', label: `직원 (${requests.filter(r => r.requester_role === 'worker' || r.requester_role === 'admin').length})` },
          { key: 'customer', label: `고객 (${requests.filter(r => r.requester_role === 'customer').length})` },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setRequesterTab(tab.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${requesterTab === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* 상태 필터 */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 w-fit">
        {(['all', 'pending', 'approved', 'rejected'] as StatusFilter[]).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {s === 'all' ? '전체' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">요청이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">요청자</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">카테고리</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">내용</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap w-20">상태</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap w-24">날짜</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(req => (
                  <tr key={req.id}
                    onClick={() => { setSelected(req); setAdminMemo(req.admin_memo ?? '') }}
                    className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${req.status === 'pending' ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {req.status === 'pending' && (
                          <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                        )}
                        <p className="font-medium text-gray-900">{req.requester_name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {ALL_CATEGORY_LABELS[req.category] ?? req.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs">
                      <p className="truncate">{req.content}</p>
                      {req.status === 'pending' && (
                        <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full">NEW</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[req.status]}`}>
                        {STATUS_LABELS[req.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(req.created_at).toLocaleDateString('ko-KR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 상세 모달 */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-30 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {ALL_CATEGORY_LABELS[selected.category] ?? selected.category}
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[selected.status]}`}>
                  {STATUS_LABELS[selected.status]}
                </span>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">요청자</p>
                  <p className="font-medium text-gray-800">{selected.requester_name}</p>
                  <p className="text-xs text-gray-400">
                    {selected.requester_role === 'customer' ? '고객' : '직원'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">요청일</p>
                  <p className="font-medium text-gray-800">{new Date(selected.created_at).toLocaleDateString('ko-KR')}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">요청 내용</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{selected.content}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">관리자 메모</p>
                <textarea rows={3} value={adminMemo}
                  onChange={e => setAdminMemo(e.target.value)}
                  placeholder="승인/거절 사유 또는 답변을 입력하세요"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>
            {selected.status === 'pending' && (
              <div className="px-6 py-4 border-t border-gray-100 flex gap-2 justify-end">
                <button onClick={() => handleStatusChange('rejected')} disabled={saving}
                  className="px-4 py-2 text-sm text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50">
                  거절
                </button>
                <button onClick={() => handleStatusChange('approved')} disabled={saving}
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {saving ? '처리 중...' : '승인'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ─── 메인 페이지 ───────────────────────────────────────────────────

export default function RequestsPage() {
  const [userRole, setUserRole] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    fetch('/api/admin/me')
      .then(r => r.json())
      .then(j => setUserRole(j.role ?? ''))
      .catch(() => {})
  }, [])

  if (!userRole) return null

  // ── 직원 화면 ─────────────────────────────────────────────────
  if (userRole === 'worker') {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">요청하기</h1>
          <p className="text-sm text-gray-500 mt-1">건의사항, 휴가신청, 자료요청 등을 제출하세요.</p>
        </div>

        <WorkerSubmitForm onSubmitted={() => setRefreshKey(k => k + 1)} />

        <div>
          <h2 className="text-sm font-bold text-gray-700 mb-3">내 요청 내역</h2>
          <WorkerRequestList refreshKey={refreshKey} />
        </div>
      </div>
    )
  }

  // ── 관리자 화면 ──────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">요청 관리</h1>
        <p className="text-sm text-gray-500 mt-1">직원 및 고객의 요청을 확인하고 처리합니다.</p>
      </div>
      <AdminRequestView />
    </div>
  )
}
