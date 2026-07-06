'use client'

import { useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'

const BUSINESS_TYPES = ['음식점', '카페', '편의점', '학교/학원', '호텔/숙박', '사무실', '기타']
const VISIT_FREQS = ['주1회', '주2회', '주3회', '주4회', '주5회', '주6회', '주7회']
const OPTIONS = ['화장실 청소', '유리창 청소', '주방 기름때 제거', '쓰레기통 세척', '물때 제거', '바닥 광택']

type AreaUnit = '평' | 'm²'

export default function EndcarePage() {
  const [form, setForm] = useState({
    owner_name: '',
    phone: '',
    address: '',
    email: '',
    request_notes: '',
  })
  const [businessTypes, setBusinessTypes] = useState<string[]>([])
  const [areaValue, setAreaValue] = useState('')
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('평')
  const [visitFreq, setVisitFreq] = useState('')
  const [visitCustom, setVisitCustom] = useState('')
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  function toggleBizType(t: string) {
    setBusinessTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }
  function toggleOption(o: string) {
    setSelectedOptions(prev => prev.includes(o) ? prev.filter(x => x !== o) : [...prev, o])
  }
  function setField(key: keyof typeof form, val: string) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  function buildCareScope() {
    const parts: string[] = []
    if (businessTypes.length) parts.push(`업종: ${businessTypes.join(', ')}`)
    if (areaValue) parts.push(`면적: ${areaValue}${areaUnit}`)
    const freq = visitFreq === '직접입력' ? visitCustom : visitFreq
    if (freq) parts.push(`방문주기: ${freq}`)
    if (selectedOptions.length) parts.push(`선택사항: ${selectedOptions.join(', ')}`)
    return parts.join(' / ')
  }

  async function handleSubmit() {
    if (!form.owner_name.trim() || !form.phone.trim() || !form.address.trim()) {
      toast.error('이름, 연락처, 주소는 필수 항목입니다.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          service_type: '정기엔드케어',
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
          <h1 className="text-xl font-black leading-tight">정기 엔드케어</h1>
          <p className="text-white/80 text-xs mt-2 leading-relaxed">
            매장 영업 후 야간 시간 정기 청소 서비스입니다.<br />
            바닥·화장실·주방 표면 청소를 주기적으로 관리합니다.
          </p>
        </div>

        {/* 기본 정보 */}
        <section className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
          <h2 className="font-bold text-gray-900 text-base">기본 정보</h2>
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
        </section>

        {/* 매장 면적 */}
        <section className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
          <h2 className="font-bold text-gray-900 text-base">매장 면적</h2>
          <div className="flex gap-2">
            <input
              type="number"
              value={areaValue}
              onChange={e => setAreaValue(e.target.value)}
              placeholder="숫자 입력"
              className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
            />
            <div className="flex border border-gray-200 rounded-xl overflow-hidden">
              {(['평', 'm²'] as AreaUnit[]).map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setAreaUnit(u)}
                  className={`px-4 py-3 text-sm font-medium transition-all ${
                    areaUnit === u ? 'bg-brand-600 text-white' : 'bg-white text-gray-600'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* 방문 주기 */}
        <section className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
          <h2 className="font-bold text-gray-900 text-base">방문 주기</h2>
          <div className="flex flex-wrap gap-2">
            {[...VISIT_FREQS, '직접입력'].map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setVisitFreq(f)}
                className={`px-3.5 py-2 rounded-full text-sm font-medium border transition-all ${
                  visitFreq === f
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-brand-400'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          {visitFreq === '직접입력' && (
            <input
              type="text"
              value={visitCustom}
              onChange={e => setVisitCustom(e.target.value)}
              placeholder="예: 격일 1회, 주 1.5회"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
            />
          )}
        </section>

        {/* 선택 사항 */}
        <section className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
          <div>
            <h2 className="font-bold text-gray-900 text-base">선택 사항</h2>
            <p className="text-xs text-gray-400 mt-0.5">추가로 원하시는 항목을 선택하세요</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {OPTIONS.map(o => (
              <button
                key={o}
                type="button"
                onClick={() => toggleOption(o)}
                className={`px-3.5 py-2 rounded-full text-sm font-medium border transition-all ${
                  selectedOptions.includes(o)
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-brand-400'
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </section>

        {/* 특이사항 */}
        <section className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
          <h2 className="font-bold text-gray-900 text-base">특이사항 · 요청사항</h2>
          <textarea
            value={form.request_notes}
            onChange={e => setField('request_notes', e.target.value)}
            placeholder="알레르기, 특수 재질, 접근 방법, 기타 요청 등 자유롭게 적어주세요"
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
            className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-2xl text-base disabled:opacity-60 active:scale-[0.98] transition-all"
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
