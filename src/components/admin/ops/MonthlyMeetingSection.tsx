'use client'

/**
 * 이달 회의 기록 섹션 (SPEC 4.4 · 규정 제8조)
 * PLAN v2 §3.3
 *
 * /admin/reports 하단에 삽입.
 *
 * 폼 필드:
 *  - 참석 N/M
 *  - 5개 지표: jobs / claims / rework / churn / renewal_rate
 *  - 매출/남는 돈 (페어 강제, DB CHECK)
 *  - 칭찬 대상 + 사유
 *  - 고칠 것 (담당·기한 필수 시)
 *  - 결정사항 3줄
 *  - 사진 URL
 */

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { CalendarCheck, Save, DollarSign, Users, Trophy, Wrench } from 'lucide-react'

interface Meeting {
  id: string
  month: string
  held_at: string | null
  attendee_count: number
  total_count: number
  jobs_count: number
  claims_count: number
  rework_count: number
  churn_count: number
  renewal_rate: number | null
  revenue: number | null
  net_profit: number | null
  praised_user_id: string | null
  praise_reason: string | null
  fix_item: string | null
  fix_owner_id: string | null
  fix_due: string | null
  fix_result: 'pending' | 'done' | 'dropped'
  photo_url: string | null
  decision_1: string | null
  decision_2: string | null
  decision_3: string | null
}

interface UserRow { id: string; name: string; role: string }

interface FormState {
  held_at: string
  attendee_count: string
  total_count: string
  jobs_count: string
  claims_count: string
  rework_count: string
  churn_count: string
  renewal_rate: string
  revenue: string
  net_profit: string
  praised_user_id: string
  praise_reason: string
  fix_item: string
  fix_owner_id: string
  fix_due: string
  fix_result: 'pending' | 'done' | 'dropped'
  photo_url: string
  decision_1: string
  decision_2: string
  decision_3: string
}

const EMPTY: FormState = {
  held_at: '',
  attendee_count: '0', total_count: '0',
  jobs_count: '0', claims_count: '0', rework_count: '0', churn_count: '0',
  renewal_rate: '',
  revenue: '', net_profit: '',
  praised_user_id: '', praise_reason: '',
  fix_item: '', fix_owner_id: '', fix_due: '',
  fix_result: 'pending',
  photo_url: '',
  decision_1: '', decision_2: '', decision_3: '',
}

const LABEL = 'block text-xs font-medium text-text-secondary mb-1'
const INPUT = 'w-full px-3 py-2 rounded-md border border-border bg-surface text-sm focus:border-brand-500 focus:shadow-focus'
const TEXTAREA = INPUT + ' resize-none'

interface Props { month: string }

