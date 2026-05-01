'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'

interface MyRequest {
  id: string
  category: string
  content: string
  status: 'pending' | 'approved' | 'rejected'
  admin_memo: string | null
  requester_read: boolean
  created_at: string
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
  pending: 'bg-state-warning-bg text-state-warning',
  approved: 'bg-state-success-bg text-state-success',
  rejected: 'bg-state-danger-bg text-state-danger',
}

const STATUS_LABELS: Record<string, string> = {
  pending: '대기중',
  approved: '승인',
  rejected: '거절',
}

const EMPTY_FORM = { category: 'supply', content: '' }

export default function WorkerRequestsPage() {
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
    <div className="px-4 py-5 pb-24 relative">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-text-primary">요청하기</h1>
        <p className="text-sm text-text-secondary mt-0.5">관리자에게 요청을 보내고 답변을 확인합니다.</p>
        {newReplyCount > 0 && (
          <p className="text-xs text-brand-600 font-medium mt-1">새 답변 {newReplyCount}건이 있습니다.</p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-text-tertiary text-sm">불러오는 중...</div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-2">
          <p className="text-text-tertiary text-sm">요청 내역이 없습니다.</p>
          <button onClick={() => setShowForm(true)}
            className="text-sm text-brand-600 font-medium hover:underline">
            첫 요청 보내기
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <button key={req.id} onClick={() => handleOpen(req)}
              className={`w-full text-left rounded-2xl border shadow-soft p-4 hover:shadow-card transition-shadow ${!req.requester_read && req.admin_memo ? 'bg-brand-50 border-brand-200' : 'bg-surface border-border-subtle'}`}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-xs bg-surface-sunken text-text-secondary px-2 py-0.5 rounded-full">
                  {CATEGORY_LABELS[req.category] ?? req.category}
                </span>
                <div className="flex items-center gap-1.5">
                  {!req.requester_read && req.admin_memo && (
                    <span className="text-[10px] bg-brand-500 text-white px-1.5 py-0.5 rounded-full font-medium">NEW</span>
                  )}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[req.status]}`}>
                    {STATUS_LABELS[req.status]}
                  </span>
                </div>
              </div>
              <p className="text-sm text-text-primary line-clamp-2 mt-1">{req.content}</p>
              {req.admin_memo && (
                <p className="text-xs text-brand-600 mt-1.5 line-clamp-1">답변: {req.admin_memo}</p>
              )}
              <p className="text-xs text-text-tertiary mt-2">{new Date(req.created_at).toLocaleDateString('ko-KR')}</p>
            </button>
          ))}
        </div>
      )}

      {/* FAB */}
      <button onClick={() => setShowForm(true)}
        className="fixed bottom-20 right-5 w-14 h-14 bg-brand-600 text-white rounded-full shadow-pop hover:bg-brand-700 flex items-center justify-center text-2xl transition-colors z-20">
        +
      </button>

      {/* 작성 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-30">
          <div className="bg-surface rounded-t-3xl w-full max-w-lg shadow-modal safe-area-pb">
            <div className="w-12 h-1 bg-border rounded-full mx-auto mt-3 mb-4" />
            <div className="flex items-center justify-between px-5 pb-3 border-b border-border-subtle">
              <h2 className="text-base font-bold text-text-primary">새 요청</h2>
              <button onClick={() => setShowForm(false)} className="text-text-tertiary hover:text-text-secondary text-xl">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">카테고리</label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORY_OPTIONS.map(o => (
                    <button key={o.value} onClick={() => setForm(f => ({ ...f, category: o.value }))}
                      className={`py-2.5 text-sm font-medium rounded-xl border transition-colors ${form.category === o.value ? 'bg-brand-600 text-white border-brand-600' : 'bg-surface text-text-secondary border-border hover:border-brand-300'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">내용</label>
                <textarea rows={5} value={form.content} placeholder="요청 내용을 상세히 작성해주세요"
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                isLoading={submitting}
                variant="primary"
                className="w-full py-3 text-sm font-semibold rounded-xl"
              >
                {submitting ? '제출 중...' : '요청 보내기'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 상세 모달 */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-30">
          <div className="bg-surface rounded-t-3xl w-full max-w-lg shadow-modal safe-area-pb">
            <div className="w-12 h-1 bg-border rounded-full mx-auto mt-3 mb-4" />
            <div className="flex items-center justify-between px-5 pb-3 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <span className="text-xs bg-surface-sunken text-text-secondary px-2 py-0.5 rounded-full">
                  {CATEGORY_LABELS[selected.category] ?? selected.category}
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[selected.status]}`}>
                  {STATUS_LABELS[selected.status]}
                </span>
              </div>
              <button onClick={() => setSelected(null)} className="text-text-tertiary hover:text-text-secondary text-xl">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs text-text-tertiary mb-1.5">요청 내용</p>
                <p className="text-sm text-text-primary whitespace-pre-wrap bg-surface-sunken rounded-xl p-3">{selected.content}</p>
              </div>
              {selected.admin_memo ? (
                <div>
                  <p className="text-xs text-text-tertiary mb-1.5">관리자 답변</p>
                  <p className="text-sm text-brand-700 bg-brand-50 rounded-xl p-3">{selected.admin_memo}</p>
                </div>
              ) : (
                <p className="text-sm text-text-tertiary text-center py-3">아직 답변이 없습니다.</p>
              )}
              <p className="text-xs text-text-tertiary text-right">{new Date(selected.created_at).toLocaleDateString('ko-KR')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
