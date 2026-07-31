'use client'

/**
 * Phase 28: 알림메세지관리 — send_mode 기반 3섹션 UI
 * - ⚡ 자동(auto): cron 자동 발송, 🔒 기본 잠금
 * - 🔶 반자동(semi_auto): 관리자 클릭 발송, 🔒 기본 잠금
 * - ⚪ 수동(manual): 미배선, 자유 편집
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { AlertCircle, Mail, Plus, Save, Trash2, Type } from 'lucide-react'
import { AVAILABLE_VARIABLES, variablesByCategoryForTab, VariableCategory, TemplateTab } from '@/lib/notification-variables'
import { renderTemplate, SAMPLE_CONTEXT } from '@/lib/notification-renderer'
import { countSmsBytes, classifyMessage, estimatedSmsCost, messageTypeLabel, SMS_MAX_BYTES, LMS_MAX_BYTES } from '@/lib/sms-byte-counter'

type SendMode = 'auto' | 'semi_auto' | 'manual'

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
  send_mode: SendMode
  is_locked: boolean
  trigger_desc: string | null
  updated_at: string
  linked_progress_status: string | null
  linked_payment_status: string | null
}

const LINKED_PROGRESS_OPTIONS = [
  '신청서작성', '예약확정', '예약1일전', '예약당일',
  '작업완료', '예약취소', 'A/S방문', '방문견적',
] as const
const LINKED_PAYMENT_OPTIONS = [
  { value: '예약금 입금',    label: '예약금 입금' },
  { value: '결제',           label: '결제' },
  { value: '결제완료',       label: '결제완료' },
  { value: '결제완료(잔금)', label: '결제완료(잔금)' },
  { value: '계산서발행완료', label: '계산서발행완료' },
  { value: '예약금환급완료', label: '예약금환급완료' },
  { value: '비과세',         label: '비과세 결제' },
  { value: '카드결제 완료',  label: '카드결제 완료' },
] as const

type TabKey = TemplateTab

const TABS: Array<{ key: TabKey; label: string; filter: (t: Template) => boolean }> = [
  { key: '1회성케어',    label: '1회성케어',               filter: t => t.applicable_types.includes('1회성케어')    && t.applicable_locations.includes('customer_detail') },
  { key: '정기딥케어',   label: '정기딥케어',              filter: t => t.applicable_types.includes('정기딥케어')   && t.applicable_locations.includes('customer_detail') },
  { key: '정기엔드케어', label: '정기엔드케어',            filter: t => t.applicable_types.includes('정기엔드케어') && t.applicable_locations.includes('customer_detail') },
  { key: 'monthly_schedule_deep', label: '이번달일정(딥)',  filter: t => t.applicable_types.includes('정기딥케어')   && t.applicable_locations.includes('monthly_schedule') },
  { key: 'monthly_schedule_end',  label: '이번달일정(엔드)',filter: t => t.applicable_types.includes('정기엔드케어') && t.applicable_locations.includes('monthly_schedule') },
]

const CATEGORY_COLORS: Record<string, string> = {
  '예약': 'bg-brand-100 text-brand-700',
  '결제': 'bg-emerald-100 text-emerald-700',
  '작업': 'bg-brand-100 text-brand-700',
  'A/S': 'bg-violet-100 text-violet-700',
  '계정': 'bg-amber-100 text-amber-700',
}

const MODE_META: Record<SendMode, { icon: string; label: string; badge: string; section: string; desc: string }> = {
  auto:      { icon: '⚡', label: '자동',   badge: 'bg-amber-100 text-amber-700',              section: 'text-amber-700 border-amber-200 bg-amber-50',   desc: 'cron이 자동으로 발송합니다. 본문·제목만 편집하세요.' },
  semi_auto: { icon: '🔶', label: '반자동', badge: 'bg-brand-100 text-brand-700',              section: 'text-brand-700 border-brand-200 bg-brand-50',   desc: '관리자가 화면에서 [알림발송] 클릭 시 발송됩니다.' },
  manual:    { icon: '⚪', label: '수동',   badge: 'bg-surface-sunken text-text-secondary',    section: 'text-text-secondary border-border bg-surface',   desc: '아직 발송 로직이 연결되지 않은 템플릿입니다.' },
}

export default function NotificationTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('1회성케어')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)

  const [buffer, setBuffer] = useState<Partial<Template>>({})
  const [saving, setSaving] = useState(false)
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set())
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

  const grouped = useMemo<Record<SendMode, Template[]>>(() => ({
    auto:      filtered.filter(t => (t.send_mode ?? 'manual') === 'auto'),
    semi_auto: filtered.filter(t => (t.send_mode ?? 'manual') === 'semi_auto'),
    manual:    filtered.filter(t => (t.send_mode ?? 'manual') === 'manual'),
  }), [filtered])

  const selected = templates.find(t => t.id === selectedId) ?? null
  const merged: Partial<Template> = { ...selected, ...buffer }

  useEffect(() => {
    if (filtered.length > 0 && !filtered.find(t => t.id === selectedId)) {
      setSelectedId(filtered[0].id)
      setBuffer({})
    }
  }, [filtered, selectedId])

  const dirty = Object.keys(buffer).length > 0

  const toggleUnlock = (id: string) => {
    setUnlockedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleSave = async () => {
    if (!selected || !dirty) return
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

  const handleDelete = async () => {
    if (!selected || selected.is_system || selected.is_locked) return
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
    if (!addForm.code.trim() || !addForm.title.trim()) { toast.error('코드·라벨은 필수입니다.'); return }
    if (templates.some(t => t.code === addForm.code.trim())) { toast.error('이미 존재하는 코드입니다.'); return }
    setAdding(true)
    try {
      const tabCtx: Record<TabKey, { scope: 'customer' | 'application'; types: string[]; locations: string[] }> = {
        '1회성케어':             { scope: 'application', types: ['1회성케어'],   locations: ['customer_detail'] },
        '정기딥케어':            { scope: 'customer',    types: ['정기딥케어'],  locations: ['customer_detail'] },
        '정기엔드케어':          { scope: 'customer',    types: ['정기엔드케어'],locations: ['customer_detail'] },
        'monthly_schedule_deep': { scope: 'application', types: ['정기딥케어'],  locations: ['monthly_schedule'] },
        'monthly_schedule_end':  { scope: 'application', types: ['정기엔드케어'],locations: ['monthly_schedule'] },
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
          send_mode: 'manual',
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

  const renderListItem = (t: Template) => {
    const isActive = selectedId === t.id
    const mode = t.send_mode ?? 'manual'
    const meta = MODE_META[mode]
    return (
      <button
        key={t.id}
        onClick={() => { setSelectedId(t.id); setBuffer({}) }}
        className={`w-full text-left px-3 py-2.5 transition-colors ${
          isActive ? 'bg-brand-50 border-l-4 border-brand-600' : 'hover:bg-surface-sunken border-l-4 border-transparent'
        } ${!t.is_active ? 'opacity-50' : ''}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 mb-0.5 flex-wrap">
              {t.category && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[t.category] ?? 'bg-surface-sunken text-text-secondary'}`}>
                  {t.category}
                </span>
              )}
              {t.is_locked && <span className="text-[10px] text-text-tertiary">🔒</span>}
              {!t.is_active && <span className="text-[10px] text-state-danger">비활성</span>}
            </div>
            <p className="text-sm font-semibold text-text-primary leading-snug">{t.title}</p>
            <p className="text-[11px] text-text-tertiary truncate mt-0.5">{t.code}</p>
          </div>
          <span className={`shrink-0 mt-1 text-[10px] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap ${meta.badge}`}>
            {meta.icon} {meta.label}
          </span>
        </div>
      </button>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* 헤더 */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-text-primary">문자알림 관리</h1>
          <p className="text-xs text-text-secondary mt-1">고객에게 발송되는 SMS/LMS 문구를 관리합니다. 90byte 초과 시 자동으로 LMS로 발송됩니다.</p>
        </div>
        <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 shadow-sm">
          <Plus size={14} /> 새 알림 추가
        </button>
      </div>

      {/* 발송방식 안내 배너 */}
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
        {(['auto', 'semi_auto', 'manual'] as SendMode[]).map(mode => {
          const m = MODE_META[mode]
          const count = templates.filter(t => (t.send_mode ?? 'manual') === mode).length
          return (
            <div key={mode} className={`rounded-lg p-3 border text-xs leading-relaxed ${m.section}`}>
              <p className="font-bold mb-0.5">{m.icon} {m.label} ({count}개)</p>
              <p className="opacity-80">{m.desc}</p>
              {mode !== 'manual' && <p className="mt-1 opacity-70 text-[10px]">🔒 기본 잠금 — 본문 편집은 항상 가능</p>}
            </div>
          )
        })}
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-border mb-4 overflow-x-auto">
        {TABS.map(tab => {
          const count = templates.filter(tab.filter).length
          const active = activeTab === tab.key
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                active ? 'border-brand-600 text-brand-700' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label} <span className="text-xs text-text-tertiary">({count})</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <p className="text-center py-16 text-text-tertiary">불러오는 중...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">

          {/* ── 좌측: send_mode 섹션별 리스트 ── */}
          <div className="border border-border rounded-xl overflow-hidden bg-surface">
            <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-xs text-text-tertiary text-center py-8">템플릿 없음</p>
              ) : (
                (['auto', 'semi_auto', 'manual'] as SendMode[]).map(mode => {
                  const group = grouped[mode]
                  if (group.length === 0) return null
                  const m = MODE_META[mode]
                  return (
                    <div key={mode}>
                      <div className={`px-3 py-1.5 flex items-center gap-1.5 border-b border-border-subtle sticky top-0 z-10 ${m.section}`}>
                        <span className="text-[11px] font-bold">{m.icon} {m.label}</span>
                        <span className="text-[10px] opacity-70">({group.length})</span>
                      </div>
                      <div className="divide-y divide-border-subtle">
                        {group.map(t => renderListItem(t))}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* ── 우측: 편집 패널 ── */}
          {selected ? (() => {
            const mode = (merged.send_mode ?? selected.send_mode ?? 'manual') as SendMode
            const meta = MODE_META[mode]
            const locked = (selected.is_locked ?? false) && !unlockedIds.has(selected.id)
            const isUnlocked = (selected.is_locked ?? false) && unlockedIds.has(selected.id)

            return (
              <div className="border border-border rounded-xl bg-surface p-4 md:p-5 space-y-4">

                {/* 헤더: 코드·제목·삭제 */}
                <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-border-subtle">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span className="text-xs text-text-tertiary font-mono">{selected.code}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${meta.badge}`}>{meta.icon} {meta.label}</span>
                      {selected.is_locked && (
                        <span className="text-[10px] text-text-tertiary">{locked ? '🔒 잠금' : '🔓 해제됨'}</span>
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
                    {/* 잠금/해제 버튼 */}
                    {selected.is_locked && (
                      <button
                        onClick={() => toggleUnlock(selected.id)}
                        title={locked ? '잠금 해제 (발송방식·활성 편집 허용)' : '다시 잠금'}
                        className={`text-sm px-2 py-1 rounded transition-colors text-xs font-medium ${
                          locked
                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                            : 'bg-surface-sunken text-text-secondary hover:bg-border-subtle'
                        }`}
                      >
                        {locked ? '🔒 잠금 해제' : '🔓 다시 잠금'}
                      </button>
                    )}
                    {/* 활성 체크박스 */}
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
                    {/* 삭제 버튼 — manual + !is_locked 만 */}
                    {!selected.is_system && !selected.is_locked && (
                      <button onClick={handleDelete}
                        className="text-xs text-state-danger px-2 py-1 rounded hover:bg-state-danger-bg flex items-center gap-1">
                        <Trash2 size={12} /> 삭제
                      </button>
                    )}
                  </div>
                </div>

                {/* 발송 방식 카드 */}
                <div className={`rounded-lg p-3 border ${meta.section}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-xs font-bold">{meta.icon} 발송 방식</p>
                    {isUnlocked && (
                      <span className="text-[10px] text-state-warning font-medium">⚠️ 잠금 해제 상태 — 신중히 변경</span>
                    )}
                  </div>
                  {locked ? (
                    <p className="text-xs opacity-80">{meta.desc}</p>
                  ) : (
                    <select
                      value={mode}
                      onChange={e => setBuffer(prev => ({ ...prev, send_mode: e.target.value as SendMode }))}
                      className="w-full border border-border rounded-md px-2 py-1.5 text-xs bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="auto">⚡ 자동 (cron 자동 발송)</option>
                      <option value="semi_auto">🔶 반자동 (관리자 클릭 발송)</option>
                      <option value="manual">⚪ 수동 (미배선)</option>
                    </select>
                  )}
                  {selected.trigger_desc && (
                    <div className="mt-2 rounded px-3 py-2 border border-border bg-surface text-xs text-text-primary">
                      <span className="text-[10px] font-semibold text-text-tertiary mr-1.5">🔒 발송 조건 :</span>
                      {selected.trigger_desc}
                    </div>
                  )}
                </div>

                {/* 발송 성공 시 자동 세팅 상태 */}
                <div className="rounded-lg p-3 border border-purple-200 bg-purple-50/40">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-text-primary">🔄 발송 성공 시 자동 세팅될 상태</p>
                    {locked && <span className="text-[10px] text-text-tertiary">🔒 잠금</span>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-medium text-text-secondary mb-1 block">진행상태</label>
                      <select
                        value={merged.linked_progress_status ?? ''}
                        disabled={locked}
                        onChange={e => setBuffer(prev => ({ ...prev, linked_progress_status: e.target.value || null }))}
                        className="w-full border border-border rounded-md px-2 py-1.5 text-xs bg-surface disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">(변경 안 함)</option>
                        {LINKED_PROGRESS_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-text-secondary mb-1 block">결제상태</label>
                      <select
                        value={merged.linked_payment_status ?? ''}
                        disabled={locked}
                        onChange={e => setBuffer(prev => ({ ...prev, linked_payment_status: e.target.value || null }))}
                        className="w-full border border-border rounded-md px-2 py-1.5 text-xs bg-surface disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">(변경 안 함)</option>
                        {LINKED_PAYMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <p className="text-[11px] text-text-tertiary mt-2">💡 발송 성공 시 해당 상태가 자동으로 변경됩니다. (변경 안 함 = 상태 갱신 없음)</p>
                </div>

                {/* LMS 제목 */}
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

                {/* 본문 — 항상 편집 가능 */}
                <div>
                  <label className="text-xs font-medium text-text-secondary mb-1 flex items-center gap-1">
                    <Type size={11} /> 본문 <span className="text-text-tertiary text-[10px]">(잠금 상태에서도 편집 가능)</span>
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
                        {msgType !== 'OVER' && <span className="text-text-tertiary">약 {cost}원</span>}
                      </span>
                      <span className="text-text-tertiary font-mono">{bytes} / {maxBytes}</span>
                    </div>
                    <div className="h-1.5 bg-surface-sunken rounded-full overflow-hidden">
                      <div className={`h-full transition-all ${msgType === 'OVER' ? 'bg-red-500' : msgType === 'LMS' ? 'bg-orange-500' : 'bg-emerald-500'}`}
                        style={{ width: `${progressPct}%` }} />
                    </div>
                    {msgType === 'LMS' && (
                      <p className="text-[11px] text-orange-700 flex items-center gap-1">
                        <AlertCircle size={11} /> 90byte 초과로 LMS 자동 승격 (SMS 대비 약 2.5배 요금)
                      </p>
                    )}
                    {msgType === 'OVER' && (
                      <p className="text-[11px] text-state-danger flex items-center gap-1">
                        <AlertCircle size={11} /> 2000byte 초과 — 발송 불가
                      </p>
                    )}
                  </div>
                </div>

                {/* 변수 팔레트 */}
                <div className="border border-border-subtle rounded-lg p-3 bg-surface-sunken/40">
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                    <p className="text-xs font-semibold text-text-secondary">📌 변수 삽입 (클릭하면 커서 위치에 삽입)</p>
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
                              <button key={v.label} onClick={() => insertVariable(v.label)} title={v.desc}
                                className="text-[11px] px-2 py-0.5 rounded-md border border-brand-200 bg-white text-brand-700 hover:bg-brand-50 font-medium transition-colors">
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
                    {rendered || <span className="text-text-tertiary">본문을 입력하면 미리보기가 나타납니다</span>}
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
            )
          })() : (
            <div className="border border-border rounded-xl bg-surface p-8 text-center text-text-tertiary">
              <Plus size={24} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">좌측에서 편집할 템플릿을 선택하세요</p>
            </div>
          )}
        </div>
      )}

      {/* 신규 템플릿 추가 모달 */}
      {addOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !adding && setAddOpen(false)}>
          <div className="bg-surface rounded-2xl max-w-md w-full p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-text-primary">새 알림 추가</h2>

            {/* ① Claude Code 안내 */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
              <p className="text-xs font-bold text-amber-900">⚡🔶 자동·반자동 알림은 Claude Code로 요청하세요</p>
              <p className="text-xs text-amber-800 leading-relaxed">
                발송 시점·조건 연결은 코드 변경이 필요합니다.<br />
                Claude Code에 아래 내용을 전달하면 바로 추가됩니다.
              </p>
              <div className="bg-white rounded-lg border border-amber-200 px-3 py-2 text-xs text-text-primary space-y-1 leading-relaxed">
                <p>① 알림 이름 (예: 정기방문 리마인더)</p>
                <p>② 발송 시점·조건 (예: 방문 2일 전 오전 9시)</p>
                <p>③ 발송 방식 — 자동 / 반자동</p>
                <p>④ 포함할 변수 (예: 고객명, 시공일자)</p>
              </div>
            </div>

            {/* ② 수동 템플릿 직접 생성 */}
            <div className="rounded-xl border border-border bg-surface-sunken/40 p-4 space-y-3">
              <p className="text-xs font-bold text-text-primary">⚪ 수동 템플릿 직접 생성</p>
              <p className="text-[11px] text-text-tertiary -mt-1">
                탭 &quot;{TABS.find(t => t.key === activeTab)?.label}&quot; · 발송방식 수동(미배선)으로 생성됩니다.
              </p>
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1 block">코드 (고유 식별자)</label>
                <input type="text" value={addForm.code} onChange={e => setAddForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="예: 특별할인알림"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-surface" />
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1 block">라벨 (관리자용 표시명)</label>
                <input type="text" value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="예: 특별 할인 안내"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-surface" />
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1 block">카테고리 (선택)</label>
                <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">(선택 안함)</option>
                  <option value="예약">예약</option>
                  <option value="결제">결제</option>
                  <option value="작업">작업</option>
                  <option value="A/S">A/S</option>
                  <option value="계정">계정</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setAddOpen(false)} disabled={adding}
                  className="px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-sunken rounded-lg">닫기</button>
                <button onClick={handleAdd} disabled={adding || !addForm.code.trim() || !addForm.title.trim()}
                  className="px-4 py-1.5 text-sm bg-brand-600 text-white rounded-lg font-semibold hover:bg-brand-700 disabled:opacity-40">
                  {adding ? '생성 중...' : '⚪ 수동으로 생성'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
