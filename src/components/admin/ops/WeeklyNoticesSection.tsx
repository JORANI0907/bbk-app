'use client'

/**
 * 사내 주간 공지 섹션 (SPEC 4.3 · 규정 제7조)
 * PLAN v2 §3.2
 *
 * /admin/notices 페이지에서 "주간 공지" 세그먼트가 활성일 때 렌더링.
 *
 * UX 흐름:
 *  - 이번 주 초안(week_start 월요일 기준) 자동 로드
 *  - 없으면 빈 3줄 폼
 *  - [AI 초안 생성] 버튼 → 자동 채움 + 원본 저장용 draft 상태 유지
 *  - 각 줄 100자 카운터
 *  - [저장] → POST /weekly-notices (upsert)
 *  - 저장 후 미발행: [발행] 노출
 *  - 발행됨: 배지 + [발행 취소] 노출 → 편집 가능
 *  - 하단: 최근 5주 목록 (읽기 전용)
 */

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Sparkles, Send, RotateCcw, Save, Loader2, Calendar } from 'lucide-react'

const MAX_LEN = 100

interface WeeklyNotice {
  id: string
  week_start: string
  line1: string; line2: string; line3: string
  author_id: string
  ai_draft_used: boolean
  published_at: string | null
  created_at: string
  updated_at: string
}

interface AiDraft { line1: string; line2: string; line3: string }

function getMondayOfWeek(date: Date = new Date()): string {
  const d = new Date(date)
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

const TEXTAREA = 'w-full px-3 py-2 rounded-md border border-border bg-surface text-sm focus:border-brand-500 focus:shadow-focus resize-none'

interface LineFieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}

function LineField({ label, value, onChange, disabled }: LineFieldProps) {
  const len = value.length
  const over = len > MAX_LEN
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-text-secondary">{label}</label>
        <span className={`text-xs ${over ? 'text-state-danger font-bold' : 'text-text-tertiary'}`}>{len} / {MAX_LEN}</span>
      </div>
      <textarea
        className={TEXTAREA}
        rows={2}
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        placeholder={disabled ? '' : '100자 이내로 작성'}
      />
    </div>
  )
}

