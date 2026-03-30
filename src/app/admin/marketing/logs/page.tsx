'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Run {
  id: string
  run_date: string
  status: string
  region: string | null
  item: string | null
  trigger_type: string
  started_at: string | null
  finished_at: string | null
  duration_sec: number | null
  error_message: string | null
  created_at: string
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: string }> = {
    success: { label: '성공', cls: 'bg-green-100 text-green-700', icon: '✅' },
    partial: { label: '부분성공', cls: 'bg-yellow-100 text-yellow-700', icon: '⚠️' },
    failed:  { label: '실패', cls: 'bg-red-100 text-red-700', icon: '❌' },
    running: { label: '실행중', cls: 'bg-blue-100 text-blue-700', icon: '⏳' },
    pending: { label: '대기', cls: 'bg-gray-100 text-gray-500', icon: '⏸' },
  }
  const { label, cls, icon } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500', icon: '?' }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}>
      {icon} {label}
    </span>
  )
}

function formatDuration(sec: number | null) {
  if (!sec) return '-'
  if (sec < 60) return `${sec}초`
  return `${Math.floor(sec / 60)}분 ${sec % 60}초`
}

export default function MarketingLogsPage() {
  const supabase = createClient()
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => { load() }, [statusFilter])

  async function load() {
    setLoading(true)
    let q = supabase
      .from('marketing_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (statusFilter !== 'all') q = q.eq('status', statusFilter)
    const { data } = await q
    setRuns(data ?? [])
    setLoading(false)
  }

  const successCount = runs.filter(r => r.status === 'success').length
  const failCount = runs.filter(r => r.status === 'failed').length
  const avgDuration = runs.filter(r => r.duration_sec).length > 0
    ? Math.round(runs.filter(r => r.duration_sec).reduce((s, r) => s + (r.duration_sec ?? 0), 0) / runs.filter(r => r.duration_sec).length)
    : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">실행 로그</h1>
        <p className="text-sm text-gray-500 mt-0.5">콘텐츠 자동 생성 이력 및 오류 확인</p>
      </div>

      {/* 요약 */}
      <div className="flex gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-3 flex items-center gap-3">
          <span className="text-2xl font-bold text-gray-900">{runs.length}</span>
          <p className="text-xs text-gray-400">전체 실행</p>
        </div>
        <div className="bg-green-50 rounded-2xl border border-green-100 shadow-sm px-5 py-3 flex items-center gap-3">
          <span className="text-2xl font-bold text-green-600">{successCount}</span>
          <p className="text-xs text-green-500">성공</p>
        </div>
        {failCount > 0 && (
          <div className="bg-red-50 rounded-2xl border border-red-100 shadow-sm px-5 py-3 flex items-center gap-3">
            <span className="text-2xl font-bold text-red-600">{failCount}</span>
            <p className="text-xs text-red-500">실패</p>
          </div>
        )}
        {avgDuration && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-3 flex items-center gap-3">
            <span className="text-2xl font-bold text-gray-900">{formatDuration(avgDuration)}</span>
            <p className="text-xs text-gray-400">평균 소요</p>
          </div>
        )}
      </div>

      {/* 필터 */}
      <div className="flex gap-2">
        {['all', 'success', 'partial', 'failed', 'running'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
              statusFilter === s ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'
            }`}
          >
            {s === 'all' ? '전체' : s === 'success' ? '✅ 성공' : s === 'partial' ? '⚠️ 부분' : s === 'failed' ? '❌ 실패' : '⏳ 실행중'}
          </button>
        ))}
      </div>

      {/* 로그 목록 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-gray-400">실행 기록이 없어요</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {runs.map(run => (
              <div key={run.id}>
                <button
                  onClick={() => setExpandedId(expandedId === run.id ? null : run.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 text-left transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-sm font-semibold text-gray-800">
                        {new Date(run.run_date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
                      </span>
                      {run.region && run.item && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{run.region} · {run.item}</span>
                      )}
                      <span className="text-xs text-gray-300">{run.trigger_type === 'manual' ? '수동' : '자동'}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                      {run.started_at && (
                        <span className="text-xs text-gray-400">
                          {new Date(run.started_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 시작
                        </span>
                      )}
                      <span className="text-xs text-gray-400">소요 {formatDuration(run.duration_sec)}</span>
                    </div>
                  </div>
                  <StatusBadge status={run.status} />
                  <span className={`text-gray-400 transition-transform text-sm ${expandedId === run.id ? 'rotate-90' : ''}`}>›</span>
                </button>

                {/* 펼쳐보기 */}
                {expandedId === run.id && (
                  <div className="px-5 pb-4 bg-gray-50 border-t border-gray-100">
                    <div className="mt-3 space-y-2 text-xs text-gray-500">
                      <div className="grid grid-cols-2 gap-2">
                        <div><span className="text-gray-400">실행 ID</span><p className="font-mono text-gray-600 mt-0.5 truncate">{run.id}</p></div>
                        <div><span className="text-gray-400">트리거</span><p className="text-gray-600 mt-0.5">{run.trigger_type === 'manual' ? '수동 실행' : 'Make.com 크론'}</p></div>
                        <div><span className="text-gray-400">시작</span><p className="text-gray-600 mt-0.5">{run.started_at ? new Date(run.started_at).toLocaleString('ko-KR') : '-'}</p></div>
                        <div><span className="text-gray-400">완료</span><p className="text-gray-600 mt-0.5">{run.finished_at ? new Date(run.finished_at).toLocaleString('ko-KR') : '-'}</p></div>
                      </div>
                      {run.error_message && (
                        <div className="mt-2">
                          <span className="text-red-500 font-semibold">오류 내용</span>
                          <pre className="mt-1 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs overflow-x-auto whitespace-pre-wrap">
                            {run.error_message}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
