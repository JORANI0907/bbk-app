'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'

interface MyRequest {
  id: string
  category: string
  content: string
  status: 'pending' | 'approved' | 'rejected'
  admin_memo: string | null
  requester_read: boolean
  created_at: string
  updated_at: string
}

const CATEGORY_OPTIONS = [
  { value: 'supply', label: '소모품요청' },
  { value: 'inquiry', label: '업무문의' },
  { value: 'schedule', label: '일정조정' },
  { value: 'other', label: '기타' },
]

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

const EMPTY_FORM = { category: 'supply', content: '' }

export default function MyRequestsPage() {
  const [requests, setRequests] = useState<MyRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [selected, setSelected] = useState<MyRequest | null>(null)

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/requests?limit=50')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '로드 실패'); return }
      setRequests(json.data ?? [])
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRequests() }, [fetchRequests])
  useEffect(() => { fetch('/api/admin/nav-badges?key=worker_requests', { method: 'DELETE' }).catch(() => {}) }, [])

  const markRead = useCallback(async (id: string) => {
    try {
      await fetch('/api/admin/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'mark_read' }),
      })
    } catch {
      // 읽음 처리 실패는 무시
    }
  }, [])

  const handleOpen = (req: MyRequest) => {
    setSelected(req)
    if (!req.requester_read && req.admin_memo) {
      markRead(req.id)
      setRequests(prev => prev.map(r => r.id === req.id ? { ...r, requester_read: true } : r))
    }
  }

  const handleSubmit = async () => {
    if (!form.content.trim()) { toast.error('내용을 입력하세요.'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '제출 실패'); return }
      toast.success('요청이 제출되었습니다.')
      setShowForm(false)
      setForm(EMPTY_FORM)
      fetchRequests()
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setSubmitting(false)
    }
  }

  const newReplyCount = requests.filter(r => !r.requester_read && r.admin_memo).length

  return (
    <div className="flex flex-col h-full relative">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">내 요청</h1>
        <p className="text-sm text-gray-500 mt-1">관리자에게 요청을 보내고 답변을 확인합니다.</p>
        {newReplyCount > 0 && (
          <p className="text-xs text-blue-600 font-medium mt-1">새 답변 {newReplyCount}건이 있습니다.</p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400 text-sm">불러오는 중...</div>
      ) : requests.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-gray-400 text-sm">요청 내역이 없습니다.</div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <button key={req.id} onClick={() => handleOpen(req)}
              className={`w-full text-left bg-white rounded-xl border shadow-sm p-4 hover:shadow-md transition-shadow ${!req.requester_read && req.admin_memo ? 'border-red-300 bg-red-50/30' : 'border-gray-100'}`}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5">
                  {!req.requester_read && req.admin_memo && (
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                  )}
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {CATEGORY_LABELS[req.category] ?? req.category}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {!req.requester_read && req.admin_memo && (
                    <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full">NEW</span>
                  )}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[req.status]}`}>
                    {STATUS_LABELS[req.status]}
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-800 line-clamp-2 mt-1">{req.content}</p>
              {req.admin_memo && (
                <p className="text-xs text-blue-600 mt-1.5 line-clamp-1">답변: {req.admin_memo}</p>
              )}
              <p className="text-xs text-gray-400 mt-1.5">{new Date(req.created_at).toLocaleDateString('ko-KR')}</p>
            </button>
          ))}
        </div>
      )}

      {/* FAB */}
      <button onClick={() => setShowForm(true)}
        className="fixed bottom-8 right-8 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 flex items-center justify-center text-2xl transition-colors z-20">
        +
      </button>

      {/* 작성 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-30 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">새 요청</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">카테고리</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">내용 <span className="text-red-500">*</span></label>
                <textarea rows={5} value={form.content} placeholder="요청 내용을 상세히 작성해주세요"
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">취소</button>
              <button onClick={handleSubmit} disabled={submitting}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {submitting ? '제출 중...' : '요청하기'}
              </button>
            </div>
          </div>
        </div>
      )}

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
            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs text-gray-400 mb-1">요청 내용</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{selected.content}</p>
              </div>
              {selected.admin_memo ? (
                <div>
                  <p className="text-xs text-gray-400 mb-1">관리자 답변</p>
                  <p className="text-sm text-blue-800 bg-blue-50 rounded-lg p-3">{selected.admin_memo}</p>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-2">아직 답변이 없습니다.</p>
              )}
              <p className="text-xs text-gray-400 text-right">{new Date(selected.created_at).toLocaleDateString('ko-KR')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
