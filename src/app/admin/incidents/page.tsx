'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'

// ─── 타입 ────────────────────────────────────────────────────────────────────

interface IncidentReport {
  id: string
  author_id: string
  author_name: string
  type: string
  incident_date: string
  location: string | null
  description: string
  action_taken: string | null
  status: 'pending' | 'reviewed' | 'closed'
  admin_comment: string | null
  created_at: string
  updated_at: string
}

interface SessionUser {
  userId: string
  name: string
  role: string
}

type StatusFilter = 'all' | 'pending' | 'reviewed' | 'closed'

// ─── 상수 ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  'pending' | 'reviewed' | 'closed',
  { label: string; badge: string; option: string }
> = {
  pending:  { label: '검토중',   badge: 'bg-yellow-100 text-yellow-800', option: '검토중으로 변경' },
  reviewed: { label: '확인완료', badge: 'bg-blue-100 text-blue-800',     option: '확인완료로 변경' },
  closed:   { label: '처리완료', badge: 'bg-gray-100 text-gray-600',     option: '처리완료로 변경' },
}

const TYPE_CONFIG: Record<string, string> = {
  delay:     '지각/결근',
  damage:    '물품손상',
  accident:  '사고',
  complaint: '고객불만',
  other:     '기타',
}

const TYPE_OPTIONS = Object.entries(TYPE_CONFIG).map(([value, label]) => ({ value, label }))

const STATUS_FILTER_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all',      label: '전체' },
  { value: 'pending',  label: '검토중' },
  { value: 'reviewed', label: '확인완료' },
  { value: 'closed',   label: '처리완료' },
]

const EMPTY_FORM = {
  type: 'accident',
  incident_date: '',
  location: '',
  description: '',
  action_taken: '',
}

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

// ─── 서브 컴포넌트: 상태 뱃지 ─────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'pending' | 'reviewed' | 'closed' }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.badge}`}>
      {cfg.label}
    </span>
  )
}

// ─── 서브 컴포넌트: 경위서 카드 ───────────────────────────────────────────────

interface IncidentCardProps {
  report: IncidentReport
  isSelected: boolean
  isNewItem: boolean
  onClick: () => void
}

