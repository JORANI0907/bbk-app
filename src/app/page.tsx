'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'

const ELEVATOR_OPTIONS = ['있음', '없음', '해당없음']
const BUILDING_ACCESS_OPTIONS = ['신청필요', '신청불필요', '해당없음']
const PARKING_OPTIONS = ['가능', '불가능', '주차없음']
const PAYMENT_OPTIONS = ['현금', '카드', '계좌이체', '현금(부가세 X)']

export default function ApplicationForm() {
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    ownerName: '',
    platformNickname: '',
    phone: '',
    email: '',
    businessName: '',
    businessNumber: '',
    address: '',
    businessHoursStart: '09:00',
    businessHoursEnd: '18:00',
    elevator: '없음',
    buildingAccess: '신청불필요',
    accessMethod: '',
    parking: '가능',
    paymentMethod: '계좌이체',
    accountNumber: '',
    requestNotes: '',
    privacyConsent: false,
    serviceConsent: false,
  })

  const set = (field: string, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.privacyConsent || !form.serviceConsent) {
      toast.error('개인정보 수집 및 서비스 이용에 동의해주세요.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/webhooks/application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          timestamp: new Date().toISOString(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '신청 실패')
      setSubmitted(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '신청 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">신청이 완료되었습니다!</h2>
          <p className="text-gray-500 text-sm mb-6">담당자 확인 후 연락드리겠습니다.<br />문의: 031-759-4877</p>
          <button
            onClick={() => {
              setSubmitted(false)
              setForm(f => ({ ...f, ownerName: '', phone: '', businessName: '', address: '', privacyConsent: false, serviceConsent: false }))
            }}
            className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
          >
            추가 신청하기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">B</span>
          </div>
          <div>
            <h1 className="font-bold text-gray-900 text-sm">BBK 공간케어</h1>
            <p className="text-xs text-gray-400">서비스 신청</p>
          </div>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 py-6 space-y-5 pb-24">
        {/* 기본 정보 */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-4">기본 정보 <span className="text-red-400 text-xs">* 필수</span></h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">대표자명 *</label>
              <input required value={form.ownerName} onChange={e => set('ownerName', e.target.value)}
                placeholder="홍길동" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">업체명 *</label>
              <input required value={form.businessName} onChange={e => set('businessName', e.target.value)}
                placeholder="(주)BBK코리아" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">연락처 *</label>
              <input required type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                placeholder="010-0000-0000" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">주소 *</label>
              <input required value={form.address} onChange={e => set('address', e.target.value)}
                placeholder="경기도 용인시 ..." className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">이메일</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                placeholder="example@email.com" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">플랫폼 닉네임 (네이버/카카오 등)</label>
              <input value={form.platformNickname} onChange={e => set('platformNickname', e.target.value)}
                placeholder="홍길동_사장" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">사업자번호</label>
              <input value={form.businessNumber} onChange={e => set('businessNumber', e.target.value)}
                placeholder="000-00-00000" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </section>

        {/* 매장 환경 */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-4">매장 환경</h2>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-2 block">영업시간</label>
              <div className="flex items-center gap-2">
                <input type="time" value={form.businessHoursStart} onChange={e => set('businessHoursStart', e.target.value)}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <span className="text-gray-400 text-sm">~</span>
                <input type="time" value={form.businessHoursEnd} onChange={e => set('businessHoursEnd', e.target.value)}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            {([
              { label: '엘리베이터', field: 'elevator', options: ELEVATOR_OPTIONS },
              { label: '건물 출입', field: 'buildingAccess', options: BUILDING_ACCESS_OPTIONS },
              { label: '주차', field: 'parking', options: PARKING_OPTIONS },
            ] as Array<{ label: string; field: keyof typeof form; options: string[] }>).map(({ label, field, options }) => (
              <div key={field}>
                <label className="text-xs font-medium text-gray-500 mb-2 block">{label}</label>
                <div className="flex gap-2 flex-wrap">
                  {options.map(opt => (
                    <button type="button" key={opt} onClick={() => set(field, opt)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${form[field] === opt ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">출입 방법</label>
              <input value={form.accessMethod} onChange={e => set('accessMethod', e.target.value)}
                placeholder="비밀번호 1234 / 관리사무소 방문 등" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </section>

        {/* 결제 정보 */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-4">결제 정보</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-2 block">결제 방법</label>
              <div className="flex gap-2 flex-wrap">
                {PAYMENT_OPTIONS.map(opt => (
                  <button type="button" key={opt} onClick={() => set('paymentMethod', opt)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${form.paymentMethod === opt ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">계좌번호</label>
              <input value={form.accountNumber} onChange={e => set('accountNumber', e.target.value)}
                placeholder="은행명 000-0000-0000" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </section>

        {/* 요청사항 */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-4">요청사항</h2>
          <textarea value={form.requestNotes} onChange={e => set('requestNotes', e.target.value)}
            rows={4} placeholder="서비스 관련 특이사항이나 요청사항을 자유롭게 입력해주세요."
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </section>

        {/* 동의 */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3">
          <h2 className="font-bold text-gray-900 mb-1">약관 동의</h2>
          {([
            { field: 'privacyConsent', label: '[필수] 개인정보 수집 및 이용에 동의합니다.' },
            { field: 'serviceConsent', label: '[필수] 서비스 이용 약관에 동의합니다.' },
          ] as Array<{ field: keyof typeof form; label: string }>).map(({ field, label }) => (
            <label key={field} className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form[field] as boolean}
                onChange={e => set(field, e.target.checked)}
                className="w-4 h-4 rounded accent-blue-600" />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}
        </section>

        {/* 제출 버튼 */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4">
          <div className="max-w-2xl mx-auto">
            <button type="submit" disabled={loading}
              className="w-full py-4 bg-blue-600 text-white font-bold text-base rounded-2xl hover:bg-blue-700 disabled:opacity-60 transition-colors">
              {loading ? '신청 중...' : '서비스 신청하기'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
