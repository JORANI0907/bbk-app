'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'

// ─── 타입 ────────────────────────────────────────────────────────

type NoticeType = 'notice' | 'event'
type Priority = 'normal' | 'high' | 'urgent'
type Audience = 'all' | 'admin' | 'worker' | 'customer'
type TabFilter = 'all' | 'notice' | 'event'

interface Notice {
  id: string
  title: string
  content: string
  type: NoticeType
  priority: Priority
  pinned: boolean
  event_date: string | null
  target_audience: Audience
  popup: boolean
  image_url: string | null
  created_at: string
  updated_at: string | null
}

interface NoticeFormData {
  title: string
  content: string
  type: NoticeType
  priority: Priority
  pinned: boolean
  event_date: string
  target_audience: Audience
  popup: boolean
  image_url: string
}

const EMPTY_FORM: NoticeFormData = {
  title: '',
  content: '',
  type: 'notice',
  priority: 'normal',
  pinned: false,
  event_date: '',
  target_audience: 'all',
  popup: false,
  image_url: '',
}

// ─── 상수 ────────────────────────────────────────────────────────

const TYPE_LABELS: Record<NoticeType, string> = { notice: '공지', event: '이벤트' }
const TYPE_BADGE: Record<NoticeType, string> = {
  notice: 'bg-blue-100 text-blue-700',
  event: 'bg-purple-100 text-purple-700',
}
const PRIORITY_LABELS: Record<Priority, string> = { normal: '일반', high: '중요', urgent: '긴급' }
const PRIORITY_BADGE: Record<Priority, string> = {
  normal: 'bg-gray-100 text-gray-600',
  high: 'bg-yellow-100 text-yellow-700',
  urgent: 'bg-red-100 text-red-700',
}
const AUDIENCE_LABELS: Record<Audience, string> = {
  all: '전체', admin: '관리자', worker: '직원', customer: '고객',
}

// ─── 컴포넌트 ────────────────────────────────────────────────────

