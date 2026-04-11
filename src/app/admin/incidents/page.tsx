'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'

interface IncidentReport {
  id: string
  author_id: string
  author_name: string
  type: string
  incident_date: string
  location: string
  description: string
  action_taken: string
  status: 'pending' | 'reviewed'
  admin_comment: string | null
  created_at: string
  updated_at: string
}

const TYPE_OPTIONS = [
  { value: 'accident', label: '사고' },
  { value: 'complaint', label: '고객클레임' },
  { value: 'damage', label: '기물파손' },
  { value: 'other', label: '기타' },
]

const TYPE_LABELS: Record<string, string> = {
  accident: '사고',
  complaint: '고객클레임',
  damage: '기물파손',
  other: '기타',
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  reviewed: 'bg-green-100 text-green-700',
}

const STATUS_LABELS: Record<string, string> = {
  pending: '미처리',
  reviewed: '처리완료',
}

const EMPTY_FORM = { type: 'accident', incident_date: '', location: '', description: '', action_taken: '' }

export default function IncidentsPage() {
  const [tab, setTab] = useState<'all' | 'pending' | 'reviewed'>('all')
  const [reports, setReports] = useState<IncidentReport[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [userRole, setUserRole] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [selected, setSelected] = useState<IncidentReport | null>(null)
  const [adminComment, setAdminComment] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/me').then(r => r.json()).then(j => setUserRole(j.role ?? '')).catch(() => {})
  }, [])

  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (tab !== 'all') params.set('status', tab)
      const res = await fetch(`/api/admin/incidents?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '로드 실패'); return }
      setReports(json.data ?? [])
      setTotal(json.total ?? 0)
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { fetchReports() }, [fetchReports])

  const handleSubmit = async () => {
    if (!form.incident_date || !form.description) {
      toast.error('날짜와 경위 내용을 입력하세요.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '제출 실패'); return }
      toast.success('경위서가 제출되었습니다.')
      setShowForm(false)
      setForm(EMPTY_FORM)
      fetchReports()
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setSubmitting(false)
    }
  }

  const handleComment = async () => {
    if (!selected) return
    setCommentSaving(true)
    try {
      const res = await fetch('/api/admin/incidents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, status: 'reviewed', admin_comment: adminComment }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '저장 실패'); return }
      toast.success('처리 완료로 변경되었습니다.')
      setSelected(null)
      fetchReports()
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setCommentSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full relative">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">경위서</h1>
        <p className="text-sm text-gray-500 mt-1">사고, 클레임 등 현장 경위를 기록합니다.</p>
      </div>

      {/* 탭 (admin만 전체/미처리/처리완료 탭) */}
      {userRole === 'admin' && (
        <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
          {(['all', 'pending', 'reviewed'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t === 'all' ? `전체 (${total})` : t === 'pending' ? '미처리' : '처리완료'}
            </button>
          ))}
        </div>
      )}

      {/* 목록 */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400 text-sm">불러오는 중...</div>
      ) : reports.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-gray-400 text-sm">경위서가 없습니다.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {reports.map(rep => (
            <button key={rep.id} onClick={() => { setSelected(rep); setAdminComment(rep.admin_comment ?? '') }}
              className="text-left bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {TYPE_LABELS[rep.type] ?? rep.type}
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[rep.status]}`}>
                  {STATUS_LABELS[rep.status]}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-900 mb-1">{rep.incident_date} · {rep.location || '장소 미기재'}</p>
              <p className="text-xs text-gray-500 line-clamp-2">{rep.description}</p>
              <p className="text-xs text-gray-400 mt-2">{rep.author_name} · {new Date(rep.created_at).toLocaleDateString('ko-KR')}</p>
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
              <h2 className="text-base font-bold text-gray-900">경위서 작성</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">유형</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">발생 일자</label>
                <input type="date" value={form.incident_date}
                  onChange={e => setForm(f => ({ ...f, incident_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">장소</label>
                <input type="text" value={form.location} placeholder="발생 장소"
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">경위 내용 <span className="text-red-500">*</span></label>
                <textarea rows={4} value={form.description} placeholder="사건 경위를 상세히 기술하세요"
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">조치 사항</label>
                <textarea rows={3} value={form.action_taken} placeholder="취한 조치 내용"
                  onChange={e => setForm(f => ({ ...f, action_taken: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">취소</button>
              <button onClick={handleSubmit} disabled={submitting}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {submitting ? '제출 중...' : '제출'}
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
                <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {TYPE_LABELS[selected.type] ?? selected.type}
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[selected.status]}`}>
                  {STATUS_LABELS[selected.status]}
                </span>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">발생 일자</p>
                  <p className="text-gray-800 font-medium">{selected.incident_date}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">장소</p>
                  <p className="text-gray-800 font-medium">{selected.location || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">작성자</p>
                  <p className="text-gray-800 font-medium">{selected.author_name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">작성일</p>
                  <p className="text-gray-800 font-medium">{new Date(selected.created_at).toLocaleDateString('ko-KR')}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">경위 내용</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{selected.description}</p>
              </div>
              {selected.action_taken && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">조치 사항</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{selected.action_taken}</p>
                </div>
              )}
              {userRole === 'admin' && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">관리자 댓글</p>
                  <textarea rows={3} value={adminComment}
                    onChange={e => setAdminComment(e.target.value)}
                    placeholder="처리 내용, 피드백 등을 입력하세요"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
              )}
              {userRole !== 'admin' && selected.admin_comment && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">관리자 댓글</p>
                  <p className="text-sm text-gray-800 bg-blue-50 rounded-lg p-3">{selected.admin_comment}</p>
                </div>
              )}
            </div>
            {userRole === 'admin' && selected.status === 'pending' && (
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
                <button onClick={handleComment} disabled={commentSaving}
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {commentSaving ? '저장 중...' : '처리 완료로 변경'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
