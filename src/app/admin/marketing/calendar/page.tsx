'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface DayData {
  blog: boolean
  insta: boolean
  region?: string
  item?: string
  status?: string
}

export default function MarketingCalendarPage() {
  const supabase = createClient()
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth()) // 0-indexed
  const [dayMap, setDayMap] = useState<Record<string, DayData>>({})
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  useEffect(() => { load() }, [year, month])

  async function load() {
    setLoading(true)
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const to = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`

    const { data: runs } = await supabase
      .from('marketing_runs')
      .select('run_date,region,item,status')
      .gte('run_date', from)
      .lte('run_date', to)

    const { data: contents } = await supabase
      .from('marketing_content')
      .select('content_type,created_at')
      .gte('created_at', from)
      .lte('created_at', to + 'T23:59:59')

    const map: Record<string, DayData> = {}

    for (const run of runs ?? []) {
      map[run.run_date] = { blog: false, insta: false, region: run.region, item: run.item, status: run.status }
    }
    for (const c of contents ?? []) {
      const d = c.created_at.slice(0, 10)
      if (!map[d]) map[d] = { blog: false, insta: false }
      if (c.content_type === 'blog') map[d].blog = true
      if (c.content_type === 'insta') map[d].insta = true
    }

    setDayMap(map)
    setLoading(false)
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const firstDay = new Date(year, month, 1).getDay() // 0=일
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date().toISOString().slice(0, 10)
  const DAYS = ['일', '월', '화', '수', '목', '금', '토']

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const selectedData = selectedDate ? dayMap[selectedDate] : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">콘텐츠 캘린더</h1>
        <p className="text-sm text-gray-500 mt-0.5">월별 콘텐츠 발행 현황</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        {/* 월 네비게이션 */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">‹</button>
          <h2 className="text-lg font-bold text-gray-900">
            {year}년 {month + 1}월
          </h2>
          <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">›</button>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 mb-2">
          {DAYS.map((d, i) => (
            <div key={d} className={`text-center text-xs font-semibold py-2 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 그리드 */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, idx) => {
              if (!day) return <div key={idx} />
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const data = dayMap[dateStr]
              const isToday = dateStr === today
              const isSelected = dateStr === selectedDate
              const dow = (firstDay + day - 1) % 7

              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={`relative flex flex-col items-center p-2 rounded-xl transition-all min-h-[60px] ${
                    isSelected ? 'bg-brand-600 text-white ring-2 ring-brand-400'
                    : isToday ? 'bg-brand-50 ring-2 ring-brand-300'
                    : data ? 'bg-gray-50 hover:bg-gray-100'
                    : 'hover:bg-gray-50'
                  }`}
                >
                  <span className={`text-sm font-semibold ${
                    isSelected ? 'text-white'
                    : dow === 0 ? 'text-red-400'
                    : dow === 6 ? 'text-blue-400'
                    : 'text-gray-700'
                  }`}>{day}</span>
                  {data && (
                    <div className="flex gap-0.5 mt-1">
                      {data.blog && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-brand-500'}`} />}
                      {data.insta && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-pink-200' : 'bg-pink-400'}`} />}
                    </div>
                  )}
                  {data?.status === 'failed' && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-400" />
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* 범례 */}
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-brand-500" /><span className="text-xs text-gray-500">블로그</span></div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-pink-400" /><span className="text-xs text-gray-500">인스타</span></div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400" /><span className="text-xs text-gray-500">오류</span></div>
        </div>
      </div>

      {/* 선택된 날짜 상세 */}
      {selectedDate && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-900 mb-3">
            {new Date(selectedDate).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
          </h3>
          {selectedData ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">지역/품목</span>
                <span className="font-semibold text-gray-900">{selectedData.region} {selectedData.item}</span>
              </div>
              <div className="flex gap-2">
                <span className={`text-xs px-2 py-1 rounded-full ${selectedData.blog ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-400'}`}>
                  📝 블로그 {selectedData.blog ? '생성됨' : '미생성'}
                </span>
                <span className={`text-xs px-2 py-1 rounded-full ${selectedData.insta ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-400'}`}>
                  📸 인스타 {selectedData.insta ? '생성됨' : '미생성'}
                </span>
              </div>
              <a
                href={`/admin/marketing/today?date=${selectedDate}`}
                className="inline-flex items-center gap-1 text-sm text-brand-600 font-semibold hover:underline mt-1"
              >
                콘텐츠 보기 →
              </a>
            </div>
          ) : (
            <p className="text-sm text-gray-400">이 날짜에 생성된 콘텐츠가 없어요</p>
          )}
        </div>
      )}
    </div>
  )
}
