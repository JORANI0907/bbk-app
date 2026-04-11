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

const CATEGORY_LABELS: Record<string, string> = {
  supply: '소모품요청',
  inquiry: '업무문의',
  schedule: '일정조정',
  other: '기타',
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

export default function RequestsPage() {
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

  const pendingCount = requests.filter(r => r.status === 'pending').length
  const unreadCount = requests.filter(r => !r.requester_read).length

  return (
    <div className="flex flex-col h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">요청 관리</h1>
        <p className="text-sm text-gray-500 mt-1">직원들의 요청을 확인하고 처리합니다.</p>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: '전체', value: total, color: 'bg-gray-50 text-gray-700' },
          { label: '대기중', value: pendingCount, color: 'bg-amber-50 text-amber-700' },
          { label: '미읽음', value: unreadCount, color: 'bg-blue-50 text-blue-700' },
        ].map(card => (
          <div key={card.label} className={`rounded-xl p-3 ${card.color} border border-opacity-20`}>
            <p className="text-xs font-medium opacity-70">{card.label}</p>
            <p className="text-2xl font-bold mt-0.5">{card.value}</p>
          </div>
        ))}
      </div>

      {/* 상태 필터 */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 w-fit">
        {(['all', 'pending', 'approved', 'rejected'] as StatusFilter[]).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {s === 'all' ? '전체' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">불러오는 중...</div>
        ) : requests.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">요청이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">요청자</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">카테고리</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">내용</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-20">상태</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-28">날짜</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(req => (
                  <tr key={req.id}
                    onClick={() => { setSelected(req); setAdminMemo(req.admin_memo ?? '') }}
                    className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${!req.requester_read ? 'bg-blue-50/30' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{req.requester_name}</p>
                      <p className="text-xs text-gray-400">{req.requester_role === 'admin' ? '관리자' : '직원'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {CATEGORY_LABELS[req.category] ?? req.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs">
                      <p className="truncate">{req.content}</p>
                      {!req.requester_read && (
                        <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full ml-1">NEW</span>
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
                  {CATEGORY_LABELS[selected.category] ?? selected.category}
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
    </div>
  )
}