export function MonthlyMeetingSection({ month }: Props) {
  const monthDate = `${month}-01`  // 'YYYY-MM' → 'YYYY-MM-01'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [showRevenue, setShowRevenue] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [mRes, uRes] = await Promise.all([
        fetch(`/api/admin/monthly-meetings?year=${month.slice(0, 4)}`).then(r => r.json()),
        fetch('/api/admin/users').then(r => r.json()),
      ])
      setUsers((uRes.users ?? []).filter((u: UserRow) => u.role === 'admin' || u.role === 'worker'))
      const found: Meeting | undefined = (mRes.meetings ?? []).find((m: Meeting) => m.month === monthDate)
      if (found) {
        setMeeting(found)
        setShowRevenue(found.revenue !== null)
        setForm({
          held_at: found.held_at ? found.held_at.slice(0, 16) : '',
          attendee_count: String(found.attendee_count),
          total_count: String(found.total_count),
          jobs_count: String(found.jobs_count),
          claims_count: String(found.claims_count),
          rework_count: String(found.rework_count),
          churn_count: String(found.churn_count),
          renewal_rate: found.renewal_rate?.toString() ?? '',
          revenue: found.revenue?.toString() ?? '',
          net_profit: found.net_profit?.toString() ?? '',
          praised_user_id: found.praised_user_id ?? '',
          praise_reason: found.praise_reason ?? '',
          fix_item: found.fix_item ?? '',
          fix_owner_id: found.fix_owner_id ?? '',
          fix_due: found.fix_due ?? '',
          fix_result: found.fix_result ?? 'pending',
          photo_url: found.photo_url ?? '',
          decision_1: found.decision_1 ?? '',
          decision_2: found.decision_2 ?? '',
          decision_3: found.decision_3 ?? '',
        })
      } else {
        setMeeting(null)
        setForm(EMPTY)
        setShowRevenue(false)
      }
    } catch (e) { toast.error((e as Error).message || '로드 실패') }
    finally { setLoading(false) }
  }, [month, monthDate])

  useEffect(() => { load() }, [load])

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(prev => ({ ...prev, [k]: v }))

  const save = async () => {
    if (!showRevenue) {
      // 매출 감춤 상태에서 저장하면 revenue/net_profit 비워서 전송
      form.revenue = ''
      form.net_profit = ''
    } else {
      if (!form.revenue || !form.net_profit) {
        return toast.error('매출과 남는 돈은 함께 입력해주세요.')
      }
    }
    if (form.fix_item && (!form.fix_owner_id || !form.fix_due)) {
      return toast.error('고칠 것을 적으면 담당자·기한이 필수입니다.')
    }

    setSaving(true)
    try {
      const payload = {
        month: monthDate,
        held_at: form.held_at || null,
        attendee_count: Number(form.attendee_count),
        total_count: Number(form.total_count),
        jobs_count: Number(form.jobs_count),
        claims_count: Number(form.claims_count),
        rework_count: Number(form.rework_count),
        churn_count: Number(form.churn_count),
        renewal_rate: form.renewal_rate || null,
        revenue: showRevenue ? form.revenue : null,
        net_profit: showRevenue ? form.net_profit : null,
        praised_user_id: form.praised_user_id || null,
        praise_reason: form.praise_reason || null,
        fix_item: form.fix_item || null,
        fix_owner_id: form.fix_owner_id || null,
        fix_due: form.fix_due || null,
        fix_result: form.fix_result,
        photo_url: form.photo_url || null,
        decision_1: form.decision_1 || null,
        decision_2: form.decision_2 || null,
        decision_3: form.decision_3 || null,
      }
      const res = await fetch('/api/admin/monthly-meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? '저장 실패')
      setMeeting(json.meeting)
      toast.success('저장되었습니다.')
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="bg-surface rounded-xl border border-border-subtle p-4 text-center text-text-tertiary text-sm">회의 기록 불러오는 중…</div>

  return (
    <div className="bg-surface rounded-xl border border-border-subtle shadow-soft p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
          <CalendarCheck size={14} className="text-brand-600" /> 이달 회의 기록
          {meeting && <span className="text-xs font-normal text-text-tertiary ml-1">저장됨</span>}
        </h2>
        <button
          onClick={save}
          disabled={saving}
          className="btn-toss-primary inline-flex items-center gap-1.5 bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          <Save size={12} /> {saving ? '저장 중…' : '저장'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>일시</label>
          <input type="datetime-local" className={INPUT} value={form.held_at} onChange={e => update('held_at', e.target.value)} />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className={LABEL}><Users size={11} className="inline mr-1" />참석</label>
            <input type="number" min="0" className={INPUT} value={form.attendee_count} onChange={e => update('attendee_count', e.target.value)} />
          </div>
          <span className="pb-2 text-text-tertiary text-sm">/</span>
          <div className="flex-1">
            <label className={LABEL}>전체</label>
            <input type="number" min="0" className={INPUT} value={form.total_count} onChange={e => update('total_count', e.target.value)} />
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-text-primary mb-2">이달 지표 5개</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {([
            ['jobs_count', '완료건수'],
            ['claims_count', '클레임'],
            ['rework_count', '재작업'],
            ['churn_count', '이탈고객'],
            ['renewal_rate', '재계약률%'],
          ] as const).map(([k, l]) => (
            <div key={k}>
              <label className={LABEL}>{l}</label>
              <input type="number" min="0" className={INPUT} value={form[k]} onChange={e => update(k, e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <input type="checkbox" checked={showRevenue} onChange={e => setShowRevenue(e.target.checked)} id="show-rev" />
          <label htmlFor="show-rev" className="text-xs font-bold text-text-primary flex items-center gap-1"><DollarSign size={11} />매출·남는 돈 입력</label>
          <span className="text-xs text-text-tertiary">함께 입력 필수 (DB CHECK)</span>
        </div>
        {showRevenue && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>매출 (원)</label>
              <input type="number" min="0" step="1000" className={INPUT} value={form.revenue} onChange={e => update('revenue', e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>남는 돈 (원, 음수 가능)</label>
              <input type="number" step="1000" className={INPUT} value={form.net_profit} onChange={e => update('net_profit', e.target.value)} />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className={LABEL}><Trophy size={11} className="inline mr-1" />칭찬 대상</label>
          <select className={INPUT} value={form.praised_user_id} onChange={e => update('praised_user_id', e.target.value)}>
            <option value="">없음</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL}>칭찬 사유</label>
          <input className={INPUT} value={form.praise_reason} onChange={e => update('praise_reason', e.target.value)} placeholder="예: 급한 요청 즉시 대응" />
        </div>
      </div>

      <div className="bg-surface-sunken p-3 rounded-xl space-y-2">
        <p className="text-xs font-bold text-text-primary flex items-center gap-1"><Wrench size={11} />고칠 것 1건</p>
        <input className={INPUT} value={form.fix_item} onChange={e => update('fix_item', e.target.value)} placeholder="이번 달 개선 항목 (선택)" />
        {form.fix_item && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <select className={INPUT} value={form.fix_owner_id} onChange={e => update('fix_owner_id', e.target.value)}>
              <option value="">담당자 필수</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <input type="date" className={INPUT} value={form.fix_due} onChange={e => update('fix_due', e.target.value)} />
            <select className={INPUT} value={form.fix_result} onChange={e => update('fix_result', e.target.value as FormState['fix_result'])}>
              <option value="pending">진행중</option>
              <option value="done">완료</option>
              <option value="dropped">중단</option>
            </select>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-bold text-text-primary mb-2">결정사항 3줄</p>
        <div className="space-y-2">
          <textarea className={TEXTAREA} rows={1} value={form.decision_1} onChange={e => update('decision_1', e.target.value)} placeholder="결정 1" />
          <textarea className={TEXTAREA} rows={1} value={form.decision_2} onChange={e => update('decision_2', e.target.value)} placeholder="결정 2" />
          <textarea className={TEXTAREA} rows={1} value={form.decision_3} onChange={e => update('decision_3', e.target.value)} placeholder="결정 3" />
        </div>
      </div>

      <div>
        <label className={LABEL}>사진 URL (Google Drive 등)</label>
        <input className={INPUT} value={form.photo_url} onChange={e => update('photo_url', e.target.value)} placeholder="https://drive.google.com/…" />
      </div>
    </div>
  )
}