export function WeeklyNoticesSection() {
  const [weekStart, setWeekStart] = useState<string>(getMondayOfWeek())
  const [thisWeek, setThisWeek] = useState<WeeklyNotice | null>(null)
  const [lines, setLines] = useState<{ line1: string; line2: string; line3: string }>({ line1: '', line2: '', line3: '' })
  const [originalDraft, setOriginalDraft] = useState<AiDraft | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [recent, setRecent] = useState<WeeklyNotice[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/weekly-notices?limit=10')
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? '')
      const notices: WeeklyNotice[] = json.notices
      setRecent(notices.filter((n: WeeklyNotice) => n.week_start !== weekStart))
      const found = notices.find((n: WeeklyNotice) => n.week_start === weekStart)
      if (found) {
        setThisWeek(found)
        setLines({ line1: found.line1, line2: found.line2, line3: found.line3 })
      } else {
        setThisWeek(null)
        setLines({ line1: '', line2: '', line3: '' })
      }
    } catch (e) { toast.error((e as Error).message || '로드 실패') }
    finally { setLoading(false) }
  }, [weekStart])

  useEffect(() => { load() }, [load])

  const generateAiDraft = async () => {
    setAiLoading(true)
    try {
      const res = await fetch('/api/admin/weekly-notices/ai-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start: weekStart }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'AI 실패')
      const draft: AiDraft = json.draft
      setLines(draft)
      setOriginalDraft(draft)
      toast.success('AI 초안이 생성되었습니다. 자유롭게 수정 후 저장하세요.')
    } catch (e) { toast.error((e as Error).message) }
    finally { setAiLoading(false) }
  }

  const save = async () => {
    for (const key of ['line1', 'line2', 'line3'] as const) {
      if (!lines[key].trim()) return toast.error(`${key} 필수`)
      if (lines[key].length > MAX_LEN) return toast.error(`${key} 100자 초과`)
    }
    setSaving(true)
    try {
      const payload = {
        week_start: weekStart,
        ...lines,
        ai_draft_used: !!originalDraft,
        original_draft: originalDraft,
      }
      const res = await fetch('/api/admin/weekly-notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? '저장 실패')
      setThisWeek(json.notice)
      toast.success('저장되었습니다.')
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }

  const publish = async () => {
    if (!thisWeek) return
    if (!confirm('이 주간 공지를 발행하시겠습니까? 발행 후에도 편집은 가능합니다.')) return
    setPublishing(true)
    try {
      const res = await fetch(`/api/admin/weekly-notices/${thisWeek.id}/publish`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? '실패')
      setThisWeek(json.notice)
      toast.success('발행되었습니다.')
    } catch (e) { toast.error((e as Error).message) }
    finally { setPublishing(false) }
  }

  const unpublish = async () => {
    if (!thisWeek) return
    if (!confirm('발행을 취소하시겠습니까?')) return
    try {
      const res = await fetch(`/api/admin/weekly-notices/${thisWeek.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unpublish: true }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? '실패')
      setThisWeek(json.notice)
      toast.success('발행 취소되었습니다.')
    } catch (e) { toast.error((e as Error).message) }
  }

  const published = !!thisWeek?.published_at

  return (
    <div className="flex flex-col gap-5">
      {/* 이번 주 편집 카드 */}
      <div className="bg-surface border border-border-subtle rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-brand-600" />
            <input
              type="date"
              value={weekStart}
              onChange={e => setWeekStart(getMondayOfWeek(new Date(e.target.value)))}
              className="px-2 py-1 rounded-md border border-border bg-surface text-sm"
            />
            <span className="text-xs text-text-tertiary">주 시작 (월요일 기준)</span>
            {published && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-state-success-bg text-state-success">
                발행됨 · {new Date(thisWeek!.published_at!).toLocaleString('ko-KR')}
              </span>
            )}
          </div>
          <button
            onClick={generateAiDraft}
            disabled={aiLoading}
            className="btn-toss inline-flex items-center gap-1.5 bg-brand-50 text-brand-700 border border-brand-100 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
          >
            {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            AI 초안 생성
          </button>
        </div>

        {loading ? (
          <div className="text-center text-text-tertiary text-sm py-6">불러오는 중…</div>
        ) : (
          <>
            <LineField label="1줄 (이번 주 성과·감사)" value={lines.line1} onChange={v => setLines({ ...lines, line1: v })} />
            <LineField label="2줄 (이번 주 학습·개선)" value={lines.line2} onChange={v => setLines({ ...lines, line2: v })} />
            <LineField label="3줄 (다음 주 방향·격려)" value={lines.line3} onChange={v => setLines({ ...lines, line3: v })} />

            <div className="flex items-center gap-2 pt-2 border-t border-border-subtle">
              <button
                onClick={save}
                disabled={saving}
                className="btn-toss-primary inline-flex items-center gap-1.5 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                <Save size={14} /> {saving ? '저장 중…' : '저장'}
              </button>
              {thisWeek && !published && (
                <button
                  onClick={publish}
                  disabled={publishing}
                  className="btn-toss inline-flex items-center gap-1.5 bg-brand-100 text-brand-700 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                >
                  <Send size={14} /> {publishing ? '발행 중…' : '발행'}
                </button>
              )}
              {published && (
                <button
                  onClick={unpublish}
                  className="btn-toss inline-flex items-center gap-1.5 bg-state-warning-bg text-state-warning px-4 py-2 rounded-lg text-sm font-semibold"
                >
                  <RotateCcw size={14} /> 발행 취소
                </button>
              )}
              {originalDraft && <span className="ml-auto text-xs text-text-tertiary">✨ AI 초안에서 편집됨</span>}
            </div>
          </>
        )}
      </div>

      {/* 최근 목록 */}
      {recent.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-text-primary mb-2">최근 주간 공지</h3>
          <ul className="bg-surface border border-border-subtle rounded-2xl divide-y divide-border-subtle overflow-hidden">
            {recent.map(n => (
              <li key={n.id} className="p-4 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-brand-700">{n.week_start} 주</span>
                  {n.published_at ? (
                    <span className="text-xs text-state-success">발행 {new Date(n.published_at).toLocaleDateString('ko-KR')}</span>
                  ) : (
                    <span className="text-xs text-text-tertiary">미발행</span>
                  )}
                </div>
                <p className="text-xs text-text-secondary">1. {n.line1}</p>
                <p className="text-xs text-text-secondary">2. {n.line2}</p>
                <p className="text-xs text-text-secondary">3. {n.line3}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
