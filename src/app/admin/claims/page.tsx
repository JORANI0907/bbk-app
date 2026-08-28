'use client'

/**
 * 고객 A/S 요청 관리 페이지 (SPEC 4.4 · Phase 1 v2 S4)
 * PLAN v2 §3.4 (수정 매핑)
 *
 * - 리스트: 미해결/전체 세그먼트
 * - 신규 등록: 고객 선택 + 발생일 + 내용 + 카테고리/원인 + 재작업 여부
 * - 편집: 해결 처리 (resolved_at 세팅)
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { AlertOctagon, Plus, CheckCircle2, Repeat, ArrowLeft, X, Copy, ExternalLink } from 'lucide-react'

// D: 고객 자율 접수 URL (카톡비즈·안내문자·QR 등에 배포)
const CUSTOMER_CLAIM_URL = 'https://app.bbkorea.co.kr/customer/claims/new'

interface CustomerBrief { id: string; business_name: string; contact_name: string | null; contact_phone: string | null }

interface Claim {
  id: string
  occurred_at: string
  content: string
  category: string | null
  cause: string | null
  is_rework: boolean
  resolved_at: string | null
  customer_id: string
  customer: CustomerBrief | CustomerBrief[] | null
  created_at: string
  source?: 'customer_form' | 'admin_manual' | 'phone_call' | null
}

interface CustomerRow { id: string; business_name: string; contact_name: string | null }

type FilterTab = 'open' | 'all'

const LABEL = 'block text-xs font-medium text-text-secondary mb-1'
const INPUT = 'w-full px-3 py-2 rounded-md border border-border bg-surface text-sm focus:border-brand-500 focus:shadow-focus'

// Batch B-4: 표준 카테고리 5종 (고객 자율 접수와 동일)
const CATEGORIES = ['청소 미흡', '파손·훼손', '시간 지연', '작업자 태도', '기타'] as const
// 관리자 수동 등록 시 접수 경로 구분 (Slack 히스토리·CS 분석용)
const SOURCE_LABEL: Record<string, string> = {
  customer_form: '고객 자율',
  admin_manual: '관리자 수동',
  phone_call: '전화 상담',
}

function customerName(c: Claim['customer']): string {
  if (!c) return '알 수 없음'
  const rec = Array.isArray(c) ? c[0] : c
  return rec?.business_name ?? '알 수 없음'
}

export default function ClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([])
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [tab, setTab] = useState<FilterTab>('open')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    customer_id: '',
    occurred_at: new Date().toISOString().slice(0, 16),
    content: '',
    category: '',
    cause: '',
    is_rework: false,
    source: 'phone_call' as 'admin_manual' | 'phone_call',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = tab === 'open' ? '?open=1' : ''
      const [cRes, custRes] = await Promise.all([
        fetch(`/api/admin/claims${qs}`).then(r => r.json()),
        fetch('/api/admin/customers?limit=500').then(r => r.json()),
      ])
      if (cRes.ok) setClaims(cRes.claims)
      const custList: CustomerRow[] = custRes.customers ?? custRes.data ?? []
      setCustomers(custList)
    } catch { toast.error('로드 실패') }
    finally { setLoading(false) }
  }, [tab])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!form.customer_id) return toast.error('고객을 선택해주세요.')
    if (!form.content.trim()) return toast.error('내용을 입력해주세요.')
    try {
      const res = await fetch('/api/admin/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          occurred_at: new Date(form.occurred_at).toISOString(),
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? '실패')
      toast.success('등록되었습니다.')
      setShowForm(false)
      setForm({
        customer_id: '',
        occurred_at: new Date().toISOString().slice(0, 16),
        content: '', category: '', cause: '', is_rework: false,
        source: 'phone_call',
      })
      load()
    } catch (e) { toast.error((e as Error).message) }
  }

  const resolve = async (id: string) => {
    if (!confirm('이 A/S 요청을 해결 처리하시겠습니까?')) return
    try {
      const res = await fetch(`/api/admin/claims/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved_at: new Date().toISOString() }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? '실패')
      toast.success('해결 처리되었습니다.')
      load()
    } catch (e) { toast.error((e as Error).message) }
  }

  const toggleRework = async (c: Claim) => {
    try {
      const res = await fetch(`/api/admin/claims/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_rework: !c.is_rework }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? '실패')
      setClaims(prev => prev.map(x => x.id === c.id ? { ...x, is_rework: !c.is_rework } : x))
    } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Link href="/admin" className="text-text-tertiary hover:text-brand-600"><ArrowLeft size={18} /></Link>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2"><AlertOctagon size={20} className="text-state-danger" /> 고객 A/S 요청</h1>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="btn-toss-primary inline-flex items-center gap-1.5 bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold"
        >
          {showForm ? <><X size={14} /> 접기</> : <><Plus size={14} /> 새 A/S 요청</>}
        </button>
      </div>

      {/* D: 고객 접수 URL 카드 + 사용 흐름 안내 */}
      <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4 space-y-3">
        <div>
          <p className="text-sm font-bold text-brand-800 mb-1">📢 고객 자율 접수 URL</p>
          <p className="text-xs text-brand-700 leading-relaxed">
            아래 링크를 카톡비즈니스 · 안내 문자 · 명함 QR 등에 배포하세요.
          </p>
        </div>

        {/* URL 복사 박스 */}
        <div className="flex items-center gap-2 bg-white border border-brand-200 rounded-lg px-3 py-2">
          <code className="flex-1 text-xs text-brand-800 font-mono truncate">{CUSTOMER_CLAIM_URL}</code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(CUSTOMER_CLAIM_URL)
                .then(() => toast.success('URL 복사됨'))
                .catch(() => toast.error('복사 실패'))
            }}
            className="inline-flex items-center gap-1 bg-brand-600 text-white px-2.5 py-1.5 rounded-md text-xs font-semibold hover:bg-brand-700 active:scale-95 transition-all shrink-0"
          >
            <Copy size={12} /> 복사
          </button>
          <a
            href={CUSTOMER_CLAIM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 bg-white border border-brand-300 text-brand-700 px-2.5 py-1.5 rounded-md text-xs font-semibold hover:bg-brand-50 shrink-0"
          >
            <ExternalLink size={12} /> 열기
          </a>
        </div>

        {/* 사용 흐름 3단계 */}
        <div className="bg-white border border-brand-100 rounded-lg p-3">
          <p className="text-xs font-semibold text-brand-800 mb-2">💡 어떻게 작동하나요?</p>
          <ol className="space-y-1.5 text-xs text-text-secondary leading-relaxed list-decimal list-inside">
            <li>고객이 링크 클릭 → <b>연락처 입력 · OTP 인증</b> (1회성·계정 잊은 고객도 접수 가능)</li>
            <li>이름·업체명(선택) + 카테고리 + 세부 내용 작성</li>
            <li>접수 완료 → 이 페이지에 <b>&quot;고객 자율&quot;</b> 뱃지로 표시 + Slack 즉시 알림</li>
          </ol>
          <p className="text-[10px] text-text-tertiary mt-2 leading-relaxed">
            등록된 연락처면 업체명이 자동 매칭됩니다. 미매칭 접수는 <b>&quot;미매칭·관리자 확인 필요&quot;</b>로 표시되니 신규 고객 등록 후 연결하세요. 전화 상담은 위 &quot;새 A/S 요청&quot; 버튼으로 직접 등록.
          </p>
        </div>
      </div>

      {showForm && (
        <div className="bg-surface border border-border-subtle rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>고객 (필수)</label>
              <select className={INPUT} value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}>
                <option value="">선택</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.business_name} {c.contact_name ? `(${c.contact_name})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>발생 일시</label>
              <input type="datetime-local" className={INPUT} value={form.occurred_at} onChange={e => setForm({ ...form, occurred_at: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={LABEL}>내용 (필수)</label>
            <textarea className={INPUT + ' resize-none'} rows={3} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="A/S 요청 상세 내용" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={LABEL}>카테고리</label>
              <select className={INPUT} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                <option value="">선택 안 함</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>접수 경로</label>
              <select className={INPUT} value={form.source} onChange={e => setForm({ ...form, source: e.target.value as 'admin_manual' | 'phone_call' })}>
                <option value="phone_call">전화 상담</option>
                <option value="admin_manual">관리자 수동</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>원인 분석 (선택)</label>
              <input className={INPUT} value={form.cause} onChange={e => setForm({ ...form, cause: e.target.value })} placeholder="원인" />
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={form.is_rework} onChange={e => setForm({ ...form, is_rework: e.target.checked })} />
            <Repeat size={14} className="text-orange-600" /> 재작업 발생
          </label>
          <div className="flex justify-end">
            <button onClick={submit} className="btn-toss-primary bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">등록</button>
          </div>
        </div>
      )}

      {/* 필터 */}
      <div className="flex gap-1">
        {(['open', 'all'] as FilterTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              tab === t ? 'bg-brand-600 text-white' : 'bg-surface-sunken text-text-secondary hover:bg-surface'
            }`}
          >
            {t === 'open' ? '미해결' : '전체'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-6 text-center text-text-tertiary text-sm">불러오는 중…</div>
      ) : claims.length === 0 ? (
        <div className="p-6 text-center text-text-tertiary text-sm bg-surface border border-border-subtle rounded-2xl">A/S 요청이 없습니다.</div>
      ) : (
        <ul className="bg-surface border border-border-subtle rounded-2xl divide-y divide-border-subtle overflow-hidden">
          {claims.map(c => {
            const resolved = !!c.resolved_at
            return (
              <li key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-bold text-text-primary">{customerName(c.customer)}</span>
                      <span className="text-xs text-text-tertiary">{new Date(c.occurred_at).toLocaleString('ko-KR')}</span>
                      {c.category && <span className="text-xs bg-surface-sunken text-text-secondary px-1.5 py-0.5 rounded-md">{c.category}</span>}
                      {c.source && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-md ${c.source === 'customer_form' ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-700'}`}>
                          {SOURCE_LABEL[c.source] ?? c.source}
                        </span>
                      )}
                      {c.is_rework && (
                        <span className="text-xs bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded-md inline-flex items-center gap-0.5"><Repeat size={10} />재작업</span>
                      )}
                      {resolved ? (
                        <span className="text-xs bg-state-success-bg text-state-success px-1.5 py-0.5 rounded-md inline-flex items-center gap-0.5"><CheckCircle2 size={10} />해결됨</span>
                      ) : (
                        <span className="text-xs bg-state-danger-bg text-state-danger px-1.5 py-0.5 rounded-md">미해결</span>
                      )}
                    </div>
                    <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">{c.content}</p>
                    {c.cause && <p className="text-xs text-text-tertiary mt-1"><b>원인:</b> {c.cause}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleRework(c)}
                      className="text-xs text-text-secondary hover:text-brand-600 underline"
                    >{c.is_rework ? '재작업 해제' : '재작업 표기'}</button>
                    {!resolved && (
                      <button
                        onClick={() => resolve(c.id)}
                        className="btn-toss inline-flex items-center gap-1 bg-state-success-bg text-state-success px-2 py-1 rounded-md text-xs font-semibold"
                      >
                        <CheckCircle2 size={12} /> 해결
                      </button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
