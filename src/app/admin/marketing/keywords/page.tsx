'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Keyword {
  id: string
  region: string
  item: string
  is_used: boolean
  used_date: string | null
}

const PRIORITY_REGIONS = ['잠실', '판교', '분당', '홍대', '마포', '이태원', '신촌', '종로', '영등포', '일산', '인천', '김포']
const ALL_ITEMS = ['후드', '주방', '바닥', '에어컨', '유리', '준공청소', '덕트', '식당']

export default function KeywordsPage() {
  const supabase = createClient()
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'matrix' | 'list'>('matrix')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('marketing_keywords')
      .select('*')
      .order('region')
    setKeywords(data ?? [])
    setLoading(false)
  }

  // 지역 목록 (데이터 기반)
  const allRegions = Array.from(new Set(keywords.map(k => k.region))).sort((a, b) => {
    const ai = PRIORITY_REGIONS.indexOf(a)
    const bi = PRIORITY_REGIONS.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b)
  })

  // 품목 목록 (데이터 기반)
  const allItems = Array.from(new Set(keywords.map(k => k.item)))

  // 매트릭스용 맵
  const keyMap = new Map(keywords.map(k => [`${k.region}::${k.item}`, k]))

  const used = keywords.filter(k => k.is_used)
  const unused = keywords.filter(k => !k.is_used)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">키워드 전략</h1>
          <p className="text-sm text-gray-500 mt-0.5">지역 × 품목 사용 현황</p>
        </div>
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          <button onClick={() => setViewMode('matrix')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${viewMode === 'matrix' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>매트릭스</button>
          <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>목록</button>
        </div>
      </div>

      {/* 요약 */}
      <div className="flex gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-3 flex items-center gap-3">
          <span className="text-2xl font-bold text-gray-900">{used.length}</span>
          <div><p className="text-xs text-gray-400">사용완료</p><p className="text-xs text-gray-300">키워드 조합</p></div>
        </div>
        <div className="bg-blue-50 rounded-2xl border border-blue-100 shadow-sm px-5 py-3 flex items-center gap-3">
          <span className="text-2xl font-bold text-blue-600">{unused.length}</span>
          <div><p className="text-xs text-blue-500">미사용</p><p className="text-xs text-blue-300">사용 가능한 조합</p></div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-3 flex items-center gap-3">
          <span className="text-2xl font-bold text-gray-900">{allRegions.length}</span>
          <div><p className="text-xs text-gray-400">지역 수</p></div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : viewMode === 'matrix' ? (
        /* 매트릭스 뷰 */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left text-xs font-semibold text-gray-500 min-w-[80px]">지역 ↓ 품목 →</th>
                  {allItems.map(item => (
                    <th key={item} className="px-3 py-3 text-xs font-semibold text-gray-500 text-center whitespace-nowrap">{item}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allRegions.map((region, ri) => {
                  const regionUsed = keywords.filter(k => k.region === region && k.is_used).length
                  const regionTotal = keywords.filter(k => k.region === region).length
                  const allUsed = regionTotal > 0 && regionUsed === regionTotal

                  return (
                    <tr key={region} className={`border-b border-gray-50 ${allUsed ? 'bg-gray-50' : ri % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                      <td className="sticky left-0 bg-inherit px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {region}
                          {PRIORITY_REGIONS.slice(0, 6).includes(region) && !allUsed && (
                            <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-semibold">추천</span>
                          )}
                        </div>
                      </td>
                      {allItems.map(item => {
                        const kw = keyMap.get(`${region}::${item}`)
                        if (!kw) return (
                          <td key={item} className="px-3 py-3 text-center">
                            <span className="text-gray-200 text-base">—</span>
                          </td>
                        )
                        return (
                          <td key={item} className="px-3 py-3 text-center">
                            {kw.is_used ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="text-green-500 text-base">✅</span>
                                {kw.used_date && <span className="text-xs text-gray-300">{kw.used_date.slice(5)}</span>}
                              </div>
                            ) : (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-500 text-xs font-bold">✦</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-4 px-5 py-3 border-t border-gray-100 bg-gray-50">
            <div className="flex items-center gap-1.5"><span className="text-green-500 text-sm">✅</span><span className="text-xs text-gray-500">사용완료</span></div>
            <div className="flex items-center gap-1.5"><span className="text-blue-500 text-sm">✦</span><span className="text-xs text-gray-500">미사용 (사용 가능)</span></div>
            <div className="flex items-center gap-1.5"><span className="text-gray-300 text-sm">—</span><span className="text-xs text-gray-500">데이터 없음</span></div>
            <div className="flex items-center gap-1.5"><span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-semibold">추천</span><span className="text-xs text-gray-500">우선순위 지역</span></div>
          </div>
        </div>
      ) : (
        /* 목록 뷰 */
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-blue-600 mb-2">🔵 미사용 키워드 ({unused.length}개)</h2>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="divide-y divide-gray-50">
                {unused.length === 0 ? (
                  <p className="text-center py-8 text-gray-400">모든 키워드를 사용했어요!</p>
                ) : unused.map(k => (
                  <div key={k.id} className="flex items-center px-5 py-3 gap-3">
                    <span className="text-blue-400 font-bold">✦</span>
                    <span className="font-semibold text-gray-800">{k.region}</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-600">{k.item}</span>
                    {PRIORITY_REGIONS.slice(0, 6).includes(k.region) && (
                      <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold ml-auto">우선추천</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-400 mb-2">✅ 사용완료 ({used.length}개)</h2>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="divide-y divide-gray-50">
                {used.map(k => (
                  <div key={k.id} className="flex items-center px-5 py-3 gap-3">
                    <span className="text-green-500">✅</span>
                    <span className="font-medium text-gray-600">{k.region}</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-500">{k.item}</span>
                    {k.used_date && <span className="text-xs text-gray-300 ml-auto">{k.used_date}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
