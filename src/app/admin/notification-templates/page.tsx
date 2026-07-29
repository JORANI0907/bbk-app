'use client'

/**
 * Phase 25: 알림메세지관리 페이지
 * - 탭: 1회성케어 · 정기딥케어 · 정기엔드케어 · 이번달일정
 * - 좌측 템플릿 리스트 → 우측 편집 패널 (제목·본문·변수 팔레트·미리보기·byte 카운터)
 * - SMS/LMS 자동 판별
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { AlertCircle, Mail, Plus, Save, Trash2, Type } from 'lucide-react'
import { AVAILABLE_VARIABLES, variablesByCategoryForTab, VariableCategory, TemplateTab } from '@/lib/notification-variables'
import { renderTemplate, SAMPLE_CONTEXT } from '@/lib/notification-renderer'
import { countSmsBytes, classifyMessage, estimatedSmsCost, messageTypeLabel, SMS_MAX_BYTES, LMS_MAX_BYTES } from '@/lib/sms-byte-counter'

interface Template {
  id: string
  code: string
  scope: 'customer' | 'application'
  applicable_types: string[]
  applicable_locations: string[]
  category: string | null
  title: string
  subject: string | null
  body: string
  is_active: boolean
  is_system: boolean
  auto_used: boolean
  trigger_desc: string | null
  updated_at: string
}

type TabKey = TemplateTab

// Phase 27-AO: 이번달일정 탭을 정기딥/정기엔드로 분리. 총 5개 관리 컨텍스트.
// 각 dropdown 실제 조회는 (types × locations) AND 조합이므로 두 유형이 각자 다른 리스트를 갖게 됨.
const TABS: Array<{ key: TabKey; label: string; filter: (t: Template) => boolean }> = [
  { key: '1회성케어',    label: '1회성케어',         filter: t => t.applicable_types.includes('1회성케어')    && t.applicable_locations.includes('customer_detail') },
  { key: '정기딥케어',   label: '정기딥케어',        filter: t => t.applicable_types.includes('정기딥케어')   && t.applicable_locations.includes('customer_detail') },
  { key: '정기엔드케어', label: '정기엔드케어',      filter: t => t.applicable_types.includes('정기엔드케어') && t.applicable_locations.includes('customer_detail') },
  { key: 'monthly_schedule_deep', label: '이번달일정 (정기딥)',   filter: t => t.applicable_types.includes('정기딥케어')   && t.applicable_locations.includes('monthly_schedule') },
  { key: 'monthly_schedule_end',  label: '이번달일정 (정기엔드)', filter: t => t.applicable_types.includes('정기엔드케어') && t.applicable_locations.includes('monthly_schedule') },
]

const CATEGORY_COLORS: Record<string, string> = {
  '예약': 'bg-brand-100 text-brand-700',
  '결제': 'bg-emerald-100 text-emerald-700',
  '작업': 'bg-blue-100 text-blue-700',
  'A/S': 'bg-violet-100 text-violet-700',
  '계정': 'bg-amber-100 text-amber-700',
}

// Phase 27-S: 발송 대상 케어 유형. 신설 시 이 배열에만 추가하면 자동으로 관리 탭 체크박스 노출.
const CARE_TYPES = ['1회성케어', '정기딥케어', '정기엔드케어'] as const

// Phase 27-S 5-b: template code 별 트리거 방식 분류
// - auto:      cron/webhook 이 auto_used 조회해 자동 발송 → 자동 토글 노출
// - semi_auto: 관리자가 상세 화면에서 [알림발송] 클릭 시 발송 → 토글 대신 "클릭 발송" 뱃지
// - unwired:   아직 트리거 자체가 없음 → 토글 대신 "미배선" 뱃지
const AUTO_TRIGGER_CODES = new Set([
  '예약당일알림', '예약1일전알림',
  '결제알림', '결제알림(현금)', '결제알림(카드,플렛폼)',
  '예약확정알림', '신청서작성완료알림',
  '예약금 입금완료 알림', '결제완료알림', '결제완료알림(잔금)',
  '계정안내알림',
])
const SEMI_AUTO_CODES = new Set([
  '작업완료알림',
  '작업완료알림(현금)', '작업완료알림(카드,플렛폼)', '작업완료알림(정기엔드케어)',
  'A/S방문알림', '계산서발행완료알림',
  '방문견적알림', '예약취소알림', '예약금환급완료알림',
])
type TriggerKind = 'auto' | 'semi_auto' | 'unwired'
function classifyTrigger(code: string): TriggerKind {
  if (AUTO_TRIGGER_CODES.has(code)) return 'auto'
  if (SEMI_AUTO_CODES.has(code)) return 'semi_auto'
  return 'unwired'
}

export default function NotificationTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('1회성케어')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)

  // 편집 buffer
  const [buffer, setBuffer] = useState<Partial<Template>>({})
  const [saving, setSaving] = useState(false)
  // Phase 27-S 5-c: 자동 template 잠금 해제 상태 (세션 로컬, 새로고침 시 리셋)
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set())
  // Phase 25-b: 신규 템플릿 추가 모달
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ code: '', title: '', category: '' })
  const [adding, setAdding] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/notification-templates')
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? '조회 실패')
      setTemplates(j.templates ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '조회 실패')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const tab = TABS.find(t => t.key === activeTab)
    return tab ? templates.filter(tab.filter) : []
  }, [templates, activeTab])

  const selected = templates.find(t => t.id === selectedId) ?? null
  const merged: Partial<Template> = { ...selected, ...buffer }

  useEffect(() => {
    // 탭 변경 시 첫 번째 템플릿 자동 선택
    if (filtered.length > 0 && !filtered.find(t => t.id === selectedId)) {
      setSelectedId(filtered[0].id)
      setBuffer({})
    }
  }, [filtered, selectedId])

  const dirty = Object.keys(buffer).length > 0

  const handleSave = async () => {
    if (!selected) return
    if (!dirty) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/notification-templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, ...buffer }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? '저장 실패')
      setTemplates(prev => prev.map(t => t.id === selected.id ? j.template : t))
      setBuffer({})
      toast.success('저장 완료')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  // Phase 27-S: 자동 발송 토글 — 즉시 PATCH (optimistic UI, 실패 시 롤백)
  const handleToggleAutoUsed = async (templateId: string, next: boolean) => {
    // 1) UI 즉시 반영
    setTemplates(prev => prev.map(t => t.id === templateId ? { ...t, auto_used: next } : t))
    try {
      const res = await fetch('/api/admin/notification-templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: templateId, auto_used: next }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? '자동 발송 설정 변경 실패')
      setTemplates(prev => prev.map(t => t.id === templateId ? j.template : t))
      toast.success(next ? '⚡ 자동 발송 켜짐' : '자동 발송 꺼짐')
    } catch (e) {
      // 실패 시 롤백
      setTemplates(prev => prev.map(t => t.id === templateId ? { ...t, auto_used: !next } : t))
      toast.error(e instanceof Error ? e.message : '설정 변경 실패')
    }
  }

  const handleDelete = async () => {
    if (!selected || selected.is_system) return
    if (!confirm(`"${selected.title}" 템플릿을 삭제하시겠습니까?`)) return
    try {
      const res = await fetch(`/api/admin/notification-templates?id=${selected.id}`, { method: 'DELETE' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? '삭제 실패')
      setTemplates(prev => prev.filter(t => t.id !== selected.id))
      setSelectedId(null)
      setBuffer({})
      toast.success('삭제 완료')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  const handleAdd = async () => {
    if (!addForm.code.trim() || !addForm.title.trim()) {
      toast.error('코드·라벨은 필수입니다.')
      return
    }
    if (templates.some(t => t.code === addForm.code.trim())) {
      toast.error('이미 존재하는 코드입니다.')
      return
    }
    setAdding(true)
    try {
      // Phase 27-AO: 이번달일정 신규 생성 시 활성 탭이 정기딥이면 정기딥만, 정기엔드면 정기엔드만 태그.
      // 이전엔 두 유형 다 태그해서 dropdown 리스트가 뒤섞였음.
      const tabCtx: Record<TabKey, { scope: 'customer' | 'application'; types: string[]; locations: string[] }> = {
        '1회성케어':    { scope: 'application', types: ['1회성케어'],   locations: ['customer_detail'] },
        '정기딥케어':   { scope: 'customer',    types: ['정기딥케어'],  locations: ['customer_detail'] },
        '정기엔드케어': { scope: 'customer',    types: ['정기엔드케어'], locations: ['customer_detail'] },
        'monthly_schedule_deep': { scope: 'application', types: ['정기딥케어'],   locations: ['monthly_schedule'] },
        'monthly_schedule_end':  { scope: 'application', types: ['정기엔드케어'], locations: ['monthly_schedule'] },
      }
      const ctx = tabCtx[activeTab]
      const res = await fetch('/api/admin/notification-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: addForm.code.trim(),
          scope: ctx.scope,
          applicable_types: ctx.types,
          applicable_locations: ctx.locations,
          category: addForm.category.trim() || null,
          title: addForm.title.trim(),
          body: '[범빌드코리아]\n{{업체명}} 고객님, ',
          is_active: true,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? '생성 실패')
      setTemplates(prev => [...prev, j.template])
      setSelectedId(j.template.id)
      setBuffer({})
      setAddOpen(false)
      setAddForm({ code: '', title: '', category: '' })
      toast.success('신규 템플릿 생성 완료 — 본문을 편집하세요')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '생성 실패')
    } finally {
      setAdding(false)
    }
  }

  const insertVariable = (label: string) => {
    const textarea = bodyRef.current
    if (!textarea) return
    const value = merged.body ?? ''
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const insertion = `{{${label}}}`
    const next = value.slice(0, start) + insertion + value.slice(end)
    setBuffer(prev => ({ ...prev, body: next }))
    // 커서 위치 복원
    setTimeout(() => {
      textarea.focus()
      const pos = start + insertion.length
      textarea.setSelectionRange(pos, pos)
    }, 0)
  }

  const bodyText = merged.body ?? ''
  const bytes = countSmsBytes(bodyText)
  const msgType = classifyMessage(bodyText)
  const cost = estimatedSmsCost(bodyText)
  const rendered = renderTemplate(bodyText, SAMPLE_CONTEXT)
  const maxBytes = msgType === 'SMS' ? SMS_MAX_BYTES : LMS_MAX_BYTES
  const progressPct = Math.min(100, Math.round((bytes / maxBytes) * 100))
  const showLmsSubject = msgType === 'LMS'

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-text-primary">문자알림 관리</h1>
          <p className="text-xs text-text-secondary mt-1">
            고객에게 발송되는 SMS/LMS 문구를 관리합니다. 90byte 초과 시 자동으로 LMS로 발송됩니다.
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 shadow-sm"
        >
          <Plus size={14} /> 새 알림 추가
        </button>
      </div>

      {/* Phase 25c: 전역 안내 배너 */}
      <div className="mb-4 bg-brand-50 border border-brand-200 rounded-lg p-3 text-xs text-brand-900 leading-relaxed">
        <p><b>💡 안내</b></p>
        <ul className="mt-1 space-y-0.5 list-disc list-inside">
          <li><b>⚡ 자동</b> 배지가 있는 템플릿은 자동 발송 로직에서 사용됩니다 (예약 1일전·당일·정기결제 등). 본문 편집만 가능하며 삭제·비활성 불가.</li>
          <li>변수({'{{업체명}}'}, {'{{시공일자}}'} 등)를 삭제하면 실제 발송 시 <b>빈 값</b>으로 나갑니다. 반드시 미리보기 확인 후 저장하세요.</li>
          <li>모든 편집은 <b>즉시 실 발송에 반영</b>됩니다. 카톡 알림톡은 SMS 발송 실패 시에만 fallback으로 나갑니다.</li>
        </ul>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-border mb-4 overflow-x-auto">
        {TABS.map(t => {
          const count = templates.filter(t.filter).length
          const active = activeTab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                active ? 'border-brand-600 text-brand-700' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {t.label} <span className="text-xs text-text-tertiary">({count})</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <p className="text-center py-16 text-text-tertiary">불러오는 중...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
          {/* 좌측 리스트 */}
          <div className="border border-border rounded-xl overflow-hidden bg-surface">
            <div className="max-h-[calc(100vh-260px)] overflow-y-auto divide-y divide-border-subtle">
              {filtered.length === 0 ? (
                <p className="text-xs text-text-tertiary text-center py-8">템플릿 없음</p>
              ) : filtered.map(t => {
                const active = selectedId === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => { setSelectedId(t.id); setBuffer({}) }}
                    className={`w-full text-left px-3 py-2.5 transition-colors ${
                      active ? 'bg-brand-50 border-l-4 border-brand-600' : 'hover:bg-surface-sunken border-l-4 border-transparent'
                    } ${!t.is_active ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                          {t.category && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[t.category] ?? 'bg-surface-sunken text-text-secondary'}`}>
                              {t.category}
                            </span>
                          )}
                          {t.is_system && <span className="text-[10px] text-text-tertiary">기본</span>}
                          {t.auto_used && (
                            <span
                              className="text-[10px] px-1 py-0 rounded font-semibold bg-amber-100 text-amber-700 leading-tight"
                              title={t.trigger_desc ?? '자동 발송용 템플릿'}
                            >
                              ⚡자동
                            </span>
                          )}
                          {!t.is_active && <span className="text-[10px] text-state-danger">비활성</span>}
                        </div>
                        <p className="text-sm font-semibold text-text-primary">{t.title}</p>
                        <p className="text-[11px] text-text-tertiary truncate mt-0.5">{t.code}</p>
                      </div>
                      {/* Phase 27-S 5-d: 모든 template 통일 — 자동 토글 항상 노출 */}
                      <label
                        onClick={e => e.stopPropagation()}
                        className="shrink-0 cursor-pointer mt-1"
                        title={t.auto_used ? '자동 발송 끄기' : '자동 발송 켜기'}
                      >
                        <input
                          type="checkbox"
                          checked={t.auto_used}
                          onChange={e => handleToggleAutoUsed(t.id, e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="relative w-8 h-4 bg-gray-300 rounded-full peer-checked:bg-amber-500 transition-colors">
                          <div className="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-transform peer-checked:translate-x-4" />
                        </div>
                      </label>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 우측 편집 패널 */}
          {selected ? (
            <div className="border border-border rounded-xl bg-surface p-4 md:p-5 space-y-4">
              {/* 헤더: 제목·상태·삭제 */}
              <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-border-subtle">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-xs text-text-tertiary">{selected.code}</p>
                    {selected.auto_used && (
                      <span
                        className="text-[10px] px-1 py-0 rounded font-semibold bg-amber-100 text-amber-700 leading-tight"
                        title={selected.trigger_desc ?? '자동 발송용 템플릿'}
                      >
                        ⚡자동
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={merged.title ?? ''}
                    onChange={e => setBuffer(prev => ({ ...prev, title: e.target.value }))}
                    className="text-lg font-bold text-text-primary bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-brand-500 rounded px-1 w-full"
                  />
                </div>
                <div className="flex items-center gap-2">
                  {/* Phase 27-S 5-d: 모든 template 통일 — 자물쇠 + 자동 토글 + 활성 3종 세트.
                      발송 방식(자동/반자동/미배선) 은 아래 안내 카드 trigger_desc 에서 안내. */}
                  {(() => {
                    // 자물쇠 잠금: auto_used=true 이면 활성·자동 토글 둘 다 잠금 (실수 방지)
                    const locked = selected.auto_used && !unlockedIds.has(selected.id)
                    return (
                      <>
                        {/* 자물쇠 (auto_used=true 인 경우에만 노출) */}
                        {selected.auto_used && (
                          <button
                            type="button"
                            onClick={() => {
                              setUnlockedIds(prev => {
                                const next = new Set(prev)
                                if (next.has(selected.id)) next.delete(selected.id)
                                else next.add(selected.id)
                                return next
                              })
                            }}
                            title={locked ? '잠금 해제하고 활성·자동 스위치 편집' : '다시 잠금'}
                            className={`text-sm w-6 h-6 flex items-center justify-center rounded transition-colors ${
                              locked ? 'text-amber-600 hover:bg-amber-100' : 'text-brand-600 hover:bg-brand-50'
                            }`}
                          >
                            {locked ? '🔒' : '🔓'}
                          </button>
                        )}
                        {/* 자동 토글 */}
                        <label
                          className={`flex items-center gap-1.5 text-xs ${locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          title={locked ? '🔒 잠금 상태' : (selected.auto_used ? '자동 발송 끄기' : '자동 발송 켜기')}
                        >
                          <input
                            type="checkbox"
                            checked={selected.auto_used ?? false}
                            disabled={locked}
                            onChange={e => handleToggleAutoUsed(selected.id, e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="relative w-9 h-5 bg-gray-300 rounded-full peer-checked:bg-amber-500 transition-colors">
                            <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform peer-checked:translate-x-4" />
                          </div>
                          <span className={selected.auto_used ? 'font-semibold text-amber-700' : 'text-text-secondary'}>
                            {selected.auto_used ? '⚡자동' : '자동'}
                          </span>
                        </label>
                      </>
                    )
                  })()}
                  {(() => {
                    // Phase 27-S 5-d: 활성 체크박스 (자물쇠는 위쪽 자동 토글 옆에 이미 있음, 잠금 상태 공유)
                    const locked = selected.auto_used && !unlockedIds.has(selected.id)
                    return (
                      <label className={`flex items-center gap-1.5 text-xs ${locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          checked={merged.is_active ?? true}
                          disabled={locked}
                          onChange={e => setBuffer(prev => ({ ...prev, is_active: e.target.checked }))}
                          className="accent-brand-600"
                        />
                        활성
                      </label>
                    )
                  })()}
                  {!selected.is_system && !selected.auto_used && (
                    <button
                      onClick={handleDelete}
                      className="text-xs text-state-danger px-2 py-1 rounded hover:bg-state-danger-bg flex items-center gap-1"
                    >
                      <Trash2 size={12} /> 삭제
                    </button>
                  )}
                </div>
              </div>

              {/* Phase 27-S: 자동 발송 안내 카드 — auto_used 상관없이 항상 표시.
                  꺼진 상태에서도 관리자가 "켜면 언제 발송되는지" 미리 알 수 있도록. */}
              <div className={`rounded-lg p-3 border-2 ${
                selected.auto_used
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-start gap-2">
                  <span className="text-xl">{selected.auto_used ? '⚡' : '⏰'}</span>
                  <div className="flex-1 text-xs leading-relaxed">
                    <p className={`font-bold mb-1 ${selected.auto_used ? 'text-amber-900' : 'text-text-primary'}`}>
                      {selected.auto_used ? '자동 발송 중' : '자동 발송 시점·조건'}
                    </p>
                    <p className={selected.auto_used ? 'text-amber-800' : 'text-text-secondary'}>
                      {selected.auto_used
                        ? <>이 템플릿은 아래 조건에서 <b>자동으로 발송</b>됩니다. 본문·제목만 수정 가능하며 <b>비활성·삭제는 잠겨있습니다</b>.</>
                        : <>상단 <b>⚡자동</b> 토글을 켜면 아래 조건에서 자동 발송됩니다. 켜기 전 조건을 확인하세요.</>}
                    </p>
                    {/* Phase 27-S: 발송 시점·조건은 시스템 코드에 하드코딩됨 (편집 불가).
                        관리자는 "언제 자동 발송되는지" 참고용으로만 확인.
                        문구 변경이 필요하면 개발자에게 요청. */}
                    <div className={`mt-2 rounded px-3 py-2 border text-xs font-medium ${
                      selected.auto_used
                        ? 'bg-white border-amber-200 text-amber-900'
                        : 'bg-white border-border text-text-primary'
                    }`}>
                      <span className="text-[10px] font-semibold text-text-tertiary mr-1.5">🔒 시스템 고정 :</span>
                      {selected.trigger_desc ?? <span className="text-text-tertiary">(발송 조건 미설정)</span>}
                    </div>
                    {selected.auto_used && (
                      <p className="mt-1.5 text-[11px] text-amber-700">
                        💡 변수({'{{업체명}}'} 등)를 삭제하면 실제 발송 시 빈 값으로 나갑니다. 신중히 편집하세요.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Phase 27-AO: 노출 컨텍스트 5개 체크박스 —
                  한 템플릿이 어느 유형·화면 dropdown에 뜰지 관리자가 직접 관리.
                  저장 시 applicable_types + applicable_locations 배열이 union으로 계산됨. */}
              {(() => {
                const locked = selected.auto_used && !unlockedIds.has(selected.id)
                const currentTypes: string[] = merged.applicable_types ?? []
                const currentLocations: string[] = merged.applicable_locations ?? []
                const CONTEXTS = [
                  { key: 'oneshot',      label: '① 1회성 세부화면',      type: '1회성케어',    location: 'customer_detail' },
                  { key: 'deep_master',  label: '② 정기딥 세부화면',     type: '정기딥케어',   location: 'customer_detail' },
                  { key: 'end_master',   label: '③ 정기엔드 세부화면',   type: '정기엔드케어', location: 'customer_detail' },
                  { key: 'deep_monthly', label: '④ 이번달일정 (정기딥)',   type: '정기딥케어',   location: 'monthly_schedule' },
                  { key: 'end_monthly',  label: '⑤ 이번달일정 (정기엔드)', type: '정기엔드케어', location: 'monthly_schedule' },
                ] as const

                const isChecked = (ctx: (typeof CONTEXTS)[number]) =>
                  currentTypes.includes(ctx.type) && currentLocations.includes(ctx.location)

                const toggle = (target: (typeof CONTEXTS)[number], nextChecked: boolean) => {
                  // 다른 컨텍스트의 현재 체크 상태 유지 + 이 컨텍스트만 반전 → union 재계산.
                  // types/locations 카티션 곱 특성상 원치 않은 조합이 열릴 수 있으나
                  // 실제 dropdown 렌더 지점(1회성·정기딥·정기엔드 세부화면 3곳, 이번달일정 2탭)이 정해져 있어
                  // 통상 관리 시나리오에서 유출은 무의미. 그래도 발생하면 스키마 확장을 검토.
                  const nextStates = CONTEXTS.map(c => ({
                    ctx: c,
                    checked: c.key === target.key ? nextChecked : isChecked(c),
                  })).filter(s => s.checked)
                  const types = Array.from(new Set(nextStates.map(s => s.ctx.type)))
                  const locations = Array.from(new Set(nextStates.map(s => s.ctx.location)))
                  setBuffer(prev => ({ ...prev, applicable_types: types, applicable_locations: locations }))
                }

                return (
                  <div className={`rounded-lg p-3 border ${locked ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-brand-50/40 border-brand-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-text-primary">📍 노출 위치 (이 알림이 뜨는 dropdown)</p>
                      {locked && <span className="text-[10px] text-text-tertiary">🔒 잠금 상태 — 자물쇠 해제 후 편집</span>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {CONTEXTS.map(ctx => {
                        const checked = isChecked(ctx)
                        return (
                          <label
                            key={ctx.key}
                            className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded border transition-colors ${
                              locked
                                ? 'cursor-not-allowed bg-white border-border'
                                : checked
                                  ? 'cursor-pointer bg-brand-50 border-brand-300 text-brand-900 font-medium'
                                  : 'cursor-pointer bg-white border-border hover:bg-brand-50/50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={locked}
                              onChange={e => toggle(ctx, e.target.checked)}
                              className="accent-brand-600"
                            />
                            <span>{ctx.label}</span>
                          </label>
                        )
                      })}
                    </div>
                    <p className="text-[11px] text-text-tertiary mt-2">
                      💡 여러 위치 동시 선택 가능. 체크된 dropdown에만 이 템플릿이 나타납니다.
                    </p>
                  </div>
                )
              })()}

              {/* LMS 제목 (byte 초과 시만) */}
              {showLmsSubject && (
                <div>
                  <label className="text-xs font-medium text-text-secondary mb-1 flex items-center gap-1">
                    <Mail size={11} /> 제목 <span className="text-text-tertiary">(LMS 발송 시)</span>
                  </label>
                  <input
                    type="text"
                    value={merged.subject ?? ''}
                    onChange={e => setBuffer(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="예: 예약 확정 안내"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              )}

              {/* 본문 */}
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1 flex items-center gap-1">
                  <Type size={11} /> 본문
                </label>
                <textarea
                  ref={bodyRef}
                  value={bodyText}
                  onChange={e => setBuffer(prev => ({ ...prev, body: e.target.value }))}
                  rows={8}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
                  placeholder="본문을 입력하세요. 팔레트의 변수를 클릭하면 커서 위치에 삽입됩니다."
                />

                {/* Byte 카운터 */}
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span className={`font-mono font-semibold ${msgType === 'OVER' ? 'text-state-danger' : msgType === 'LMS' ? 'text-orange-600' : 'text-emerald-600'}`}>
                        {bytes} bytes
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        msgType === 'OVER' ? 'bg-red-100 text-red-700'
                          : msgType === 'LMS' ? 'bg-orange-100 text-orange-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {messageTypeLabel(msgType)}
                      </span>
                      {msgType !== 'OVER' && (
                        <span className="text-text-tertiary">약 {cost}원</span>
                      )}
                    </span>
                    <span className="text-text-tertiary font-mono">{bytes} / {maxBytes}</span>
                  </div>
                  <div className="h-1.5 bg-surface-sunken rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        msgType === 'OVER' ? 'bg-red-500' : msgType === 'LMS' ? 'bg-orange-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  {msgType === 'LMS' && (
                    <p className="text-[11px] text-orange-700 flex items-center gap-1">
                      <AlertCircle size={11} /> 90byte 초과로 LMS로 자동 승격 (SMS 대비 약 2.5배 요금)
                    </p>
                  )}
                  {msgType === 'OVER' && (
                    <p className="text-[11px] text-state-danger flex items-center gap-1">
                      <AlertCircle size={11} /> 2000byte 초과 — 발송할 수 없습니다
                    </p>
                  )}
                </div>
              </div>

              {/* 변수 팔레트 — 활성 탭(1회성케어/정기딥케어/정기엔드케어/이번달일정)에 사용 가능한 필드만 자동 필터 */}
              <div className="border border-border-subtle rounded-lg p-3 bg-surface-sunken/40">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                  <p className="text-xs font-semibold text-text-secondary">📌 변수 삽입 (클릭하면 커서 위치에 삽입됨)</p>
                  <span className="text-[10px] text-text-tertiary bg-white border border-border-subtle rounded px-1.5 py-0.5">
                    {TABS.find(t => t.key === activeTab)?.label} 필드
                  </span>
                </div>
                <div className="space-y-2">
                  {(Object.entries(variablesByCategoryForTab(activeTab)) as Array<[VariableCategory, typeof AVAILABLE_VARIABLES]>)
                    .filter(([, vars]) => vars.length > 0)
                    .map(([cat, vars]) => (
                      <div key={cat} className="flex items-start gap-2">
                        <span className="text-[11px] text-text-tertiary w-14 shrink-0 pt-1">{cat}</span>
                        <div className="flex flex-wrap gap-1">
                          {vars.map(v => (
                            <button
                              key={v.label}
                              onClick={() => insertVariable(v.label)}
                              title={v.desc}
                              className="text-[11px] px-2 py-0.5 rounded-md border border-brand-200 bg-white text-brand-700 hover:bg-brand-50 font-medium transition-colors"
                            >
                              + {v.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* 미리보기 */}
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1 flex items-center gap-1">
                  <Mail size={11} /> 미리보기 <span className="text-text-tertiary">(샘플 데이터)</span>
                </p>
                <div className="border border-brand-200 rounded-lg p-3 bg-brand-50/40 whitespace-pre-wrap text-sm leading-relaxed break-keep">
                  {rendered || <span className="text-text-tertiary">본문을 입력하면 여기에 미리보기가 나타납니다</span>}
                </div>
              </div>

              {/* 저장 */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border-subtle">
                {dirty && <span className="text-xs text-orange-600">저장되지 않은 변경사항</span>}
                <button
                  onClick={handleSave}
                  disabled={!dirty || saving || msgType === 'OVER'}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Save size={14} /> {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          ) : (
            <div className="border border-border rounded-xl bg-surface p-8 text-center text-text-tertiary">
              <Plus size={24} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">좌측에서 편집할 템플릿을 선택하세요</p>
            </div>
          )}
        </div>
      )}

      {/* Phase 25-b: 신규 템플릿 추가 모달 */}
      {addOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !adding && setAddOpen(false)}>
          <div className="bg-surface rounded-2xl max-w-md w-full p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div>
              <h2 className="text-lg font-bold text-text-primary">새 알림 추가</h2>
              <p className="text-xs text-text-tertiary mt-0.5">현재 탭 &quot;{TABS.find(t => t.key === activeTab)?.label}&quot;에 자동 배정됩니다.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">코드 (영문/한글, 고유)</label>
              <input
                type="text"
                value={addForm.code}
                onChange={e => setAddForm(f => ({ ...f, code: e.target.value }))}
                placeholder="예: 특별할인알림"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-[11px] text-text-tertiary mt-1">자동화 라우트와 매칭되는 식별자. 나중에 변경 가능</p>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">라벨 (관리자용 표시명)</label>
              <input
                type="text"
                value={addForm.title}
                onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))}
                placeholder="예: 특별 할인 안내"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">카테고리 (선택)</label>
              <select
                value={addForm.category}
                onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">(선택 안함)</option>
                <option value="예약">예약</option>
                <option value="결제">결제</option>
                <option value="작업">작업</option>
                <option value="A/S">A/S</option>
                <option value="계정">계정</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
              <button
                onClick={() => setAddOpen(false)}
                disabled={adding}
                className="px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-sunken rounded-lg"
              >
                취소
              </button>
              <button
                onClick={handleAdd}
                disabled={adding || !addForm.code.trim() || !addForm.title.trim()}
                className="px-4 py-1.5 text-sm bg-brand-600 text-white rounded-lg font-semibold hover:bg-brand-700 disabled:opacity-40"
              >
                {adding ? '생성 중...' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