export default function NoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabFilter>('all')
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState<Notice | null>(null)
  const [form, setForm] = useState<NoticeFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const fetchNotices = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/notices')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '로드 실패'); return }
      setNotices(json.notices ?? [])
    } catch {
      toast.error('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchNotices() }, [fetchNotices])

  const openCreate = () => {
    setEditTarget(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  const openEdit = (n: Notice) => {
    setEditTarget(n)
    setForm({
      title: n.title,
      content: n.content,
      type: n.type,
      priority: n.priority,
      pinned: n.pinned,
      event_date: n.event_date ?? '',
      target_audience: n.target_audience ?? 'all',
      popup: n.popup ?? false,
      image_url: n.image_url ?? '',
    })
    setShowModal(true)
  }

  const handlePhotoUpload = async (file: File) => {
    setPhotoUploading(true)
    try {
      const fd = new FormData()
      fd.append('photo', file)
      const res = await fetch('/api/admin/notices/photo', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '업로드 실패'); return }
      setForm(prev => ({ ...prev, image_url: json.url }))
      toast.success('사진이 업로드되었습니다.')
    } catch {
      toast.error('사진 업로드 실패')
    } finally {
      setPhotoUploading(false)
    }
  }

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error('제목과 내용을 입력하세요.')
      return
    }
    setSaving(true)
    try {
      const body = {
        ...form,
        event_date: form.type === 'event' && form.event_date ? form.event_date : null,
        image_url: form.image_url.trim() || null,
        ...(editTarget ? { id: editTarget.id } : {}),
      }
      const method = editTarget ? 'PATCH' : 'POST'
      const res = await fetch('/api/admin/notices', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '저장 실패'); return }

      if (editTarget) {
        setNotices(prev => prev.map(n => n.id === editTarget.id ? json.notice : n))
        toast.success('수정되었습니다.')
      } else {
        setNotices(prev => [json.notice, ...prev])
        toast.success('등록되었습니다.')
      }
      setShowModal(false)
    } catch {
      toast.error('네트워크 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleteId(id)
    try {
      const res = await fetch(`/api/admin/notices?id=${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || '삭제 실패'); return }
      setNotices(prev => prev.filter(n => n.id !== id))
      toast.success('삭제되었습니다.')
    } catch {
      toast.error('네트워크 오류가 발생했습니다.')
    } finally {
      setDeleteId(null)
    }
  }

  const filtered = tab === 'all' ? notices : notices.filter(n => n.type === tab)

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  }

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h1 className="text-lg font-bold text-gray-900">공지·이벤트관리</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors"
        >
          <span className="text-base leading-none">+</span> 새 글
        </button>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 px-4 pb-3">
        {(['all', 'notice', 'event'] as TabFilter[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              tab === t ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t === 'all' ? '전체' : t === 'notice' ? '공지' : '이벤트'}
            <span className="ml-1 text-xs opacity-70">
              {t === 'all' ? notices.length : notices.filter(n => n.type === t).length}
            </span>
          </button>
        ))}
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">공지사항이 없습니다.</div>
        ) : (
          filtered.map(notice => (
            <div
              key={notice.id}
              className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
            >
              <div className="flex items-start gap-3 p-4">
                <div className="flex-1 min-w-0">
                  {/* 뱃지 행 */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                    {notice.pinned && (
                      <span className="text-xs font-bold text-brand-600">📌</span>
                    )}
                    {notice.image_url && (
                      <button
                        onClick={() => setLightboxUrl(notice.image_url)}
                        className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-full hover:bg-gray-100 transition-colors"
                      >
                        📷 사진
                      </button>
                    )}
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_BADGE[notice.type]}`}>
                      {TYPE_LABELS[notice.type]}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PRIORITY_BADGE[notice.priority]}`}>
                      {PRIORITY_LABELS[notice.priority]}
                    </span>
                    <span className="text-xs text-gray-400 px-2 py-0.5 rounded-full bg-gray-50">
                      {AUDIENCE_LABELS[notice.target_audience ?? 'all']}
                    </span>
                    {notice.popup && (
                      <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full font-medium">팝업</span>
                    )}
                  </div>
                  {/* 제목 */}
                  <p className="text-sm font-semibold text-gray-900 truncate">{notice.title}</p>
                  {/* 내용 미리보기 */}
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notice.content}</p>
                  {/* 날짜 */}
                  <p className="text-xs text-gray-400 mt-1.5">
                    {notice.type === 'event' && notice.event_date
                      ? `이벤트일: ${notice.event_date} · `
                      : ''}
                    {formatDate(notice.created_at)}
                  </p>
                </div>
                {/* 액션 버튼 */}
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(notice)}
                    className="px-3 py-1 text-xs font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => handleDelete(notice.id)}
                    disabled={deleteId === notice.id}
                    className="px-3 py-1 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {deleteId === notice.id ? '...' : '삭제'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 사진 라이트박스 */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="공지 사진"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl leading-none font-light"
          >
            ✕
          </button>
        </div>
      )}

      {/* 작성/수정 모달 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">
                {editTarget ? '공지 수정' : '새 공지 작성'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none p-1"
              >
                ✕
              </button>
            </div>

            {/* 폼 */}
            <div className="p-5 space-y-4">
              {/* 타입 + 중요도 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">타입</label>
                  <select
                    value={form.type}
                    onChange={e => setForm(prev => ({ ...prev, type: e.target.value as NoticeType }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="notice">공지</option>
                    <option value="event">이벤트</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">중요도</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm(prev => ({ ...prev, priority: e.target.value as Priority }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="normal">일반</option>
                    <option value="high">중요</option>
                    <option value="urgent">긴급</option>
                  </select>
                </div>
              </div>

              {/* 대상 + 이벤트 날짜 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">대상</label>
                  <select
                    value={form.target_audience}
                    onChange={e => setForm(prev => ({ ...prev, target_audience: e.target.value as Audience }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="all">전체</option>
                    <option value="admin">관리자</option>
                    <option value="worker">직원</option>
                    <option value="customer">고객</option>
                  </select>
                </div>
                {form.type === 'event' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">이벤트 날짜</label>
                    <input
                      type="date"
                      value={form.event_date}
                      onChange={e => setForm(prev => ({ ...prev, event_date: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                )}
              </div>

              {/* 제목 */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">제목 *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="공지 제목을 입력하세요"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* 내용 */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">내용 *</label>
                <textarea
                  value={form.content}
                  onChange={e => setForm(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="내용을 입력하세요"
                  rows={5}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>

              {/* 사진 업로드 */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">사진 (선택)</label>
                {form.image_url && (
                  <div className="mb-2 relative">
                    <img src={form.image_url} alt="미리보기" className="w-full max-h-32 object-cover rounded-lg" />
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, image_url: '' }))}
                      className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-black/70"
                    >
                      ✕
                    </button>
                  </div>
                )}
                <label className={`flex items-center justify-center gap-2 w-full border-2 border-dashed border-gray-200 rounded-xl py-3 cursor-pointer text-sm text-gray-500 hover:bg-gray-50 transition-colors ${photoUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) handlePhotoUpload(file)
                      e.target.value = ''
                    }}
                  />
                  {photoUploading ? '업로드 중...' : '📷 사진 선택'}
                </label>
              </div>

              {/* 토글 옵션 */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.pinned}
                    onChange={e => setForm(prev => ({ ...prev, pinned: e.target.checked }))}
                    className="w-4 h-4 rounded accent-brand-600"
                  />
                  <span className="text-sm text-gray-700">상단 고정</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.popup}
                    onChange={e => setForm(prev => ({ ...prev, popup: e.target.checked }))}
                    className="w-4 h-4 rounded accent-brand-600"
                  />
                  <span className="text-sm text-gray-700">팝업 표시</span>
                </label>
              </div>
            </div>

            {/* 모달 하단 버튼 */}
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-50"
              >
                {saving ? '저장 중...' : editTarget ? '수정 완료' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
