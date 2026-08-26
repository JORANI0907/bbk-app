'use client'

/**
 * Batch B-후속-11: 워커 장비관리보고 페이지 (탭 분리 + 다중 보고)
 * - 📸 보고 탭: 매번 새 사진 3장 + 메모 입력 후 제출 (하루에 여러 번 가능)
 * - 📋 이력 탭: 지금까지 모든 보고 리스트 (최근 12주, 최신순)
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { Camera, CheckCircle2, AlertCircle, Trash2, Send } from 'lucide-react'
import { resizeImageToUnder } from '@/lib/image-resize'

interface CareRecord {
  id: string
  worker_id: string
  week_start: string
  photo_url: string
  photo_urls: string[] | null
  notes: string | null
  submitted_at: string
  review_status: 'approved' | 'need_recheck' | null
  review_notes: string | null
}

function getPhotos(r: CareRecord | null): string[] {
  if (!r) return []
  if (r.photo_urls && r.photo_urls.length > 0) return r.photo_urls
  return r.photo_url ? [r.photo_url] : []
}

function fmtWeek(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  const start = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
  d.setUTCDate(d.getUTCDate() + 6)
  const end = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
  return `${start} ~ ${end}`
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

type Tab = 'report' | 'history'

export default function WorkerRegularCarePage() {
  const [activeTab, setActiveTab] = useState<Tab>('report')
  const [weekStart, setWeekStart] = useState('')
  const [thisWeekRecords, setThisWeekRecords] = useState<CareRecord[]>([])
  const [history, setHistory] = useState<CareRecord[]>([])
  const [loading, setLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 신규 보고 폼 상태
  const [draftPhotos, setDraftPhotos] = useState<string[]>([])
  const [draftNotes, setDraftNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [curRes, histRes] = await Promise.all([
        fetch('/api/worker/regular-care').then(r => r.json()),
        fetch('/api/worker/regular-care?history=true').then(r => r.json()),
      ])
      if (curRes.ok) {
        setThisWeekRecords(curRes.records ?? [])
        setWeekStart(curRes.week_start)
      }
      if (histRes.ok) setHistory(histRes.history ?? [])
    } catch {
      toast.error('로드 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // 재정리 요청 배너 대상 (전체 이력 중)
  const recentRecheck = history.find(h => h.review_status === 'need_recheck')

  // 사진 추가 (draft 로컬 상태에만 반영, 제출 시 저장)
  const handleAddPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const original = e.target.files?.[0]
    if (!original) return
    if (original.size > 20 * 1024 * 1024) {
      toast.error('파일 크기는 20MB 이하여야 합니다.')
      return
    }
    if (draftPhotos.length >= 3) {
      toast.error('사진은 최대 3장까지 첨부 가능합니다.')
      return
    }
    setUploading(true)
    try {
      const file = await resizeImageToUnder(original, 2 * 1024 * 1024)
      if (file.size < original.size) {
        const savedKb = Math.round((original.size - file.size) / 1024)
        if (savedKb > 100) toast.success(`사진 크기 자동 조정: -${savedKb}KB`, { duration: 1500 })
      }
      const fd = new FormData()
      fd.append('photo', file)
      fd.append('week', weekStart)
      const upRes = await fetch('/api/worker/regular-care/photo', { method: 'POST', body: fd })
      const upJson = await upRes.json()
      if (!upRes.ok || !upJson.url) throw new Error(upJson.error ?? '업로드 실패')
      setDraftPhotos(prev => [...prev, upJson.url as string])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '업로드 실패')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeDraftPhoto = (idx: number) => {
    setDraftPhotos(prev => prev.filter((_, i) => i !== idx))
  }

  // 신규 보고 제출 (INSERT — 매번 새 레코드)
  const handleSubmit = async () => {
    if (draftPhotos.length === 0) {
      toast.error('사진을 최소 1장 첨부해주세요.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/worker/regular-care', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_urls: draftPhotos, notes: draftNotes || null }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? '제출 실패')
      toast.success('보고 완료!')
      setDraftPhotos([])
      setDraftNotes('')
      await load()
      // 제출 후 이력 탭으로 자동 전환
      setActiveTab('history')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '제출 실패')
    } finally {
      setSubmitting(false)
    }
  }

  // 개별 이력 삭제 (본인 것)
  const deleteRecord = async (id: string) => {
    if (!confirm('이 보고를 삭제할까요? 되돌릴 수 없습니다.')) return
    try {
      const res = await fetch(`/api/worker/regular-care?id=${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? '삭제 실패')
      toast.success('삭제됨')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '삭제 실패')
    }
  }

  if (loading) {
    return <div className="p-6 text-center text-text-tertiary text-sm">불러오는 중...</div>
  }

  return (
    <div className="px-4 pb-6 flex flex-col gap-4">
      <Toaster position="top-center" />

      <div className="text-center pt-2">
        <h1 className="text-xl font-bold text-text-primary">🧰 장비관리보고</h1>
        <p className="text-xs text-text-tertiary mt-1">사용한 장비 사진을 보고해주세요 (하루에 여러 번 가능)</p>
        {weekStart && <p className="text-xs text-brand-600 font-medium mt-1">이번 주: {fmtWeek(weekStart)}</p>}
      </div>

      {/* 재정리 요청 알림 배너 */}
      {recentRecheck && (
        <div className="bg-state-warning-bg border-2 border-state-warning rounded-xl p-3 flex items-start gap-2">
          <AlertCircle size={20} className="text-state-warning shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-state-warning">⚠️ 관리자 재정리 요청</p>
            <p className="text-xs text-text-primary mt-0.5">
              {fmtDateTime(recentRecheck.submitted_at)} 보고 건에 재정리 요청이 있습니다.
            </p>
            {recentRecheck.review_notes && (
              <p className="text-xs text-text-secondary mt-1 whitespace-pre-wrap bg-white rounded-md px-2 py-1.5">
                {recentRecheck.review_notes}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 세그먼트 탭 */}
      <div className="inline-flex bg-surface-sunken rounded-xl p-1 self-center">
        {([{ key: 'report', label: '📸 보고' }, { key: 'history', label: `📋 이력 (${history.length})` }] as { key: Tab; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === t.key ? 'bg-surface text-text-primary shadow-soft' : 'text-text-tertiary hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'report' && (
        <div className="bg-surface rounded-2xl border border-border-subtle p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold text-text-primary mb-1">새 보고 작성</p>
            <p className="text-xs text-text-tertiary">사진 1~3장 + 메모(선택)를 입력하고 제출하세요.</p>
          </div>

          {/* 사진 슬롯 3장 */}
          <div>
            <p className="text-xs text-text-secondary mb-2 flex items-center justify-between">
              <span>📸 사진 ({draftPhotos.length}/3)</span>
              <span className="text-text-tertiary">🔍 클릭하면 확대</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {draftPhotos.map((url, idx) => (
                <div key={idx} className="relative aspect-square">
                  <button
                    type="button"
                    onClick={() => setZoomPhoto(url)}
                    className="w-full h-full rounded-lg overflow-hidden border border-border-subtle"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`draft ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeDraftPhoto(idx)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white text-xs flex items-center justify-center hover:bg-red-600"
                    aria-label="사진 제거"
                  >✕</button>
                </div>
              ))}
              {draftPhotos.length < 3 && (
                <label
                  htmlFor="rc-photo-add"
                  className={`aspect-square border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${uploading ? 'border-gray-300 bg-gray-100' : 'border-brand-300 text-brand-600 hover:bg-brand-50'}`}
                >
                  {uploading ? (
                    <span className="text-xs text-text-tertiary">업로드 중...</span>
                  ) : (
                    <>
                      <Camera size={20} />
                      <span className="text-[10px] font-semibold">사진 추가</span>
                    </>
                  )}
                </label>
              )}
            </div>
            <input
              id="rc-photo-add"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleAddPhoto}
              className="hidden"
            />
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-xs text-text-secondary mb-1">메모 (선택)</label>
            <textarea
              value={draftNotes}
              onChange={e => setDraftNotes(e.target.value)}
              rows={2}
              placeholder="예: OO업장 마무리 완료 / 새 걸레 필요"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* 제출 */}
          <button
            onClick={handleSubmit}
            disabled={submitting || draftPhotos.length === 0}
            className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
              submitting || draftPhotos.length === 0
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-brand-600 text-white hover:bg-brand-700'
            }`}
          >
            <Send size={16} />
            {submitting ? '제출 중...' : '📤 보고 제출'}
          </button>

          {/* 이번주 이미 제출한 건수 안내 */}
          {thisWeekRecords.length > 0 && (
            <p className="text-xs text-text-tertiary text-center bg-surface-sunken rounded-md py-2">
              이번 주 이미 {thisWeekRecords.length}건 보고했습니다. 이력 탭에서 확인 가능.
            </p>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-3">
          {history.length === 0 ? (
            <div className="bg-surface rounded-2xl border border-border-subtle p-8 text-center text-sm text-text-tertiary">
              보고 이력이 없습니다.<br />첫 보고를 남겨보세요!
            </div>
          ) : (
            history.map(h => {
              const photos = getPhotos(h)
              return (
                <div key={h.id} className="bg-surface rounded-2xl border border-border-subtle p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-text-primary">{fmtDateTime(h.submitted_at)}</p>
                      <p className="text-[10px] text-text-tertiary">{fmtWeek(h.week_start)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {h.review_status === 'approved' && (
                        <span className="text-[10px] bg-state-success-bg text-state-success px-1.5 py-0.5 rounded">✅ 승인</span>
                      )}
                      {h.review_status === 'need_recheck' && (
                        <span className="text-[10px] bg-state-warning-bg text-state-warning px-1.5 py-0.5 rounded">⚠️ 재정리</span>
                      )}
                      {!h.review_status && (
                        <span className="text-[10px] text-text-tertiary">검토대기</span>
                      )}
                      <button
                        onClick={() => deleteRecord(h.id)}
                        className="text-text-tertiary hover:text-red-500 p-1"
                        aria-label="삭제"
                        title="삭제"
                      ><Trash2 size={12} /></button>
                    </div>
                  </div>

                  {/* 사진 그리드 */}
                  <div className={`grid gap-1 ${photos.length === 1 ? 'grid-cols-1' : photos.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    {photos.map((url, idx) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={idx}
                        src={url}
                        alt={`${idx + 1}`}
                        onClick={() => setZoomPhoto(url)}
                        className={`w-full object-cover rounded-md border border-border-subtle cursor-zoom-in ${photos.length === 1 ? 'h-40' : 'h-24'}`}
                      />
                    ))}
                  </div>

                  {h.notes && (
                    <p className="text-xs text-text-secondary bg-surface-sunken rounded-md p-2 whitespace-pre-wrap">
                      📝 {h.notes}
                    </p>
                  )}

                  {h.review_status === 'need_recheck' && h.review_notes && (
                    <div className="bg-state-warning-bg border border-state-warning rounded-md p-2 text-xs text-text-primary">
                      <p className="font-semibold">관리자 메모</p>
                      <p className="mt-0.5 whitespace-pre-wrap">{h.review_notes}</p>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* 사진 확대 모달 */}
      {zoomPhoto && (
        <div
          className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4"
          onClick={() => setZoomPhoto(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoomPhoto} alt="확대" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </div>
  )
}
