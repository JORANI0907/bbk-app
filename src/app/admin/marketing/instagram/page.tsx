'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

interface InstaContent {
  id: string
  title: string
  region: string
  item: string
  is_published: boolean
  created_at: string
}

interface InstaKpi {
  id?: string
  content_id: string
  reach: number | null
  saves: number | null
  shares: number | null
  comment_count: number | null
}

function pct(a: number | null, b: number | null) {
  if (!a || !b || b === 0) return null
  return ((a / b) * 100).toFixed(1)
}

function SaveRateBadge({ saves, reach }: { saves: number | null; reach: number | null }) {
  const rate = pct(saves, reach)
  if (!rate) return <span className="text-xs text-gray-300">-</span>
  const val = parseFloat(rate)
  if (val >= 5) return <span className="text-xs font-semibold text-green-600">🔥 {rate}%</span>
  if (val >= 3) return <span className="text-xs font-semibold text-yellow-600">👍 {rate}%</span>
  return <span className="text-xs font-semibold text-red-500">⚠️ {rate}%</span>
}

function StatCard({ label, value, sub, color = 'text-gray-900' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs text-gray-400 font-medium mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function InstagramPerformancePage() {
  const supabase = createClient()
  const [contents, setContents] = useState<InstaContent[]>([])
  const [kpiMap, setKpiMap] = useState<Record<string, InstaKpi>>({})
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<InstaKpi>>({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: c } = await supabase
      .from('marketing_content')
      .select('id,title,region,item,is_published,created_at')
      .eq('content_type', 'insta')
      .order('created_at', { ascending: false })
      .limit(30)

    const { data: k } = await supabase
      .from('marketing_kpi')
      .select('*')
      .eq('channel', 'insta')

    const map: Record<string, InstaKpi> = {}
    for (const kpi of k ?? []) map[kpi.content_id] = kpi

    setContents(c ?? [])
    setKpiMap(map)
    setLoading(false)
  }

  function startEdit(content: InstaContent) {
    const existing = kpiMap[content.id]
    setEditingId(content.id)
    setEditForm({
      content_id: content.id,
      reach: existing?.reach ?? null,
      saves: existing?.saves ?? null,
      shares: existing?.shares ?? null,
      comment_count: existing?.comment_count ?? null,
    })
  }

  async function saveKpi(contentId: string) {
    const existing = kpiMap[contentId]
    if (existing?.id) {
      await supabase.from('marketing_kpi').update({ ...editForm }).eq('id', existing.id)
    } else {
      await supabase.from('marketing_kpi').insert({ ...editForm, channel: 'insta', content_id: contentId })
    }
    toast.success('KPI 저장됐어요!')
    setEditingId(null)
    load()
  }

  const kpis = Object.values(kpiMap)
  const withKpi = kpis.length
  const avgReach = withKpi > 0 ? Math.round(kpis.reduce((s, k) => s + (k.reach ?? 0), 0) / withKpi) : 0
  const avgSaveRate = withKpi > 0
    ? (kpis.reduce((s, k) => {
        const r = k.reach && k.saves ? k.saves / k.reach * 100 : 0
        return s + r
      }, 0) / withKpi).toFixed(1)
    : '0'
  const totalSaves = kpis.reduce((s, k) => s + (k.saves ?? 0), 0)
  const lowSaveRate = contents.filter(c => {
    const k = kpiMap[c.id]
    if (!k || !k.reach || !k.saves) return false
    return (k.saves / k.reach * 100) < 3
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">인스타그램 성과</h1>
        <p className="text-sm text-gray-500 mt-0.5">저장율 5% 이상 = 상위 노출 트리거</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="평균 도달" value={avgReach > 0 ? `${avgReach.toLocaleString()}` : '-'} sub="reach" />
        <StatCard label="평균 저장율" value={`${avgSaveRate}%`} sub="목표 5% 이상" color={parseFloat(avgSaveRate) >= 5 ? 'text-green-600' : parseFloat(avgSaveRate) >= 3 ? 'text-yellow-600' : 'text-red-500'} />
        <StatCard label="누적 저장" value={totalSaves.toLocaleString()} sub="전체 합산" />
        <StatCard label="저장율 3%↓" value={`${lowSaveRate.length}편`} sub="콘텐츠 재검토 필요" color={lowSaveRate.length > 0 ? 'text-red-500' : 'text-gray-900'} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">게시물 KPI</h2>
          <p className="text-xs text-gray-400 mt-0.5">인스타그램 인사이트에서 수치를 직접 입력하세요</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><div className="w-7 h-7 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : contents.length === 0 ? (
          <div className="text-center py-12 text-gray-400">아직 인스타 게시물이 없어요</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {contents.map(c => {
              const kpi = kpiMap[c.id]
              const isEditing = editingId === c.id
              const saveRate = pct(kpi?.saves ?? null, kpi?.reach ?? null)
              const isLow = saveRate !== null && parseFloat(saveRate) < 3

              return (
                <div key={c.id} className={`px-5 py-4 ${isLow ? 'bg-red-50' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-800 truncate">{c.title}</p>
                        {isLow && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">⚠️ 저장율 낮음</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {c.region} · {c.item} · {new Date(c.created_at).toLocaleDateString('ko-KR')}
                      </p>

                      {!isEditing && kpi && (
                        <div className="flex items-center gap-4 mt-2 flex-wrap">
                          <span className="text-xs text-gray-500">👁 도달 {kpi.reach?.toLocaleString() ?? '-'}</span>
                          <span className="text-xs text-gray-500">🔖 저장 {kpi.saves?.toLocaleString() ?? '-'}</span>
                          <span className="text-xs text-gray-500">↗️ 공유 {kpi.shares ?? '-'}</span>
                          <span className="text-xs text-gray-500">💬 댓글 {kpi.comment_count ?? '-'}</span>
                          <SaveRateBadge saves={kpi.saves} reach={kpi.reach} />
                        </div>
                      )}

                      {isEditing && (
                        <div className="mt-3 flex flex-wrap gap-3 items-end">
                          {[
                            { key: 'reach', label: '도달', w: 'w-24' },
                            { key: 'saves', label: '저장', w: 'w-20' },
                            { key: 'shares', label: '공유', w: 'w-20' },
                            { key: 'comment_count', label: '댓글', w: 'w-20' },
                          ].map(({ key, label, w }) => (
                            <div key={key}>
                              <label className="text-xs text-gray-400 block mb-1">{label}</label>
                              <input
                                type="number"
                                value={(editForm as Record<string, number | null>)[key] ?? ''}
                                onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value ? +e.target.value : null }))}
                                className={`${w} text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-300`}
                                placeholder="0"
                              />
                            </div>
                          ))}
                          <div className="flex gap-2 pb-1">
                            <button onClick={() => saveKpi(c.id)} className="px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700">저장</button>
                            <button onClick={() => setEditingId(null)} className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg">취소</button>
                          </div>
                        </div>
                      )}
                    </div>

                    {!isEditing && (
                      <button onClick={() => startEdit(c)} className="flex-shrink-0 text-xs text-brand-600 font-semibold hover:underline">
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
