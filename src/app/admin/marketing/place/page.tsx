'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

interface PlaceKpi {
  id?: string
  month: string
  place_views: number | null
  phone_clicks: number | null
  review_count: number | null
  avg_rating: number | null
}

interface Review {
  id: string
  reviewer: string | null
  rating: number
  content: string | null
  review_date: string | null
  is_replied: boolean
  replied_at: string | null
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="text-yellow-400">
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
    </span>
  )
}

function currentYM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function NaverPlacePage() {
  const supabase = createClient()
  const [kpi, setKpi] = useState<PlaceKpi>({ month: currentYM(), place_views: null, phone_clicks: null, review_count: null, avg_rating: null })
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [editingKpi, setEditingKpi] = useState(false)
  const [showAddReview, setShowAddReview] = useState(false)
  const [newReview, setNewReview] = useState({ reviewer: '', rating: 5, content: '', review_date: new Date().toISOString().slice(0, 10) })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const ym = currentYM()

    const { data: k } = await supabase
      .from('marketing_kpi')
      .select('*')
      .eq('channel', 'place')
      .eq('metric_date', ym + '-01')
      .single()

    const { data: r } = await supabase
      .from('marketing_place_reviews')
      .select('*')
      .order('review_date', { ascending: false })

    if (k) setKpi({ id: k.id, month: ym, place_views: k.place_views, phone_clicks: k.phone_clicks, review_count: k.review_count, avg_rating: k.avg_rating })
    setReviews(r ?? [])
    setLoading(false)
  }

  async function saveKpi() {
    if (kpi.id) {
      await supabase.from('marketing_kpi').update({
        place_views: kpi.place_views,
        phone_clicks: kpi.phone_clicks,
        review_count: kpi.review_count,
        avg_rating: kpi.avg_rating,
      }).eq('id', kpi.id)
    } else {
      await supabase.from('marketing_kpi').insert({
        channel: 'place',
        metric_date: kpi.month + '-01',
        place_views: kpi.place_views,
        phone_clicks: kpi.phone_clicks,
        review_count: kpi.review_count,
        avg_rating: kpi.avg_rating,
      })
    }
    toast.success('저장됐어요!')
    setEditingKpi(false)
    load()
  }

  async function addReview() {
    await supabase.from('marketing_place_reviews').insert(newReview)
    toast.success('리뷰가 추가됐어요!')
    setShowAddReview(false)
    setNewReview({ reviewer: '', rating: 5, content: '', review_date: new Date().toISOString().slice(0, 10) })
    load()
  }

  async function toggleReply(review: Review) {
    await supabase.from('marketing_place_reviews').update({
      is_replied: !review.is_replied,
      replied_at: !review.is_replied ? new Date().toISOString() : null,
    }).eq('id', review.id)
    toast.success(!review.is_replied ? '답글 완료로 표시했어요!' : '답글 취소했어요')
    load()
  }

  const unreplied = reviews.filter(r => !r.is_replied).length
  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : '-'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">네이버 플레이스</h1>
          <p className="text-sm text-gray-500 mt-0.5">조회수, 전화 연결, 리뷰 관리</p>
        </div>
        {unreplied > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-xl">
            <span className="text-red-500 font-bold text-sm">!</span>
            <span className="text-sm text-red-700 font-semibold">미답글 {unreplied}개</span>
          </div>
        )}
      </div>

      {/* 이번 달 KPI */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">이번 달 현황 ({kpi.month})</h2>
          {!editingKpi
            ? <button onClick={() => setEditingKpi(true)} className="text-xs text-brand-600 font-semibold hover:underline">수치 입력</button>
            : <div className="flex gap-2">
                <button onClick={saveKpi} className="px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg">저장</button>
                <button onClick={() => setEditingKpi(false)} className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg">취소</button>
              </div>
          }
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { key: 'place_views', label: '플레이스 조회', unit: '회', target: '월 500+' },
            { key: 'phone_clicks', label: '전화 연결', unit: '건', target: '월 10+' },
            { key: 'review_count', label: '리뷰 수 (누적)', unit: '개', target: '' },
            { key: 'avg_rating', label: '평균 별점', unit: '★', target: '4.8+' },
          ].map(({ key, label, unit, target }) => (
            <div key={key} className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">{label}</p>
              {editingKpi ? (
                <input
                  type="number"
                  step={key === 'avg_rating' ? '0.1' : '1'}
                  value={(kpi as unknown as Record<string, number | null | string>)[key] ?? ''}
                  onChange={e => setKpi(k => ({ ...k, [key]: e.target.value ? parseFloat(e.target.value) : null }))}
                  className="w-full text-lg font-bold border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
              ) : (
                <p className="text-xl font-bold text-gray-900">
                  {(kpi as unknown as Record<string, number | null | string>)[key] ?? '-'}{(kpi as unknown as Record<string, number | null | string>)[key] ? unit : ''}
                </p>
              )}
              {target && <p className="text-xs text-gray-400 mt-1">목표: {target}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* 리뷰 관리 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-800">리뷰 관리</h2>
            <p className="text-xs text-gray-400 mt-0.5">평균 별점 {avgRating}★ · 총 {reviews.length}개</p>
          </div>
          <button
            onClick={() => setShowAddReview(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-brand-600 text-white text-xs font-semibold rounded-xl hover:bg-brand-700"
          >
            + 리뷰 추가
          </button>
        </div>

        {/* 리뷰 추가 폼 */}
        {showAddReview && (
          <div className="px-5 py-4 bg-blue-50 border-b border-blue-100">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs text-gray-500 block mb-1">고객명</label>
                <input value={newReview.reviewer} onChange={e => setNewReview(r => ({ ...r, reviewer: e.target.value }))} className="w-24 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none" placeholder="김**" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">별점</label>
                <select value={newReview.rating} onChange={e => setNewReview(r => ({ ...r, rating: +e.target.value }))} className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none">
                  {[5,4,3,2,1].map(n => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-48">
                <label className="text-xs text-gray-500 block mb-1">내용</label>
                <input value={newReview.content} onChange={e => setNewReview(r => ({ ...r, content: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none" placeholder="리뷰 내용" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">날짜</label>
                <input type="date" value={newReview.review_date} onChange={e => setNewReview(r => ({ ...r, review_date: e.target.value }))} className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={addReview} className="px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg">추가</button>
                <button onClick={() => setShowAddReview(false)} className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg">취소</button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><div className="w-7 h-7 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-12 text-gray-400">아직 등록된 리뷰가 없어요</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {reviews.map(r => (
              <div key={r.id} className={`px-5 py-4 ${!r.is_replied ? 'bg-red-50' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-800">{r.reviewer ?? '익명'}</span>
                      <StarRating rating={r.rating} />
                      {r.review_date && <span className="text-xs text-gray-400">{r.review_date}</span>}
                      {!r.is_replied && (
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">답글 필요</span>
                      )}
                    </div>
                    {r.content && <p className="text-sm text-gray-600 mt-1">{r.content}</p>}
                  </div>
                  <button
                    onClick={() => toggleReply(r)}
                    className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                      r.is_replied
                        ? 'bg-green-100 text-green-700 hover:bg-gray-100 hover:text-gray-500'
                        : 'bg-red-100 text-red-600 hover:bg-green-100 hover:text-green-700'
                    }`}
                  >
                    {r.is_replied ? '✅ 답글완료' : '답글하기'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
