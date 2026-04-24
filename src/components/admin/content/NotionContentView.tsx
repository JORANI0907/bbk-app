'use client'

import { useState, useEffect, useCallback } from 'react'
import type { NotionPage, NotionPropValue } from '@/lib/notion-content'

// ─── 타입 ─────────────────────────────────────────────────────

export interface ContentColumn {
  key: string
  label: string
  type?: 'badge' | 'tag-list' | 'url' | 'date' | 'price' | 'text'
  width?: string
}

interface Props {
  dbKey: string
  title: string
  emoji: string
  columns: ContentColumn[]
  filterProp?: string
  filterOptions?: string[]
}

// ─── 셀 렌더러 ────────────────────────────────────────────────

const VISIBILITY_COLORS: Record<string, string> = {
  public_web: 'bg-blue-100 text-blue-700',
  public_app: 'bg-green-100 text-green-700',
  internal_app: 'bg-yellow-100 text-yellow-700',
  draft: 'bg-gray-100 text-gray-600',
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  normal: 'bg-gray-100 text-gray-600',
  low: 'bg-slate-100 text-slate-500',
}

function renderCell(value: NotionPropValue, type?: ContentColumn['type']): React.ReactNode {
  if (value === null || value === undefined) return <span className="text-gray-300">—</span>

  if (type === 'tag-list' && Array.isArray(value)) {
    if (value.length === 0) return <span className="text-gray-300">—</span>
    return (
      <div className="flex flex-wrap gap-1">
        {value.map((tag, i) => (
          <span key={i} className="px-1.5 py-0.5 text-xs bg-brand-50 text-brand-700 rounded-full">
            {tag}
          </span>
        ))}
      </div>
    )
  }

  if (type === 'badge' && typeof value === 'string') {
    const colorClass =
      VISIBILITY_COLORS[value] ?? PRIORITY_COLORS[value] ?? 'bg-gray-100 text-gray-700'
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colorClass}`}>
        {value}
      </span>
    )
  }

  if (type === 'url' && typeof value === 'string') {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand-600 hover:underline truncate max-w-[140px] block text-xs"
      >
        링크 열기 ↗
      </a>
    )
  }

  if (type === 'price' && typeof value === 'number') {
    return <span className="font-medium text-gray-800">{value.toLocaleString()}원</span>
  }

  if (type === 'date' && typeof value === 'string') {
    return <span className="text-sm text-gray-600 whitespace-nowrap">{value.slice(0, 10)}</span>
  }

  const str = Array.isArray(value) ? value.join(', ') : String(value)
  return (
    <span className="text-sm text-gray-700 line-clamp-2" title={str}>
      {str}
    </span>
  )
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────

export function NotionContentView({ dbKey, title, emoji, columns, filterProp, filterOptions }: Props) {
  const [items, setItems] = useState<NotionPage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('전체')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/content?db=${encodeURIComponent(dbKey)}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? '조회 실패')
      }
      const data = await res.json()
      setItems(data.items)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류')
    } finally {
      setLoading(false)
    }
  }, [dbKey])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const filtered = filterProp && filter !== '전체'
    ? items.filter(item => {
        const val = item.props[filterProp]
        return Array.isArray(val) ? val.includes(filter) : val === filter
      })
    : items

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{emoji}</span>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <span className="text-sm text-gray-500">
            {loading ? '...' : `${filtered.length}개`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-400">
              {lastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 기준
            </span>
          )}
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 disabled:opacity-50 transition-colors"
          >
            {loading ? '⏳' : '🔄'} 새로고침
          </button>
        </div>
      </div>

      {/* 필터 */}
      {filterOptions && filterOptions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {['전체', ...filterOptions].map(opt => (
            <button
              key={opt}
              onClick={() => setFilter(opt)}
              className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                filter === opt
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* 테이블 */}
      {!error && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {columns.map(col => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${col.width ?? ''}`}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                  노션
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin text-2xl">⏳</div>
                      <span>노션에서 불러오는 중...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-12 text-center text-gray-400">
                    항목이 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    {columns.map(col => (
                      <td key={col.key} className="px-4 py-3 align-top">
                        {col.key === '__title'
                          ? <span className="font-medium text-gray-900">{item.title}</span>
                          : renderCell(item.props[col.key], col.type)}
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-brand-600 text-lg"
                        title="노션에서 열기"
                      >
                        ↗
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 노션 바로가기 안내 */}
      {!loading && !error && (
        <p className="text-xs text-gray-400 text-right">
          * 데이터 수정은 노션에서 직접 진행하세요. 앱은 30초마다 자동 갱신됩니다.
        </p>
      )}
    </div>
  )
}
