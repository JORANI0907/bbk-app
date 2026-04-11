'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

interface BlogContent {
  id: string
  title: string
  region: string
  item: string
  is_published: boolean
  created_at: string
}

interface BlogKpi {
  id?: string
  content_id: string
  view_count: number | null
  like_count: number | null
  comment_count: number | null
  view_tab: boolean
}

function StatCard({ label, value, sub, warn }: { label: string; value: string | number; sub?: string; warn?: boolean }) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 ${warn ? 'border-yellow-200 bg-yellow-50' : 'border-gray-100'}`}>
      <p className="text-xs text-gray-400 font-medium mb-1">{label}</p>
      <p className={`text-2xl font-bold ${warn ? 'text-yellow-700' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function BlogPerformancePage() {
  const supabase = createClient()
  const [contents, setContents] = useState<BlogContent[]>([])
  const [kpiMap, setKpiMap] = useState<Record<string, BlogKpi>>({})
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<BlogKpi>>({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: c } = await supabase
      .from('marketing_content')
      .select('id,title,region,item,is_published,created_at')
      .eq('content_type', 'blog')
      .order('created_at', { ascending: false })
      .limit(30)

    const { data: k } = await supabase
      .from('marketing_kpi')
      .select('*')
      .eq('channel', 'blog')

    const map: Record<string, BlogKpi> = {}
    for (const kpi of k ?? []) map[kpi.content_id] = kpi

    setContents(c ?? [])
    setKpiMap(map)
    setLoading(false)
  }

  function startEdit(content: BlogContent) {
    const existing = kpiMap[content.id]
    setEditingId(content.id)
    setEditForm({
      content_id: content.id,
      view_count: existing?.view_count ?? null,
      like_count: existing?.like_count ?? null,
      comment_count: existing?.comment_count ?? null,
      view_tab: existing?.view_tab ?? false,
    })
  }

  async function saveKpi(contentId: string) {
    const existing = kpiMap[contentId]
    if (existing?.id) {
      await supabase.from('marketing_kpi').update({ ...editForm }).eq('id', existing.id)
    } else {
      await supabase.from('marketing_kpi').insert({ ...editForm, channel: 'blog', content_id: contentId })
    }
    toast.success('KPI 저장됐어요!')
    setEditingId(null)
    load()
  }

  // 통계
  const published = contents.filter(c => c.is_published).length
  const withKpi = contents.filter(c => kpiMap[c.id]).length
  const avgViews = withKpi > 0
    ? Math.round(Object.values(kpiMap).reduce((s, k) => s + (k.view_count ?? 0), 0) / withKpi)
    : 0
  const viewTabCount = Object.values(kpiMap).filter(k => k.view_tab).length
  const lowViews = contents.filter(c => kpiMap[c.id] && (kpiMap[c.id].view_count ?? 0) < 100)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">블로그 성과</h1>
        <p className="text-sm text-gray-500 mt-0.5">네이버 VIEW 노출 및 조회수 추적</p>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="발행된 포스트" value={published} sub={`전체 ${contents.length}편`} />
        <StatCard label="평균 조회수" value={avgViews > 0 ? `${avgViews.toLocaleString()}뷰` : '-'} sub="KPI 입력 기준" />
        <StatCard label="VIEW탭 노출" value={`${viewTabCount}편`} sub={`${withKpi > 0 ? Math.round(viewTabCount/withKpi*100) : 0}%`} />
        <StatCard label="조회수 100↓" value={`${lowViews.length}편`} sub="리라이팅 검토 필요" warn={lowViews.length > 0} />
      </div>

      {/* 포스트 목록 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">포스트 KPI</h2>
          <p className="text-xs text-gray-400 mt-0.5">네이버 블로그 통계에서 수치를 직접 입력하세요</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><div className="w-7 h-7 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : contents.length === 0 ? (
          <div className="text-center py-12 text-gray-400">아직 블로그 포스트가 없어요</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {contents.map(c => {
              const kpi = kpiMap[c.id]
              const isEditing = editingId === c.id
              const views = kpi?.view_count ?? null
              const needsRewrite = views !== null && views < 100

              return (
                <div key={c.id} className={`px-5 py-4 ${needsRewrite ? 'bg-yellow-50' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-800 truncate">{c.title}</p>
                        {needsRewrite && (
                          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">⚠️ 리라이팅 필요</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {c.region} · {c.item} · {new Date(c.created_at).toLocaleDateString('ko-KR')}
                      </p>

                      {!isEditing && kpi && (
                        <div className="flex items-center gap-4 mt-2">
                          <span className="text-xs text-gray-500">👁 {kpi.view_count?.toLocaleString() ?? '-'}뷰</span>
                          <span className="text-xs text-gray-500">👍 {kpi.like_count ?? '-'}</span>
                          <span className="text-xs text-gray-500">💬 {kpi.comment_count ?? '-'}</span>
                          <span className={`text-xs font-semibold ${kpi.view_tab ? 'text-green-600' : 'text-gray-400'}`}>
                            VIEW {kpi.view_tab ? '✅ 노출' : '❌ 미노출'}
                          </span>
                        </div>
                      )}

                      {isEditing && (
                        <div className="mt-3 flex flex-wrap gap-3 items-end">
                          <div>
                            <label className="text-xs text-gray-400 block mb-1">조회수</label>
                            <input
                              type="number"
                              value={editForm.view_count ?? ''}
                              onChange={e => setEditForm(f => ({ ...f, view_count: e.target.value ? +e.target.value : null }))}
                              className="w-24 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-300"
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-400 block mb-1">공감</label>
                            <input
                              type="number"
                              value={editForm.like_count ?? ''}
                              onChange={e => setEditForm(f => ({ ...f, like_count: e.target.value ? +e.target.value : null }))}
                              className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-300"
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-400 block mb-1">댓글</label>
                            <input
                              type="number"
                              value={editForm.comment_count ?? ''}
                              onChange={e => setEditForm(f => ({ ...f, comment_count: e.target.value ? +e.target.value : null }))}
                              className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-300"
                              placeholder="0"
                            />
                          </div>
                          <div className="flex items-center gap-2 pb-1">
                            <input
                              type="checkbox"
                              id={`vt-${c.id}`}
                              checked={editForm.view_tab ?? false}
                              onChange={e => setEditForm(f => ({ ...f, view_tab: e.target.checked }))}
                              className="w-4 h-4 accent-brand-600"
                            />
                            <label htmlFor={`vt-${c.id}`} className="text-sm text-gray-600">VIEW탭 노출</label>
                          </div>
                          <div className="flex gap-2 pb-1">
                            <button onClick={() => saveKpi(c.id)} className="px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700">저장</button>
                            <button onClick={() => setEditingId(null)} className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200">취소</button>
                          </div>
                        </div>
                      )}
                    </div>

                    {!isEditing && (
                      <button
                        onClick={() => startEdit(c)}
                        className="flex-shrink-0 text-xs text-brand-600 font-semibold hover:underline"
                      >
                        {kpi ? 'KPI 수정' : 'KPI 입력'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
