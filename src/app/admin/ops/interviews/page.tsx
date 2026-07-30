'use client'

/**
 * 분기 면담(quarterly_interviews) 관리 페이지
 * PLAN v2 §3.6
 *
 * 리스트 조회 + 신규 등록 모달
 * quarter 형식: YYYY-Q1|Q2|Q3|Q4
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ArrowLeft, MessageSquareText, Plus } from 'lucide-react'

interface Interview {
  id: string
  quarter: string
  user_id: string
  held_at: string
  q1_hardest: string | null
  q2_wish: string | null
  q3_future: string | null
  company_action: string | null
  notified_at: string | null
  created_at: string
}

interface UserRow { id: string; name: string; role: string }

function currentQuarter(): string {
  const d = new Date()
  const y = d.getFullYear()
  const q = Math.floor(d.getMonth() / 3) + 1
  return `${y}-Q${q}`
}

const LABEL = 'block text-xs font-medium text-text-secondary mb-1'
const INPUT = 'input-toss w-full px-3 py-2 rounded-md border border-border bg-surface text-sm'

export default function InterviewsPage() {
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const [form, setForm] = useState({
    quarter: currentQuarter(),
    user_id: '',
    held_at: new Date().toISOString().slice(0, 16),
    q1_hardest: '',
    q2_wish: '',
    q3_future: '',
    company_action: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [iRes, uRes] = await Promise.all([
        fetch('/api/admin/ops/interviews').then(r => r.json()),
        fetch('/api/admin/users').then(r => r.json()),
      ])
      if (iRes.ok) setInterviews(iRes.interviews)
      setUsers((uRes.users ?? []).filter((u: UserRow) => u.role === 'admin' || u.role === 'worker'))
    } catch { toast.error('로드 실패') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!form.user_id) return toast.error('대상 직원을 선택해주세요.')
    try {
      const res = await fetch('/api/admin/ops/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, held_at: new Date(form.held_at).toISOString() }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error ?? '실패')
      toast.success('저장되었습니다.')
      setShowForm(false)
      load()
    } catch (e) { toast.error((e as Error).message) }
  }

  const nameOf = (id: string) => users.find(u => u.id === id)?.name ?? '알 수 없음'

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Link href="/admin" className="text-text-tertiary hover:text-brand-600"><ArrowLeft size={18} /></Link>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2"><MessageSquareText size={20} /> 분기 면담</h1>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="btn-toss-primary inline-flex items-center gap-1.5 bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold"
        >
          <Plus size={14} /> {showForm ? '접기' : '신규 면담'}
        </button>
      </div>

      {showForm && (
        <div className="bg-surface border border-border-subtle rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={LABEL}>분기</label>
              <input className={INPUT} value={form.quarter} onChange={e => setForm({ ...form, quarter: e.target.value })} placeholder="2026-Q3" />
            </div>
            <div>
              <label className={LABEL}>대상 직원</label>
              <select className={INPUT} value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })}>
                <option value="">선택</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>일시</label>
              <input type="datetime-local" className={INPUT} value={form.held_at} onChange={e => setForm({ ...form, held_at: e.target.value })} />
            </div>
          </div>

          <div>
            <label className={LABEL}>Q1. 요즘 가장 힘든 것</label>
            <textarea className={INPUT} rows={2} value={form.q1_hardest} onChange={e => setForm({ ...form, q1_hardest: e.target.value })} />
          </div>
          <div>
            <label className={LABEL}>Q2. 회사에 바라는 것</label>
            <textarea className={INPUT} rows={2} value={form.q2_wish} onChange={e => setForm({ ...form, q2_wish: e.target.value })} />
          </div>
          <div>
            <label className={LABEL}>Q3. 앞으로 하고 싶은 일</label>
            <textarea className={INPUT} rows={2} value={form.q3_future} onChange={e => setForm({ ...form, q3_future: e.target.value })} />
          </div>
          <div>
            <label className={LABEL}>회사 실행 계획</label>
            <textarea className={INPUT} rows={2} value={form.company_action} onChange={e => setForm({ ...form, company_action: e.target.value })} placeholder="면담 결과 회사가 취할 조치" />
          </div>

          <div className="flex justify-end">
            <button
              onClick={submit}
              className="btn-toss-primary bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-semibold"
            >저장</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-6 text-center text-text-tertiary text-sm">불러오는 중…</div>
      ) : interviews.length === 0 ? (
        <div className="p-6 text-center text-text-tertiary text-sm bg-surface border border-border-subtle rounded-2xl">등록된 면담이 없습니다.</div>
      ) : (
        <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden divide-y divide-border-subtle">
          {interviews.map(iv => (
            <div key={iv.id} className="p-4 space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-bold text-brand-700">{iv.quarter}</span>
                <span className="text-text-primary font-semibold">{nameOf(iv.user_id)}</span>
                <span className="text-text-tertiary text-xs">{new Date(iv.held_at).toLocaleString('ko-KR')}</span>
              </div>
              {iv.q1_hardest && <p className="text-xs text-text-secondary"><b>힘든 것:</b> {iv.q1_hardest}</p>}
              {iv.q2_wish && <p className="text-xs text-text-secondary"><b>바라는 것:</b> {iv.q2_wish}</p>}
              {iv.q3_future && <p className="text-xs text-text-secondary"><b>하고 싶은 일:</b> {iv.q3_future}</p>}
              {iv.company_action && <p className="text-xs text-brand-700"><b>회사 실행:</b> {iv.company_action}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
