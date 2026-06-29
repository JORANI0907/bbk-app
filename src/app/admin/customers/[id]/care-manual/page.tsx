'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Plus, Trash2, ChevronLeft, Save, GripVertical, ImagePlus, X, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui'
import toast from 'react-hot-toast'
import type { CareManualSection, CareManualItem } from '@/types/care-manual'

const BUCKET = 'care-manual-images'
const EMPTY_ITEM: CareManualItem = { label: '', desc: '' }
const EMPTY_SECTION: CareManualSection = { section: '', items: [{ ...EMPTY_ITEM }] }

async function compressImage(file: File): Promise<Blob> {
  const MAX = 1_000_000
  if (file.size <= MAX) return file
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, Math.sqrt(MAX / file.size) * 0.85)
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        blob => { if (blob) resolve(blob); else reject(new Error('압축 실패')) },
        'image/webp',
        0.82
      )
    }
    img.onerror = () => reject(new Error('이미지 로드 실패'))
    img.src = url
  })
}

export default function CareManualEditPage() {
  const params = useParams<{ id: string }>()
  // Next.js 버전별로 string | string[] 양쪽 케이스 모두 대응
  const id = Array.isArray(params.id) ? params.id[0] : params.id
  const router = useRouter()

  const [sections, setSections] = useState<CareManualSection[]>([])
  const sectionsRef = useRef<CareManualSection[]>([])
  // sections 변경 시 ref 동기화 — 비동기 함수 내 stale 클로저 방지
  useEffect(() => { sectionsRef.current = sections }, [sections])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [uploadingSi, setUploadingSi] = useState<number | null>(null)
  const [uploadingItem, setUploadingItem] = useState<[number, number] | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  // 브라우저 뒤로가기도 세부화면이 열린 채로 돌아가도록
  useEffect(() => {
    history.pushState(null, '')
    const handlePopState = () => {
      router.push(`/admin/customers?detail=${id}`)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [id, router])

  const fetchManual = useCallback(async () => {
    if (!id) {
      toast.error('잘못된 URL — customer id 없음')
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      // timestamp query param으로 모든 캐시(브라우저/CDN/SW) 우회
      const res = await fetch(`/api/admin/customers/${id}/care-manual?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(`[GET ${res.status}] ${body.error ?? '불러오기 실패'}`)
      }
      const data = await res.json()
      const fetched = Array.isArray(data.sections) ? data.sections : []
      const itemsCount = fetched[0]?.items?.length ?? 0
      console.log(`[care-manual GET] id=${id}, sections=${fetched.length}, items_in_first=${itemsCount}, business=${data.business_name}`)
      setSections(fetched)
      setCustomerName(data.business_name ?? '')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchManual() }, [fetchManual])

  const putSections = async (sectionsToSave: CareManualSection[]) => {
    const res = await fetch(`/api/admin/customers/${id}/care-manual`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sections: sectionsToSave }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(`[${res.status}] ${body.error ?? '저장 실패'}`)
    }
  }

  const handleSave = async () => {
    if (!id) {
      toast.error('잘못된 URL — customer id 없음')
      return
    }
    // 빈 sections 가드 — 의도치 않은 데이터 손실 방지
    if (sections.length === 0) {
      const ok = confirm('섹션이 0개입니다. 그래도 저장하시겠습니까? (DB의 기존 내용이 모두 삭제됩니다)')
      if (!ok) return
    }
    try {
      setSaving(true)
      console.log(`[care-manual SAVE] id=${id}, sections=${sections.length}, payload=`, JSON.stringify(sections).slice(0, 300))
      const res = await fetch(`/api/admin/customers/${id}/care-manual?t=${Date.now()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify({ sections }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(`[PUT ${res.status}] ${body.error ?? '저장 실패'}`)
      }
      console.log(`[care-manual SAVE OK] response=`, body)
      sectionsRef.current = sections
      const savedCount = Array.isArray(body.sections) ? body.sections.length : sections.length
      const now = new Date()
      const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`
      toast.success(`저장됨 · 섹션 ${savedCount}개 · ${timeStr}`)
      router.refresh()
    } catch (e) {
      console.error('[care-manual SAVE FAIL]', e)
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const updateSectionName = (si: number, value: string) =>
    setSections(prev => prev.map((s, i) => i === si ? { ...s, section: value } : s))

  const setSectionImage = (si: number, image_url: string | undefined) =>
    setSections(prev => prev.map((s, i) => i === si ? { ...s, image_url } : s))

  const addSection = () =>
    setSections(prev => [...prev, { ...EMPTY_SECTION, items: [{ ...EMPTY_ITEM }] }])

  const removeSection = (si: number) =>
    setSections(prev => prev.filter((_, i) => i !== si))

  const updateItem = (si: number, ii: number, key: keyof CareManualItem, value: string) =>
    setSections(prev => prev.map((s, i) =>
      i !== si ? s : {
        ...s,
        items: s.items.map((item, j) => j === ii ? { ...item, [key]: value } : item)
      }
    ))

  const addItem = (si: number) =>
    setSections(prev => prev.map((s, i) =>
      i !== si ? s : { ...s, items: [...s.items, { ...EMPTY_ITEM }] }
    ))

  const removeItem = (si: number, ii: number) =>
    setSections(prev => prev.map((s, i) =>
      i !== si ? s : { ...s, items: s.items.filter((_, j) => j !== ii) }
    ))

  const handleImageUpload = async (si: number, file: File) => {
    try {
      setUploadingSi(si)
      const blob = await compressImage(file)
      const form = new FormData()
      form.append('file', blob, `${si}_${Date.now()}.webp`)
      form.append('si', String(si))

      const res = await fetch(`/api/admin/customers/${id}/care-manual/image`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? '업로드 실패')
      }
      const { url } = await res.json() as { url: string }
      // ref로 최신 sections 참조 (업로드 대기 중 텍스트 편집이 있어도 반영)
      const next = sectionsRef.current.map((s, i) => i === si ? { ...s, image_url: url } : s)
      setSections(next)
      await putSections(next)
      toast.success('사진 업로드 및 저장 완료')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '사진 업로드 실패')
    } finally {
      setUploadingSi(null)
    }
  }

  const removeImage = async (si: number) => {
    const url = sectionsRef.current[si]?.image_url
    const next = sectionsRef.current.map((s, i) => i === si ? { ...s, image_url: undefined } : s)
    setSections(next)
    try {
      await putSections(next)
    } catch {
      toast.error('이미지 정보 저장 실패')
    }
    if (url) {
      const marker = `${BUCKET}/`
      const markerIdx = url.indexOf(marker)
      if (markerIdx !== -1) {
        const path = url.slice(markerIdx + marker.length)
        await fetch(`/api/admin/customers/${id}/care-manual/image`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path }),
        }).catch(() => {})
      }
    }
  }

  const handleItemImageUpload = async (si: number, ii: number, file: File) => {
    try {
      setUploadingItem([si, ii])
      const blob = await compressImage(file)
      const form = new FormData()
      form.append('file', blob, `s${si}_i${ii}_${Date.now()}.webp`)
      form.append('si', String(si))
      form.append('ii', String(ii))
      const res = await fetch(`/api/admin/customers/${id}/care-manual/image`, { method: 'POST', body: form })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? '업로드 실패')
      }
      const { url } = await res.json() as { url: string }
      const next = sectionsRef.current.map((s, si2) =>
        si2 !== si ? s : {
          ...s,
          items: s.items.map((item, ii2) => ii2 === ii ? { ...item, image_url: url } : item)
        }
      )
      setSections(next)
      await putSections(next)
      toast.success('항목 사진 업로드 완료')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '사진 업로드 실패')
    } finally {
      setUploadingItem(null)
    }
  }

  const removeItemImage = async (si: number, ii: number) => {
    const url = sectionsRef.current[si]?.items[ii]?.image_url
    const next = sectionsRef.current.map((s, si2) =>
      si2 !== si ? s : {
        ...s,
        items: s.items.map((item, ii2) => ii2 === ii ? { ...item, image_url: undefined } : item)
      }
    )
    setSections(next)
    try {
      await putSections(next)
    } catch {
      toast.error('이미지 정보 저장 실패')
    }
    if (url) {
      const marker = `${BUCKET}/`
      const markerIdx = url.indexOf(marker)
      if (markerIdx !== -1) {
        const path = url.slice(markerIdx + marker.length)
        await fetch(`/api/admin/customers/${id}/care-manual/image`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path }),
        }).catch(() => {})
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-text-tertiary text-sm">불러오는 중...</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push(`/admin/customers?detail=${id}`)} className="p-1.5 rounded-lg hover:bg-surface-sunken">
          <ChevronLeft size={20} className="text-text-secondary" />
        </button>
        <div className="flex-1">
          <p className="text-xs text-text-tertiary">케어매뉴얼 편집</p>
          <h1 className="text-base font-bold text-text-primary break-keep">
            {customerName || '고객'}
          </h1>
        </div>
        <Button onClick={handleSave} disabled={saving || uploadingSi !== null || uploadingItem !== null} size="sm">
          <Save size={14} className="mr-1" />
          {saving ? '저장 중...' : (uploadingSi !== null || uploadingItem !== null) ? '업로드 중...' : '저장'}
        </Button>
      </div>

      {sections.length === 0 && (
        <div className="bg-surface-sunken rounded-2xl p-8 text-center">
          <p className="text-text-tertiary text-sm">케어매뉴얼이 없습니다.</p>
          <p className="text-text-tertiary text-xs mt-1">아래 버튼으로 섹션을 추가하세요.</p>
        </div>
      )}

      {sections.map((section, si) => (
        <div key={si} className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden">
          {/* 섹션 헤더 */}
          <div className="flex items-center gap-2 px-4 py-3 bg-surface-sunken border-b border-border-subtle">
            <GripVertical size={16} className="text-text-tertiary shrink-0" />
            <input
              value={section.section}
              onChange={e => updateSectionName(si, e.target.value)}
              placeholder="섹션명 (예: 주방 후드)"
              className="flex-1 text-sm font-semibold bg-transparent outline-none text-text-primary placeholder:text-text-tertiary"
            />
            <button
              onClick={() => removeSection(si)}
              className="p-1 rounded-lg hover:bg-state-danger-bg text-text-tertiary hover:text-state-danger transition-colors"
            >
              <Trash2 size={15} />
            </button>
          </div>

          {/* 섹션 사진 — 16:9 고정 비율 */}
          <div className="px-4 py-3 border-b border-border-subtle">
            {section.image_url ? (
              <div className="relative w-1/2 aspect-video rounded-xl overflow-hidden border border-border-subtle">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={section.image_url}
                  alt={section.section}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {/* 확대 버튼 — 튀는 amber 색상 */}
                <button
                  type="button"
                  onClick={() => setLightboxUrl(section.image_url!)}
                  className="absolute top-2 right-10 p-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-black transition-colors shadow-sm"
                  title="확대 보기"
                >
                  <Maximize2 size={13} />
                </button>
                {/* 삭제 버튼 */}
                <button
                  type="button"
                  onClick={() => removeImage(si)}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 text-xs text-text-tertiary hover:text-brand-600 cursor-pointer transition-colors w-fit">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleImageUpload(si, file)
                    e.target.value = ''
                  }}
                />
                {uploadingSi === si ? (
                  <span className="text-xs text-brand-600 animate-pulse">업로드 중...</span>
                ) : (
                  <>
                    <ImagePlus size={14} />
                    <span>섹션 사진 추가 (선택)</span>
                  </>
                )}
              </label>
            )}
          </div>

          {/* 항목 목록 */}
          <div className="divide-y divide-border-subtle">
            {section.items.map((item, ii) => (
              <div key={ii} className="px-4 py-3 flex flex-col gap-2">
                {/* 입력 행 */}
                <div className="flex gap-3 items-start">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <input
                      value={item.label}
                      onChange={e => updateItem(si, ii, 'label', e.target.value)}
                      placeholder="항목명"
                      className="text-sm bg-surface-sunken rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-brand-600 text-text-primary placeholder:text-text-tertiary"
                    />
                    <input
                      value={item.desc}
                      onChange={e => updateItem(si, ii, 'desc', e.target.value)}
                      placeholder="설명"
                      className="text-sm bg-surface-sunken rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-brand-600 text-text-primary placeholder:text-text-tertiary"
                    />
                  </div>
                  <button
                    onClick={() => removeItem(si, ii)}
                    className="p-1.5 mt-1 rounded-lg hover:bg-state-danger-bg text-text-tertiary hover:text-state-danger transition-colors shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {/* 항목 사진 — 원본 비율, 소형 */}
                {item.image_url ? (
                  <div className="relative inline-block self-start">
                    <div className="rounded-lg overflow-hidden border border-border-subtle">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.image_url}
                        alt={item.label}
                        className="max-h-20 w-auto object-contain block"
                        loading="lazy"
                      />
                    </div>
                    {/* 확대 버튼 — amber */}
                    <button
                      type="button"
                      onClick={() => setLightboxUrl(item.image_url!)}
                      className="absolute top-1 left-1 p-0.5 rounded bg-amber-400 hover:bg-amber-300 text-black transition-colors shadow-sm"
                      title="확대 보기"
                    >
                      <Maximize2 size={10} />
                    </button>
                    {/* 삭제 버튼 */}
                    <button
                      type="button"
                      onClick={() => removeItemImage(si, ii)}
                      className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-brand-600 cursor-pointer transition-colors w-fit">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) handleItemImageUpload(si, ii, file)
                        e.target.value = ''
                      }}
                    />
                    {uploadingItem && uploadingItem[0] === si && uploadingItem[1] === ii ? (
                      <span className="animate-pulse">업로드 중...</span>
                    ) : (
                      <>
                        <ImagePlus size={12} />
                        <span>항목 사진</span>
                      </>
                    )}
                  </label>
                )}
              </div>
            ))}
          </div>

          {/* 항목 추가 */}
          <div className="px-4 py-2 border-t border-border-subtle">
            <button
              onClick={() => addItem(si)}
              className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium py-1"
            >
              <Plus size={13} /> 항목 추가
            </button>
          </div>
        </div>
      ))}

      {/* 섹션 추가 */}
      <button
        onClick={addSection}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl border-2 border-dashed border-border text-text-secondary hover:border-brand-600 hover:text-brand-600 transition-colors text-sm font-medium"
      >
        <Plus size={16} /> 섹션 추가
      </button>

      {/* 라이트박스 */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <X size={20} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="섹션 사진 확대"
            className="max-w-full max-h-[90vh] object-contain rounded-xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