function IncidentCard({ report, isSelected, isNewItem, onClick }: IncidentCardProps) {
  return (
    <button
      onClick={onClick}
      className={`text-left w-full bg-white rounded-2xl border shadow-sm p-4 hover:shadow-md transition-all ${
        isSelected ? 'border-blue-500 ring-2 ring-blue-200' : isNewItem ? 'border-red-200' : 'border-gray-100'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          {isNewItem && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
          <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
            {TYPE_CONFIG[report.type] ?? report.type}
          </span>
        </div>
        <StatusBadge status={report.status} />
      </div>
      <p className="text-sm font-medium text-gray-900 mb-1 truncate">
        {report.incident_date} · {report.location || '장소 미기재'}
      </p>
      <p className="text-xs text-gray-500 line-clamp-2">{report.description}</p>
      <p className="text-xs text-gray-400 mt-2">
        {report.author_name} · {formatDate(report.created_at)}
      </p>
    </button>
  )
}

// ─── 서브 컴포넌트: 작성 모달 ─────────────────────────────────────────────────

interface WriteModalProps {
  form: typeof EMPTY_FORM
  submitting: boolean
  onChange: (updates: Partial<typeof EMPTY_FORM>) => void
  onSubmit: () => void
  onClose: () => void
}

function WriteModal({ form, submitting, onChange, onSubmit, onClose }: WriteModalProps) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-30 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">경위서 작성</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">유형</label>
            <select
              value={form.type}
              onChange={e => onChange({ type: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              발생 일자 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.incident_date}
              onChange={e => onChange({ incident_date: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">발생 장소 / 현장명</label>
            <input
              type="text"
              value={form.location}
              placeholder="예: OO빌딩 3층"
              onChange={e => onChange({ location: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              경위 내용 <span className="text-red-500">*</span>
              <span className="text-gray-400 font-normal ml-1">(100자 이상 권장)</span>
            </label>
            <textarea
              rows={5}
              value={form.description}
              placeholder="사건 경위를 상세히 기술하세요"
              onChange={e => onChange({ description: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <p className={`text-xs mt-1 ${form.description.length < 100 ? 'text-gray-400' : 'text-green-600'}`}>
              {form.description.length}자 입력됨
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">조치 사항</label>
            <textarea
              rows={3}
              value={form.action_taken}
              placeholder="취한 조치 내용을 입력하세요"
              onChange={e => onChange({ action_taken: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            취소
          </button>
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? '제출 중...' : '제출'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 서브 컴포넌트: 상세 패널 (관리자/직원 공용) ───────────────────────────────

interface DetailPanelProps {
  report: IncidentReport
  userRole: string
  adminComment: string
  adminStatus: 'pending' | 'reviewed' | 'closed'
  saving: boolean
  onCommentChange: (v: string) => void
  onStatusChange: (v: 'pending' | 'reviewed' | 'closed') => void
  onSave: () => void
  onClose: () => void
  inline?: boolean  // PC에서 우측 패널로 사용할 때 true
}

function DetailPanel({
  report,
  userRole,
  adminComment,
  adminStatus,
  saving,
  onCommentChange,
  onStatusChange,
  onSave,
  onClose,
  inline = false,
}: DetailPanelProps) {
  const containerClass = inline
    ? 'bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col h-full'
    : 'bg-white rounded-2xl w-full max-w-lg shadow-xl'

  const content = (
    <>
      {/* 헤더 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
            {TYPE_CONFIG[report.type] ?? report.type}
          </span>
          <StatusBadge status={report.status} />
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
      </div>

      {/* 본문 */}
      <div className="p-6 space-y-4 overflow-y-auto flex-1">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">발생 일자</p>
            <p className="text-gray-800 font-medium">{report.incident_date}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">장소</p>
            <p className="text-gray-800 font-medium">{report.location || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">작성자</p>
            <p className="text-gray-800 font-medium">{report.author_name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">작성일</p>
            <p className="text-gray-800 font-medium">{formatDate(report.created_at)}</p>
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-400 mb-1">경위 내용</p>
          <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 leading-relaxed">
            {report.description}
          </p>
        </div>

        {report.action_taken && (
          <div>
            <p className="text-xs text-gray-400 mb-1">조치 사항</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 leading-relaxed">
              {report.action_taken}
            </p>
          </div>
        )}

        {/* 관리자: 상태 변경 + 코멘트 */}
        {userRole === 'admin' && (
          <>
            <div>
              <p className="text-xs text-gray-400 mb-1">상태 변경</p>
              <select
                value={adminStatus}
                onChange={e => onStatusChange(e.target.value as 'pending' | 'reviewed' | 'closed')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {(Object.keys(STATUS_CONFIG) as Array<'pending' | 'reviewed' | 'closed'>).map(s => (
                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-1">관리자 코멘트</p>
              <textarea
                rows={3}
                value={adminComment}
                onChange={e => onCommentChange(e.target.value)}
                placeholder="처리 내용, 피드백 등을 입력하세요"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </>
        )}

        {/* 직원: 관리자 코멘트 읽기 전용 */}
        {userRole !== 'admin' && report.admin_comment && (
          <div>
            <p className="text-xs text-gray-400 mb-1">관리자 코멘트</p>
            <p className="text-sm text-gray-800 bg-blue-50 rounded-lg p-3 leading-relaxed">
              {report.admin_comment}
            </p>
          </div>
        )}
      </div>

      {/* 관리자 저장 버튼 */}
      {userRole === 'admin' && (
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end flex-shrink-0">
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      )}
    </>
  )

  if (inline) {
    return <div className={containerClass}>{content}</div>
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-30 p-4">
      <div className={containerClass}>{content}</div>
    </div>
  )
}

// ─── 메인 페이지 ───────────────────────────────────────────────────────────────

export default function IncidentsPage() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [reports, setReports] = useState<IncidentReport[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  // 작성 모달
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  // 상세 패널
  const [selected, setSelected] = useState<IncidentReport | null>(null)
  const [adminComment, setAdminComment] = useState('')
  const [adminStatus, setAdminStatus] = useState<'pending' | 'reviewed' | 'closed'>('pending')
  const [saving, setSaving] = useState(false)
  const [viewedIds, setViewedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem('viewed_incidents') ?? '[]')) } catch { return new Set() }
  })
  const addViewed = (id: string) => setViewedIds(prev => {
    const next = new Set(prev).add(id)
    try { sessionStorage.setItem('viewed_incidents', JSON.stringify(Array.from(next))) } catch { /* ignore */ }
    return next
  })

  // 세션 로드
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(j => setUser(j.user ?? null))
      .catch(() => {})
  }, [])

  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await fetch(`/api/admin/incidents?${params}`)
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? '로드 실패')
        return
      }
      setReports(json.data ?? [])
      setTotal(json.total ?? 0)
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])
  useEffect(() => { fetch('/api/admin/nav-badges?key=incidents', { method: 'DELETE' }).catch(() => {}) }, [])

  // 경위서 선택
  const handleSelect = useCallback((report: IncidentReport) => {
    setSelected(report)
    setAdminComment(report.admin_comment ?? '')
    setAdminStatus(report.status)
    addViewed(report.id)
  }, [addViewed])

  const handleCloseDetail = useCallback(() => {
    setSelected(null)
  }, [])

  // 경위서 작성 제출
  const handleSubmit = async () => {
    if (!form.incident_date || !form.description) {
      toast.error('발생 일자와 경위 내용을 입력하세요.')
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
      if (!res.ok) {
        toast.error(json.error ?? '제출 실패')
        return
      }
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

  // 관리자 저장 (상태 + 코멘트)
  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/incidents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selected.id,
          status: adminStatus,
          admin_comment: adminComment,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? '저장 실패')
        return
      }
      toast.success('저장되었습니다.')
      // 낙관적 로컬 업데이트
      setReports(prev =>
        prev.map(r =>
          r.id === selected.id
            ? { ...r, status: adminStatus, admin_comment: adminComment }
            : r
        )
      )
      setSelected(prev => prev ? { ...prev, status: adminStatus, admin_comment: adminComment } : null)
      fetchReports()
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setSaving(false)
    }
  }

  const handleFormChange = useCallback((updates: Partial<typeof EMPTY_FORM>) => {
    setForm(prev => ({ ...prev, ...updates }))
  }, [])

  const isAdmin = user?.role === 'admin'

  return (
    <div className="flex flex-col h-full relative">
      {/* 헤더 */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">경위서</h1>
        <p className="text-sm text-gray-500 mt-1">사고, 고객불만 등 현장 경위를 기록합니다.</p>
      </div>

      {/* 상태 필터 탭 (관리자만) */}
      {isAdmin && (
        <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit flex-shrink-0">
          {STATUS_FILTER_TABS.map(t => (
            <button
              key={t.value}
              onClick={() => setStatusFilter(t.value)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === t.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.value === 'all' ? `${t.label} (${total})` : t.label}
            </button>
          ))}
        </div>
      )}

      {/* PC: 2열 레이아웃 / 모바일: 1열 */}
      <div className={`flex gap-4 min-h-0 flex-1 ${selected ? 'md:grid md:grid-cols-2' : ''}`}>
        {/* 목록 */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
              불러오는 중...
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-sm gap-1">
              <span className="text-2xl">📋</span>
              <span>경위서가 없습니다.</span>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 pb-4">
              {reports.map(rep => (
                <IncidentCard
                  key={rep.id}
                  report={rep}
                  isSelected={selected?.id === rep.id}
                  isNewItem={rep.status === 'pending' && !viewedIds.has(rep.id)}
                  onClick={() => handleSelect(rep)}
                />
              ))}
            </div>
          )}
        </div>

        {/* PC 우측 상세 패널 */}
        {selected && (
          <div className="hidden md:flex flex-col min-h-0">
            <DetailPanel
              report={selected}
              userRole={user?.role ?? ''}
              adminComment={adminComment}
              adminStatus={adminStatus}
              saving={saving}
              onCommentChange={setAdminComment}
              onStatusChange={setAdminStatus}
              onSave={handleSave}
              onClose={handleCloseDetail}
              inline
            />
          </div>
        )}
      </div>

      {/* 모바일 상세 모달 */}
      {selected && (
        <div className="md:hidden">
          <DetailPanel
            report={selected}
            userRole={user?.role ?? ''}
            adminComment={adminComment}
            adminStatus={adminStatus}
            saving={saving}
            onCommentChange={setAdminComment}
            onStatusChange={setAdminStatus}
            onSave={handleSave}
            onClose={handleCloseDetail}
          />
        </div>
      )}

      {/* FAB: 직원만 표시 */}
      {!isAdmin && (
        <button
          onClick={() => setShowForm(true)}
          className="fixed bottom-20 right-4 md:bottom-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 flex items-center justify-center text-2xl transition-colors z-40"
          aria-label="경위서 작성"
        >
          +
        </button>
      )}

      {/* 작성 모달 */}
      {showForm && (
        <WriteModal
          form={form}
          submitting={submitting}
          onChange={handleFormChange}
          onSubmit={handleSubmit}
          onClose={() => {
            setShowForm(false)
            setForm(EMPTY_FORM)
          }}
        />
      )}
    </div>
  )
}
