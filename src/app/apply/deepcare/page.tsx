'use client'

import { useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'

const BUSINESS_TYPES = ['음식점', '카페', '편의점', '학교/학원', '호텔/숙박', '사무실', '기타']

const ITEMS = {
  주방조리설비: ['후드/덕트', '가스레인지(4구)', '간택기', '튀김기', '식기세척기'],
  냉장냉동설비: ['냉장고(업소용 4구)', '선반형 밧드냉장고', '밧드냉장고', '쇼케이스'],
  위생환경설비: ['주방바닥', '주방벽면', '주방보조선반', '에어컨(벽걸이형)', '트렌치/트랩', '화장실', '홀 테이블 덕트'],
}

const FREQ_UNITS = ['주', '월'] as const
type FreqUnit = typeof FREQ_UNITS[number]
const FREQ_COUNTS = ['1회', '2회', '3회', '4회', '5회'] as const

type ItemCategory = keyof typeof ITEMS

export default function DeepcaredPage() {
  const [form, setForm] = useState({
    business_name: '',
    owner_name: '',
    phone: '',
    address: '',
    email: '',
    request_notes: '',
  })
  const [businessTypes, setBusinessTypes] = useState<string[]>([])
  const [customBizType, setCustomBizType] = useState('')
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [customItem, setCustomItem] = useState('')
  const [showCustomItem, setShowCustomItem] = useState(false)
  const [freqUnit, setFreqUnit] = useState<FreqUnit>('월')
  const [freqCount, setFreqCount] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  function toggleBizType(t: string) {
    setBusinessTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }
  function toggleItem(item: string) {
    setSelectedItems(prev => prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item])
  }
  function setField(key: keyof typeof form, val: string) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  function buildCareScope() {
    const parts: string[] = []
    if (businessTypes.length) {
      const labels = businessTypes.map(t =>
        t === '기타' && customBizType.trim() ? `기타(${customBizType.trim()})` : t
      )
      parts.push(`업종: ${labels.join(', ')}`)
    }
    const allItems = [...selectedItems, ...(customItem.trim() ? [`기타: ${customItem.trim()}`] : [])]
    if (allItems.length) {
      const byCategory = (Object.keys(ITEMS) as ItemCategory[]).reduce<Record<string, string[]>>(
        (acc, cat) => {
          const matched = ITEMS[cat].filter(i => selectedItems.includes(i))
          if (matched.length) acc[cat] = matched
          return acc
        }, {}
      )
      const categoryStr = Object.entries(byCategory)
        .map(([cat, items]) => `[${cat}] ${items.join(', ')}`)
        .join(' / ')
      const customStr = customItem.trim() ? `[직접입력] ${customItem.trim()}` : ''
      parts.push(`품목: ${[categoryStr, customStr].filter(Boolean).join(' / ')}`)
    }
    if (freqCount) parts.push(`방문주기: ${freqUnit} ${freqCount}`)
    return parts.join(' | ')
  }

  async function handleSubmit() {
    if (!form.business_name.trim() || !form.owner_name.trim() || !form.phone.trim() || !form.address.trim()) {
      toast.error('업체명, 이름, 연락처, 주소는 필수 항목입니다.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          service_type: '정기딥케어',
          care_scope: buildCareScope() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '신청 실패')
      setSubmitted(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '신청 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">신청이 완료되었습니다!</h2>
        <p className="text-gray-500 text-sm leading-relaxed">
          담당자가 확인 후 영업일 기준 1일 이내<br />연락드리겠습니다.
        </p>
        <p className="mt-6 text-xs text-gray-400">문의: 031-759-4877</p>
      </div>
    )
  }

  return (
    <>
      <Toaster position="top-center" />
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="bg-gradient-to-br from-brand-400 to-brand-600 text-white rounded-2xl p-5 shadow-soft">
          <p className="text-xs font-medium text-white/70 mb-1">온라인 신청서</p>
          <h1 className="text-xl font-black leading-tight">정기 딥케어</h1>
          <p className="text-white/80 text-xs mt-2 leading-relaxed">
            주방 설비 전문 정기 딥클리닝 서비스입니다.<br />
            후드·덕트·냉장설비·위생환경 설비를 정기 관리합니다.
          </p>
        </div>

        {/* 기본 정보 */}
        <section className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
          <h2 className="font-bold text-gray-900 text-base">기본 정보</h2>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              업체명 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.business_name}
              onChange={e => setField('business_name', e.target.value)}
              placeholder="예) 홍길동카페"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              이름 / 담당자명 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.owner_name}
              onChange={e => setField('owner_name', e.target.value)}
              placeholder="홍길동"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              연락처 <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setField('phone', e.target.value)}
              placeholder="010-0000-0000"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              주소 (매장 위치) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.address}
              onChange={e => setField('address', e.target.value)}
              placeholder="경기도 성남시..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">이메일 (선택)</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setField('email', e.target.value)}
              placeholder="email@example.com"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
            />
          </div>
        </section>

        {/* 업종 */}
        <section className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
          <h2 className="font-bold text-gray-900 text-base">업종</h2>
          <div className="flex flex-wrap gap-2">
            {BUSINESS_TYPES.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => toggleBizType(t)}
                className={`px-3.5 py-2 rounded-full text-sm font-medium border transition-all ${
                  businessTypes.includes(t)
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-brand-400'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {businessTypes.includes('기타') && (
            <input
              type="text"
              value={customBizType}
              onChange={e => setCustomBizType(e.target.value)}
              placeholder="예) 병원, 미용실, 학원 등 업종을 입력하세요"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
            />
          )}
        </section>

        {/* 청소 품목 */}
        <section className="bg-white rounded-2xl p-5 shadow-sm space-y-5">
          <div>
            <h2 className="font-bold text-gray-900 text-base">청소 품목</h2>
            <p className="text-xs text-gray-400 mt-0.5">해당하는 설비를 모두 선택하세요</p>
          </div>
          {(Object.entries(ITEMS) as [ItemCategory, string[]][]).map(([cat, items]) => {
            const labelColor = cat === '주방조리설비'
              ? 'text-rose-400'
              : cat === '냉장냉동설비'
              ? 'text-brand-500'
              : 'text-emerald-400'
            return (
              <div key={cat}>
                <p className={`text-xs font-bold uppercase tracking-wider mb-2.5 ${labelColor}`}>
                  {cat}
                </p>
                <div className="flex flex-wrap gap-2">
                  {items.map(item => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleItem(item)}
                      className={`px-3.5 py-2 rounded-full text-sm font-medium border transition-all ${
                        selectedItems.includes(item)
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-brand-400'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          {/* 직접입력 */}
          <div>
            <button
              type="button"
              onClick={() => setShowCustomItem(v => !v)}
              className={`px-3.5 py-2 rounded-full text-sm font-medium border transition-all ${
                showCustomItem
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-brand-400'
              }`}
            >
              직접입력
            </button>
            {showCustomItem && (
              <input
                type="text"
                value={customItem}
                onChange={e => setCustomItem(e.target.value)}
                placeholder="목록에 없는 설비를 직접 입력하세요"
                className="mt-2.5 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
              />
            )}
          </div>
        </section>

        {/* 방문 주기 */}
        <section className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
          <h2 className="font-bold text-gray-900 text-base">방문 주기</h2>
          <div className="flex gap-3 items-center">
            <div className="flex border border-gray-200 rounded-xl overflow-hidden">
              {FREQ_UNITS.map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setFreqUnit(u)}
                  className={`px-4 py-2.5 text-sm font-medium transition-all ${
                    freqUnit === u ? 'bg-brand-600 text-white' : 'bg-white text-gray-600'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {FREQ_COUNTS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFreqCount(c)}
                  className={`px-3.5 py-2 rounded-full text-sm font-medium border transition-all ${
                    freqCount === c
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-brand-400'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          {freqUnit && freqCount && (
            <p className="text-xs text-brand-700 font-medium">
              선택: {freqUnit} {freqCount}
            </p>
          )}
        </section>

        {/* 특이사항 */}
        <section className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
          <h2 className="font-bold text-gray-900 text-base">특이사항 · 요청사항</h2>
          <textarea
            value={form.request_notes}
            onChange={e => setField('request_notes', e.target.value)}
            placeholder="설비 노후도, 특수 재질, 접근 방법, 기타 요청 등 자유롭게 적어주세요"
            rows={4}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent resize-none"
          />
        </section>

        {/* 제출 버튼 */}
        <div className="pb-6">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-4 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-2xl text-base disabled:opacity-60 active:scale-[0.98] transition-all shadow-soft"
          >
            {loading ? '신청 중...' : '신청하기'}
          </button>
          <p className="text-center text-xs text-gray-400 mt-3">
            담당자가 영업일 기준 1일 이내 연락드립니다
          </p>
        </div>
      </div>
    </>
  )
}
