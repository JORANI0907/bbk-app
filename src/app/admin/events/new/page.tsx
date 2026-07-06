'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import Link from 'next/link'

interface BenefitItem { icon: string; title: string; desc: string }

const EMPTY_BENEFIT: BenefitItem = { icon: '✅', title: '', desc: '' }

export default function NewEventPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [badgeText, setBadgeText] = useState('')
  const [badgeColor, setBadgeColor] = useState('brand')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [status, setStatus] = useState('active')
  const [description, setDescription] = useState('')
  const [benefits, setBenefits] = useState<BenefitItem[]>([{ ...EMPTY_BENEFIT }])
  const [ctaLabel, setCtaLabel] = useState('지금 신청하기')
  const [ctaType, setCtaType] = useState('kakao')
  const [ctaValue, setCtaValue] = useState('https://pf.kakao.com/_bbkkorea')
  const [accentFrom, setAccentFrom] = useState('#1e8fc0')
  const [accentTo, setAccentTo] = useState('#0f5474')
  const [isFeatured, setIsFeatured] = useState(false)
  const [sortOrder, setSortOrder] = useState(10)

  const autoSlug = (v: string) =>
    v.toLowerCase().replace(/[^a-z0-9가-힣]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')

  const handleTitleChange = (v: string) => {
    setTitle(v)
    if (!slug) setSlug(autoSlug(v))
  }

  const updateBenefit = (i: number, field: keyof BenefitItem, value: string) => {
    setBenefits(prev => prev.map((b, idx) => idx === i ? { ...b, [field]: value } : b))
  }

  const handleSubmit = async () => {
    if (!title.trim() || !slug.trim()) { toast.error('제목과 슬러그를 입력하세요.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, slug, subtitle, badge_text: badgeText, badge_color: badgeColor,
          start_date: startDate || null, end_date: endDate || null, status, description,
          benefits: benefits.filter(b => b.title),
          cta_label: ctaLabel, cta_type: ctaType, cta_value: ctaValue,
          accent_from: accentFrom, accent_to: accentTo,
          is_featured: isFeatured, sort_order: sortOrder,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      toast.success('이벤트 생성 완료!')
      router.push('/admin/events')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '생성 실패')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface focus:outline-none focus:ring-2 focus:ring-brand-400"
  const labelCls = "block text-xs font-semibold text-text-secondary mb-1"

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/events" className="text-text-tertiary hover:text-text-secondary">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-xl font-bold text-text-primary">새 이벤트 만들기</h1>
      </div>

      <div className="space-y-5">
        {/* 기본 정보 */}
        <section className="bg-surface rounded-2xl border border-border p-4 space-y-4">
          <h2 className="text-sm font-bold text-text-primary">기본 정보</h2>
          <div>
            <label className={labelCls}>이벤트 제목 *</label>
            <input className={inputCls} value={title} onChange={e => handleTitleChange(e.target.value)} placeholder="첫 방문 고객 30% 할인" />
          </div>
          <div>
            <label className={labelCls}>슬러그 (URL) *</label>
            <input className={inputCls} value={slug} onChange={e => setSlug(autoSlug(e.target.value))} placeholder="first-visit-discount" />
            <p className="text-xs text-text-tertiary mt-1">/events/<strong>{slug || '...'}</strong> 로 접근됩니다</p>
          </div>
          <div>
            <label className={labelCls}>부제목 (한 줄 훅 문구)</label>
            <input className={inputCls} value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="처음 만나는 BBK, 가장 합리적인 가격으로 시작하세요" />
          </div>
        </section>

        {/* 배지 + 기간 */}
        <section className="bg-surface rounded-2xl border border-border p-4 space-y-4">
          <h2 className="text-sm font-bold text-text-primary">배지 · 기간 · 상태</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>배지 텍스트</label>
              <input className={inputCls} value={badgeText} onChange={e => setBadgeText(e.target.value)} placeholder="HOT / NEW / 마감임박" />
            </div>
            <div>
              <label className={labelCls}>배지 색상</label>
              <select className={inputCls} value={badgeColor} onChange={e => setBadgeColor(e.target.value)}>
                <option value="brand">브랜드 (파란)</option>
                <option value="red">빨강 (HOT)</option>
                <option value="orange">주황 (마감임박)</option>
                <option value="green">초록</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>시작일</label>
              <input type="date" className={inputCls} value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>종료일</label>
              <input type="date" className={inputCls} value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelCls}>상태</label>
            <select className={inputCls} value={status} onChange={e => setStatus(e.target.value)}>
              <option value="upcoming">예정</option>
              <option value="active">진행중</option>
              <option value="ended">종료</option>
            </select>
          </div>
        </section>

        {/* 혜택 목록 */}
        <section className="bg-surface rounded-2xl border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-text-primary">혜택 항목</h2>
            <button
              onClick={() => setBenefits(prev => [...prev, { ...EMPTY_BENEFIT }])}
              className="text-xs text-brand-600 font-semibold hover:underline"
            >+ 항목 추가</button>
          </div>
          {benefits.map((b, i) => (
            <div key={i} className="flex gap-2 items-start">
              <input className="w-10 px-1 py-2 text-sm border border-border rounded-lg text-center bg-surface focus:outline-none" value={b.icon} onChange={e => updateBenefit(i, 'icon', e.target.value)} placeholder="✅" />
              <div className="flex-1 space-y-1.5">
                <input className={inputCls} value={b.title} onChange={e => updateBenefit(i, 'title', e.target.value)} placeholder="혜택 제목" />
                <input className={inputCls} value={b.desc} onChange={e => updateBenefit(i, 'desc', e.target.value)} placeholder="상세 설명" />
              </div>
              <button onClick={() => setBenefits(prev => prev.filter((_, idx) => idx !== i))} className="text-text-tertiary hover:text-red-400 pt-2">✕</button>
            </div>
          ))}
        </section>

        {/* CTA */}
        <section className="bg-surface rounded-2xl border border-border p-4 space-y-4">
          <h2 className="text-sm font-bold text-text-primary">CTA 버튼</h2>
          <div>
            <label className={labelCls}>버튼 텍스트</label>
            <input className={inputCls} value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} placeholder="지금 신청하기" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>연결 방식</label>
              <select className={inputCls} value={ctaType} onChange={e => setCtaType(e.target.value)}>
                <option value="kakao">카카오톡</option>
                <option value="phone">전화</option>
                <option value="url">URL</option>
                <option value="form">신청폼</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>URL / 전화번호</label>
              <input className={inputCls} value={ctaValue} onChange={e => setCtaValue(e.target.value)} placeholder="https://pf.kakao.com/..." />
            </div>
          </div>
        </section>

        {/* 디자인 */}
        <section className="bg-surface rounded-2xl border border-border p-4 space-y-4">
          <h2 className="text-sm font-bold text-text-primary">카드 색상</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>시작 색상</label>
              <div className="flex gap-2">
                <input type="color" className="h-9 w-12 rounded border border-border cursor-pointer" value={accentFrom} onChange={e => setAccentFrom(e.target.value)} />
                <input className={inputCls} value={accentFrom} onChange={e => setAccentFrom(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelCls}>끝 색상</label>
              <div className="flex gap-2">
                <input type="color" className="h-9 w-12 rounded border border-border cursor-pointer" value={accentTo} onChange={e => setAccentTo(e.target.value)} />
                <input className={inputCls} value={accentTo} onChange={e => setAccentTo(e.target.value)} />
              </div>
            </div>
          </div>
          <div
            className="h-16 rounded-xl"
            style={{ background: `linear-gradient(135deg, ${accentFrom}, ${accentTo})` }}
          />
        </section>

        {/* 기타 설정 */}
        <section className="bg-surface rounded-2xl border border-border p-4 space-y-4">
          <h2 className="text-sm font-bold text-text-primary">기타 설정</h2>
          <div>
            <label className={labelCls}>상세 내용 (마크다운)</label>
            <textarea className={inputCls} rows={6} value={description} onChange={e => setDescription(e.target.value)} placeholder="## 이벤트 안내&#10;&#10;내용을 입력하세요." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>정렬 순서 (작을수록 위)</label>
              <input type="number" className={inputCls} value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))} />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id="featured" checked={isFeatured} onChange={e => setIsFeatured(e.target.checked)} className="w-4 h-4 accent-brand-600" />
              <label htmlFor="featured" className="text-sm text-text-primary">히어로 배너에 표시</label>
            </div>
          </div>
        </section>

        {/* 저장 */}
        <div className="flex gap-3 pb-8">
          <Link href="/admin/events" className="flex-1 py-3 rounded-xl border border-border text-center text-sm font-semibold text-text-secondary hover:bg-surface-sunken transition-colors">
            취소
          </Link>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 disabled:opacity-60 transition-colors"
          >
            {saving ? '저장 중...' : '이벤트 저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
