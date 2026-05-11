'use client'

import { useState } from 'react'
import { Search, MapPin, X } from 'lucide-react'

interface JusoItem {
  roadAddr: string
  jibunAddr: string
  zipNo: string
}

interface AddressSearchProps {
  type: 'bbk' | 'quote'
  roadAddress: string
  detailAddress: string
  onRoadChange: (v: string) => void
  onDetailChange: (v: string) => void
  error?: string
  inputCls: string
  errorCls: string
}

export function AddressSearch({
  type,
  roadAddress,
  detailAddress,
  onRoadChange,
  onDetailChange,
  error,
  inputCls,
  errorCls,
}: AddressSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<JusoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)

  const search = async () => {
    if (!query.trim()) return
    setLoading(true)
    setShowResults(false)
    try {
      const res = await fetch(`/api/juso?keyword=${encodeURIComponent(query)}&type=${type}`)
      const data = await res.json()
      setResults(data.results?.juso ?? [])
      setShowResults(true)
    } finally {
      setLoading(false)
    }
  }

  const select = (item: JusoItem) => {
    onRoadChange(item.roadAddr)
    setQuery(item.roadAddr)
    setShowResults(false)
    setResults([])
  }

  const reset = () => {
    onRoadChange('')
    onDetailChange('')
    setQuery('')
    setShowResults(false)
    setResults([])
  }

  return (
    <div className="space-y-2">
      {/* 검색 입력 + 버튼 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            className={inputCls}
            placeholder="도로명·지번·건물명으로 검색"
            value={query}
            onChange={e => { setQuery(e.target.value); if (roadAddress) reset() }}
            onKeyDown={e => e.key === 'Enter' && search()}
          />
          {roadAddress && (
            <button
              type="button"
              onClick={reset}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={search}
          disabled={loading || !query.trim()}
          className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap transition-colors"
        >
          <Search size={14} />
          {loading ? '검색 중…' : '검색'}
        </button>
      </div>

      {/* 검색 결과 목록 */}
      {showResults && (
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-lg bg-white max-h-52 overflow-y-auto">
          {results.length > 0 ? results.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => select(item)}
              className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-slate-100 last:border-0 transition-colors"
            >
              <div className="flex items-start gap-2">
                <MapPin size={13} className="text-blue-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-800 break-keep">{item.roadAddr}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{item.jibunAddr}{item.zipNo && ` (${item.zipNo})`}</p>
                </div>
              </div>
            </button>
          )) : (
            <p className="text-sm text-slate-400 px-4 py-4 text-center">검색 결과가 없습니다.</p>
          )}
        </div>
      )}

      {/* 상세 주소 입력 — 도로명 선택 후 표시 */}
      {roadAddress && (
        <input
          className={errorCls}
          placeholder="상세 주소 입력 (동, 층, 호수 등)"
          value={detailAddress}
          onChange={e => onDetailChange(e.target.value)}
          autoFocus
        />
      )}

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
