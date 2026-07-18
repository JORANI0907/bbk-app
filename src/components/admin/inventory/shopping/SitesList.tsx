'use client'

import { useState, useEffect } from 'react'
import { Plus, Loader2, X, ExternalLink, Pencil, Check } from 'lucide-react'
import type { ShoppingSite } from '@/lib/shopping-types'
import { getShoppingSites, createShoppingSite, updateShoppingSite, deleteShoppingSite } from '@/lib/shopping-api'

function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`
  return trimmed
}

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') }
  catch { return url }
}

function faviconOf(url: string): string {
  try {
    const u = new URL(url)
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`
  } catch { return '' }
}

export function SitesList() {
  const [sites, setSites] = useState<ShoppingSite[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editUrl, setEditUrl] = useState('')

  useEffect(() => {
    getShoppingSites().then(setSites).catch(() => {}).finally(() => setLoading(false))
  }, [])

  async function handleCreate() {
    const finalUrl = normalizeUrl(url)
    const finalName = name.trim() || domainOf(finalUrl)
    if (!finalUrl || !finalName) return
    setSaving(true)
    try {
      const site = await createShoppingSite({ name: finalName, url: finalUrl })
      setSites(p => [...p, site])
      setName(''); setUrl(''); setAdding(false)
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  async function handleDelete(id: string, siteName: string) {
    if (!confirm(`"${siteName}" 삭제할까요?`)) return
    try { await deleteShoppingSite(id); setSites(p => p.filter(s => s.id !== id)) } catch { /* ignore */ }
  }

  async function handleSaveEdit(id: string) {
    const finalUrl = normalizeUrl(editUrl)
    const finalName = editName.trim()
    if (!finalUrl || !finalName) return
    try {
      const updated = await updateShoppingSite(id, { name: finalName, url: finalUrl })
      setSites(p => p.map(s => s.id === id ? updated : s))
      setEditingId(null)
    } catch { /* ignore */ }
  }

  function startEdit(site: ShoppingSite) {
    setEditingId(site.id); setEditName(site.name); setEditUrl(site.url)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 사이트 추가 */}
      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 transition-colors text-sm font-medium"
        >
          <Plus size={16} /> 구입 사이트 추가
        </button>
      ) : (
        <div className="bg-white border border-blue-200 rounded-xl p-4 shadow-sm flex flex-col gap-2">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-gray-900">새 사이트 저장</h3>
            <button onClick={() => { setAdding(false); setName(''); setUrl('') }} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>
          <label>
            <div className="text-xs text-gray-500 mb-1.5">사이트명 (비우면 도메인명)</div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="예: 쿠팡"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400"
            />
          </label>
          <label>
            <div className="text-xs text-gray-500 mb-1.5">URL *</div>
            <input
              autoFocus
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && url.trim()) handleCreate() }}
              placeholder="https://www.coupang.com"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400"
            />
          </label>
          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={() => { setAdding(false); setName(''); setUrl('') }}
              className="px-4 py-2 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              취소
            </button>
            <button
              onClick={handleCreate}
              disabled={!url.trim() || saving}
              className="px-4 py-2 text-xs rounded-lg bg-blue-500 text-white font-semibold hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} 저장
            </button>
          </div>
        </div>
      )}

      {/* 사이트 버튼 그리드 */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
          <Loader2 size={14} className="animate-spin" /> 불러오는 중...
        </div>
      ) : sites.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">저장된 구입 사이트가 없습니다</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {sites.map(site => (
            editingId === site.id ? (
              <div key={site.id} className="col-span-2 md:col-span-3 bg-white border border-blue-300 rounded-xl p-3 flex flex-col gap-2">
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="사이트명"
                  className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400"
                />
                <input
                  value={editUrl}
                  onChange={e => setEditUrl(e.target.value)}
                  placeholder="URL"
                  className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400"
                />
                <div className="flex gap-1.5 justify-end">
                  <button
                    onClick={() => handleDelete(site.id, site.name)}
                    className="px-2.5 py-1 text-[11px] rounded-lg border border-red-300 text-red-500 hover:bg-red-50"
                  >
                    삭제
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-2.5 py-1 text-[11px] rounded-lg border border-gray-200 hover:bg-gray-50"
                  >
                    취소
                  </button>
                  <button
                    onClick={() => handleSaveEdit(site.id)}
                    className="px-2.5 py-1 text-[11px] rounded-lg bg-blue-500 text-white font-semibold hover:bg-blue-600"
                  >
                    저장
                  </button>
                </div>
              </div>
            ) : (
              <div key={site.id} className="relative group">
                <a
                  href={site.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-3 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  {faviconOf(site.url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={faviconOf(site.url)} alt="" className="w-5 h-5 shrink-0 rounded" />
                  ) : (
                    <ExternalLink size={14} className="text-gray-400 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-900 truncate">{site.name}</div>
                    <div className="text-[10px] text-gray-400 truncate">{domainOf(site.url)}</div>
                  </div>
                </a>
                <button
                  onClick={() => startEdit(site)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-md bg-white/90 border border-gray-200 opacity-0 group-hover:opacity-100 hover:bg-gray-50 flex items-center justify-center transition-opacity"
                  title="수정"
                >
                  <Pencil size={10} className="text-gray-500" />
                </button>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  )
}
