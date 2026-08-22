'use client'

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Search, Copy, Pencil, Trash2, Plus, Users, X, Star, Eye, Settings, ArrowRight } from 'lucide-react'

interface Snippet {
  id: string
  category: string
  title: string
  body: string
  worker_visible: boolean
  usage_count: number
  last_used_at: string | null
  is_favorite: boolean
  created_at: string
  updated_at: string
}

interface Me {
  userId: string
  role: 'admin' | 'worker' | string
  name: string
}

// 카테고리 기본 후보 (자유 확장 가능 — API 는 자유 텍스트로 저장)
const DEFAULT_CATEGORIES = ['예약', '결제', '작업', '클레임', 'A/S', '기타']

function relTime(ts: string | null): string {
  if (!ts) return '-'
  const diff = Date.now() - new Date(ts).getTime()
  const day = 86_400_000
  if (diff < day) return '오늘'
  if (diff < 2 * day) return '어제'
  const d = Math.floor(diff / day)
  if (d < 30) return `${d}일 전`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}달 전`
  return `${Math.floor(mo / 12)}년 전`
}

export function MessageSnippetsView() {
  const [me, setMe] = useState<Me | null>(null)
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Snippet | null>(null)
  const [preview, setPreview] = useState<Snippet | null>(null)

  // form state
  const [formCategory, setFormCategory] = useState('기타')
  const [formNewCategory, setFormNewCategory] = useState('')  // '__new__' 모드일 때
  const [formTitle, setFormTitle] = useState('')
  const [formBody, setFormBody] = useState('')
  const [formWorkerVisible, setFormWorkerVisible] = useState(false)
  const [saving, setSaving] = useState(false)

  // 카테고리 관리 모달
  const [showCategoryMgr, setShowCategoryMgr] = useState(false)

  const isAdmin = me?.role === 'admin'

  // me 조회 (역할 확인)
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => setMe(d.user ?? null))
      .catch(() => setMe(null))
  }, [])

  // 목록 조회
  const reload = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (category !== 'all') params.set('category', category)
    if (search.trim()) params.set('search', search.trim())
    fetch(`/api/admin/message-snippets?${params}`)
      .then(r => r.json())
      .then(d => setSnippets(d.snippets ?? []))
      .catch(() => setSnippets([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, search])

  // 등록/수정 모달 열기
  const openNew = () => {
    setEditing(null)
    setFormCategory('기타')
    setFormNewCategory('')
    setFormTitle('')
    setFormBody('')
    setFormWorkerVisible(false)
    setShowForm(true)
  }
  const openEdit = (s: Snippet) => {
    setEditing(s)
    setFormCategory(s.category)
    setFormNewCategory('')
    setFormTitle(s.title)
    setFormBody(s.body)
    setFormWorkerVisible(s.worker_visible)
    setShowForm(true)
  }

  const handleSave = async () => {
    // '__new__' 모드면 텍스트 입력값 사용, 아니면 select 값
    const categoryFinal = formCategory === '__new__'
      ? formNewCategory.trim()
      : formCategory
    if (formCategory === '__new__' && !categoryFinal) {
      toast.error('새 카테고리 이름을 입력하세요.')
      return
    }
    if (!formTitle.trim()) { toast.error('제목을 입력하세요.'); return }
    if (!formBody.trim()) { toast.error('본문을 입력하세요.'); return }
    setSaving(true)
    try {
      const url = editing
        ? `/api/admin/message-snippets/${editing.id}`
        : '/api/admin/message-snippets'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: categoryFinal,
          title: formTitle,
          body: formBody,
          worker_visible: formWorkerVisible,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '저장 실패')
      toast.success(editing ? '수정 완료' : '등록 완료')
      setShowForm(false)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally { setSaving(false) }
  }

  // 카테고리 병합/삭제 (delete = 기타로 병합)
  const handleCategoryMerge = async (from: string, to: string) => {
    const label = to === '기타' ? `"${from}" 카테고리를 삭제하시겠습니까?\n\n이 카테고리의 모든 문구가 "기타" 로 이동됩니다.` : `"${from}" 을(를) "${to}" 로 이름 변경/병합하시겠습니까?`
    if (!confirm(label)) return
    try {
      const res = await fetch('/api/admin/message-snippets/rename-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '실패')
      toast.success(`${data.updated}건 이동됨`)
      if (category === from) setCategory('all')
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '실패')
    }
  }

  const handleDelete = async (s: Snippet) => {
    if (!confirm(`"${s.title}" 을(를) 삭제하시겠습니까?\n삭제 후 복구는 관리자에게 요청해야 합니다.`)) return
    const res = await fetch(`/api/admin/message-snippets/${s.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('삭제 실패'); return }
    toast.success('삭제됨')
    reload()
  }

  const handleToggleFavorite = async (s: Snippet) => {
    // 낙관적 업데이트 (즉시 UI 반영, 실패 시 롤백)
    const next = !s.is_favorite
    setSnippets(prev => prev.map(x => x.id === s.id ? { ...x, is_favorite: next } : x))
    try {
      const method = next ? 'POST' : 'DELETE'
      const res = await fetch(`/api/admin/message-snippets/${s.id}/favorite`, { method })
      if (!res.ok) throw new Error()
    } catch {
      setSnippets(prev => prev.map(x => x.id === s.id ? { ...x, is_favorite: s.is_favorite } : x))
      toast.error('즐겨찾기 저장 실패')
    }
  }

  const handleCopy = async (s: Snippet) => {
    try {
      await navigator.clipboard.writeText(s.body)
      toast.success('클립보드에 복사됨')
      // 통계 갱신 (실패해도 UX 영향 없음)
      fetch(`/api/admin/message-snippets/${s.id}/copy`, { method: 'POST' })
        .then(r => r.json())
        .then(d => {
          if (d.usage_count) {
            setSnippets(prev => prev.map(x =>
              x.id === s.id
                ? { ...x, usage_count: d.usage_count, last_used_at: new Date().toISOString() }
                : x,
            ))
          }
        })
        .catch(() => {})
    } catch {
      toast.error('복사 실패 — 브라우저 권한을 확인하세요.')
    }
  }

  // 카테고리 옵션 (기본 + DB 에 있는 것 합집합)
  const categoryOptions = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES)
    snippets.forEach(s => set.add(s.category))
    return Array.from(set).sort()
  }, [snippets])

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">문자 단축어</h1>
          <p className="text-sm text-text-secondary mt-1">
            {isAdmin
              ? '자주 쓰는 문구를 등록해 복사·붙여넣기로 재사용하세요. "직원 공유" 체크한 문구는 직원 포털에도 노출됩니다.'
              : '관리자가 공유한 문구만 표시됩니다. 복사해서 사용하세요.'}
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCategoryMgr(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-border hover:border-brand-400 text-text-secondary text-sm font-semibold rounded-lg transition-colors"
              title="카테고리 이름 변경·삭제"
            >
              <Settings size={14} /> 카테고리 관리
            </button>
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Plus size={16} /> 새 문구
            </button>
          </div>
        )}
      </div>

      {!isAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
          👥 이 페이지는 관리자가 <b>직원 공유</b> 로 지정한 문구만 표시됩니다.
        </div>
      )}

      {/* 검색바 */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="제목·본문 검색"
          className="w-full pl-10 pr-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-surface"
        />
      </div>

      {/* 카테고리 탭 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setCategory('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            category === 'all'
              ? 'bg-brand-600 text-white border-brand-600'
              : 'bg-surface text-text-secondary border-border hover:border-brand-400'
          }`}
        >
          전체
        </button>
        {categoryOptions.map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              category === c
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-surface text-text-secondary border-border hover:border-brand-400'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* 리스트 */}
      {loading ? (
        <div className="text-center py-12 text-sm text-text-tertiary">불러오는 중...</div>
      ) : snippets.length === 0 ? (
        <div className="text-center py-12 text-sm text-text-tertiary">
          {search || category !== 'all'
            ? '조건에 맞는 문구가 없습니다.'
            : isAdmin ? '아직 등록된 문구가 없습니다. [새 문구] 로 첫 문구를 만들어보세요.' : '공유된 문구가 아직 없습니다.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {snippets.map(s => (
            <div
              key={s.id}
              className={`bg-surface border rounded-2xl p-4 shadow-soft hover:shadow-card transition-shadow ${
                s.is_favorite ? 'border-amber-300 bg-amber-50/30' : 'border-border'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100">
                    {s.category}
                  </span>
                  {s.worker_visible && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                      <Users size={10} /> 직원 공유
                    </span>
                  )}
                  {s.usage_count > 0 && (
                    <span className="text-[11px] text-text-tertiary">
                      {s.usage_count}회 · {relTime(s.last_used_at)}
                    </span>
                  )}
                </div>
                {/* Phase 2: 즐겨찾기 별표 (admin/worker 모두 가능) */}
                <button
                  onClick={() => handleToggleFavorite(s)}
                  className="p-1 text-text-tertiary hover:text-amber-500 transition-colors shrink-0"
                  title={s.is_favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                >
                  <Star
                    size={16}
                    className={s.is_favorite ? 'fill-amber-400 text-amber-500' : ''}
                  />
                </button>
              </div>
              {/* 카드 본문 클릭 시 미리보기 모달 (긴 문구 판별용) */}
              <button
                onClick={() => setPreview(s)}
                className="w-full text-left group"
              >
                <p className="text-sm font-semibold text-text-primary mb-1.5 break-keep group-hover:text-brand-700 transition-colors">
                  {s.title}
                </p>
                <p className="text-xs text-text-secondary whitespace-pre-wrap break-keep line-clamp-4 mb-3">
                  {s.body}
                </p>
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleCopy(s)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  <Copy size={13} /> 복사
                </button>
                <button
                  onClick={() => setPreview(s)}
                  className="p-2 border border-border rounded-lg text-text-secondary hover:bg-gray-50 transition-colors"
                  title="전체 보기"
                >
                  <Eye size={13} />
                </button>
                {isAdmin && (
                  <>
                    <button
                      onClick={() => openEdit(s)}
                      className="p-2 border border-border rounded-lg text-text-secondary hover:bg-gray-50 transition-colors"
                      title="수정"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(s)}
                      className="p-2 border border-border rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                      title="삭제"
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 카테고리 관리 모달 (admin only) — 이름 변경·삭제.
          삭제 = 해당 카테고리의 모든 문구를 '기타' 로 병합 (안전). */}
      {showCategoryMgr && isAdmin && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setShowCategoryMgr(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] flex flex-col shadow-pop"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold text-text-primary">카테고리 관리</h2>
              <button
                onClick={() => setShowCategoryMgr(false)}
                className="p-1 text-text-tertiary hover:text-text-primary"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <p className="text-xs text-text-secondary leading-relaxed break-keep">
                신규 카테고리 추가는 [새 문구] 등록 모달에서 &quot;+ 새 카테고리 추가&quot; 로 만드세요.
                삭제하면 해당 카테고리 문구가 모두 &quot;기타&quot; 로 이동합니다.
              </p>
              {categoryOptions.length === 0 ? (
                <p className="text-sm text-text-tertiary text-center py-4">카테고리가 없습니다.</p>
              ) : (
                <ul className="space-y-1.5">
                  {categoryOptions.map(cat => {
                    const count = snippets.filter(s => s.category === cat).length
                    return (
                      <li key={cat} className="flex items-center justify-between gap-2 px-3 py-2 border border-border rounded-lg bg-surface">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-sm font-semibold text-text-primary truncate">{cat}</span>
                          <span className="text-[11px] text-text-tertiary shrink-0">{count}건</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => {
                              const newName = prompt(`"${cat}" 을(를) 어떤 이름으로 바꿀까요?`, cat)
                              if (newName && newName.trim() && newName.trim() !== cat) {
                                handleCategoryMerge(cat, newName.trim())
                              }
                            }}
                            className="p-1.5 text-text-secondary hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"
                            title="이름 변경 (같은 이름 입력 시 병합)"
                          >
                            <Pencil size={13} />
                          </button>
                          {cat !== '기타' && (
                            <button
                              onClick={() => handleCategoryMerge(cat, '기타')}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors inline-flex items-center gap-1"
                              title="삭제 (기타 로 병합)"
                            >
                              <ArrowRight size={12} />
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Phase 2: 미리보기 모달 — 긴 문구 전체 확인 + 복사 */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] flex flex-col shadow-pop"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100">
                  {preview.category}
                </span>
                {preview.worker_visible && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                    <Users size={10} /> 직원 공유
                  </span>
                )}
                <span className="text-sm font-bold text-text-primary">{preview.title}</span>
              </div>
              <button
                onClick={() => setPreview(null)}
                className="p-1 text-text-tertiary hover:text-text-primary shrink-0"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <p className="text-sm text-text-primary whitespace-pre-wrap break-keep leading-relaxed">
                {preview.body}
              </p>
            </div>
            <div className="p-4 border-t border-border">
              <button
                onClick={() => { handleCopy(preview); setPreview(null) }}
                className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Copy size={14} /> 복사
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 등록/수정 모달 */}
      {showForm && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-pop">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text-primary">
                {editing ? '문구 수정' : '새 문구 등록'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-1 text-text-tertiary hover:text-text-primary"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-secondary">카테고리</label>
              {formCategory === '__new__' ? (
                <div className="flex gap-1.5">
                  <input
                    value={formNewCategory}
                    onChange={e => setFormNewCategory(e.target.value)}
                    autoFocus
                    className="flex-1 px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="새 카테고리 이름"
                  />
                  <button
                    type="button"
                    onClick={() => { setFormCategory(categoryOptions[0] ?? '기타'); setFormNewCategory('') }}
                    className="px-3 py-2 border border-border rounded-lg text-xs text-text-secondary hover:bg-gray-50"
                  >
                    취소
                  </button>
                </div>
              ) : (
                <select
                  value={formCategory}
                  onChange={e => {
                    if (e.target.value === '__new__') setFormNewCategory('')
                    setFormCategory(e.target.value)
                  }}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-surface"
                >
                  {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__new__">+ 새 카테고리 추가</option>
                </select>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-secondary">제목</label>
              <input
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="예: 예약 확정 안내"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-secondary">본문</label>
              <textarea
                value={formBody}
                onChange={e => setFormBody(e.target.value)}
                rows={7}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none font-mono"
                placeholder="복사해서 붙여넣을 문구 전체"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <input
                type="checkbox"
                checked={formWorkerVisible}
                onChange={e => setFormWorkerVisible(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <Users size={14} className="text-emerald-700" />
              <span className="text-sm font-semibold text-emerald-800">직원 포털에도 공유</span>
              <span className="text-xs text-emerald-700">— 체크 시 직원도 조회·복사 가능</span>
            </label>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 border border-border rounded-lg text-sm font-semibold text-text-secondary hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {saving ? '저장 중...' : editing ? '수정' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
