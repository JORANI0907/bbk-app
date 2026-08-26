'use client'

/**
 * Batch C-2: 워커용 정기관리 페이지
 * 매주 자신의 장비/도구 정리 상태 사진 제출.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { Camera, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
import { resizeImageToUnder } from '@/lib/image-resize'

interface CareRecord {
  id: string
  week_start: string
  photo_url: string           // 하위호환 (첫 번째 사진)
  photo_urls: string[] | null // 정본 (최대 3장)
  notes: string | null
  submitted_at: string
  review_status: 'approved' | 'need_recheck' | null
  review_notes: string | null
}

// photo_urls 우선, 없으면 photo_url 단일로 폴백
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

export default function WorkerRegularCarePage() {
  const [record, setRecord] = useState<CareRecord | null>(null)
  const [weekStart, setWeekStart] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // B-후속: 지난 12주 이력
  const [history, setHistory] = useState<CareRecord[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [curRes, histRes] = await Promise.all([
        fetch('/api/worker/regular-care').then(r => r.json()),
        fetch('/api/worker/regular-care?history=true').then(r => r.json()),
      ])
      if (curRes.ok) {
        setRecord(curRes.record)
        setWeekStart(curRes.week_start)
        if (curRes.record?.notes) setNotes(curRes.record.notes)
      }
      if (histRes.ok) setHistory(histRes.history ?? [])
    } catch {
      toast.error('로드 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // 재정리 요청 뱃지가 있는 최근 이력 (알림 배너용)
  const recentRecheck = history.find(h => h.review_status === 'need_recheck')

  // B-후속-6: 사진 1장 추가 (기존 photo_urls 배열에 append). 최대 3장.
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const original = e.target.files?.[0]
    if (!original) return
    if (original.size > 20 * 1024 * 1024) {
      toast.error('파일 크기는 20MB 이하여야 합니다.')
      return
    }
    const currentPhotos = getPhotos(record)
    if (currentPhotos.length >= 3) {
      toast.error('사진은 최대 3장까지 업로드 가능합니다.')
      return
    }
    setUploading(true)
    try {
      // 자동 2MB 이하로 리사이즈
      const file = await resizeImageToUnder(original, 2 * 1024 * 1024)
      if (file.size < original.size) {
        const savedKb = Math.round((original.size - file.size) / 1024)
        if (savedKb > 100) toast.success(`사진 크기 자동 조정: -${savedKb}KB`, { duration: 2000 })
      }

      // 1) 사진 업로드
      const fd = new FormData()
      fd.append('photo', file)
      fd.append('week', weekStart)
      const upRes = await fetch('/api/worker/regular-care/photo', { method: 'POST', body: fd })
      const upJson = await upRes.json()
      if (!upRes.ok || !upJson.url) throw new Error(upJson.error ?? '업로드 실패')

      // 2) 레코드 저장 (기존 배열 + 새 사진)
      const nextPhotos = [...currentPhotos, upJson.url as string]
      const saveRes = await fetch('/api/worker/regular-care', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_urls: nextPhotos, notes: notes || null }),
      })
      const saveJson = await saveRes.json()
      if (!saveRes.ok || !saveJson.ok) throw new Error(saveJson.error ?? '저장 실패')

      toast.success(nextPhotos.length === 1 ? '제출 완료!' : `${nextPhotos.length}번째 사진 추가됨`)
      setRecord(saveJson.record)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '제출 실패')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // B-후속-6: 특정 인덱스 사진 삭제 (마지막 1장은 삭제 불가 → 삭제하려면 별도 로직 필요)
  const handleDeletePhoto = async (idx: number) => {
    const current = getPhotos(record)
    if (current.length <= 1) {
      toast.error('마지막 사진은 삭제할 수 없습니다. 새로 촬영해 교체해주세요.')
      return
    }
    if (!confirm(`${idx + 1}번째 사진을 삭제할까요?`)) return
    setUploading(true)
    try {
      const nextPhotos = current.filter((_, i) => i !== idx)
      const saveRes = await fetch('/api/worker/regular-care', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_urls: nextPhotos, notes: notes || null }),
      })
      const saveJson = await saveRes.json()
      if (!saveRes.ok || !saveJson.ok) throw new Error(saveJson.error ?? '삭제 실패')
      toast.success('사진 삭제됨')
      setRecord(saveJson.record)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '삭제 실패')
    } finally {
      setUploading(false)
    }
  }

  const saveNotes = async () => {
    if (!record) return
    setSavingNotes(true)
    try {
      const res = await fetch('/api/worker/regular-care', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_url: record.photo_url, notes: notes || null }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? '저장 실패')
      toast.success('메모 저장됨')
      setRecord(json.record)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSavingNotes(false)
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
        <p className="text-xs text-text-tertiary mt-1">이번 주 사용한 장비 사진을 1장 보고해주세요</p>
        {weekStart && <p className="text-xs text-brand-600 font-medium mt-1">{fmtWeek(weekStart)}</p>}
      </div>

      {/* B-후속: 재정리 요청 알림 배너 (이번주 or 최근 이력) */}
      {recentRecheck && (
        <div className="bg-state-warning-bg border-2 border-state-warning rounded-xl p-3 flex items-start gap-2">
          <AlertCircle size={20} className="text-state-warning shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-state-warning">⚠️ 관리자 재정리 요청</p>
            <p className="text-xs text-text-primary mt-0.5">
              <b>{fmtWeek(recentRecheck.week_start)}</b> 보고에 재정리 요청이 있습니다.
            </p>
            {recentRecheck.review_notes && (
              <p className="text-xs text-text-secondary mt-1 whitespace-pre-wrap bg-white rounded-md px-2 py-1.5">
                {recentRecheck.review_notes}
              </p>
            )}
          </div>
        </div>
      )}

      {record ? (
        <div className="bg-surface rounded-2xl border border-border-subtle p-4 space-y-4">
          {/* 검토 상태 뱃지 */}
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-state-success">
              <CheckCircle2 size={16} /> 제출 완료
            </span>
            {record.review_status === 'approved' && (
              <span className="text-xs bg-state-success-bg text-state-success px-2 py-1 rounded-md">✅ 관리자 승인</span>
            )}
            {record.review_status === 'need_recheck' && (
              <span className="text-xs bg-state-warning-bg text-state-warning px-2 py-1 rounded-md">⚠️ 재정리 요청</span>
            )}
          </div>

          {/* 사진 슬롯 그리드 (최대 3장) */}
          <div>
            <p className="text-xs text-text-secondary mb-2 flex items-center justify-between">
              <span>📸 등록된 사진 ({getPhotos(record).length}/3)</span>
              <span className="text-text-tertiary">🔍 클릭하면 확대</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {getPhotos(record).map((url, idx) => (
                <div key={idx} className="relative aspect-square group">
                  <button
                    type="button"
                    onClick={() => setZoomPhoto(url)}
                    className="w-full h-full rounded-lg overflow-hidden border border-border-subtle hover:opacity-90 transition-opacity"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`장비관리보고 ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeletePhoto(idx)}
                    disabled={uploading || getPhotos(record).length <= 1}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white text-xs flex items-center justify-center hover:bg-red-600 disabled:opacity-30"
                    aria-label="사진 삭제"
                  >✕</button>
                </div>
              ))}
              {/* 빈 슬롯 (사진 추가 버튼) */}
              {getPhotos(record).length < 3 && (
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
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* 관리자 재정리 요청 사유 */}
          {record.review_status === 'need_recheck' && record.review_notes && (
            <div className="bg-state-warning-bg border border-state-warning rounded-lg p-3 text-xs text-text-primary">
              <p className="font-semibold flex items-center gap-1"><AlertCircle size={12} /> 관리자 메모</p>
              <p className="mt-1 whitespace-pre-wrap">{record.review_notes}</p>
            </div>
          )}

          {/* 메모 */}
          <div>
            <label className="block text-xs text-text-secondary mb-1">메모 (선택)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="예: 새 걸레 필요, 진공청소기 필터 교체됨"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              onClick={saveNotes}
              disabled={savingNotes}
              className={`mt-2 w-full py-2 rounded-lg text-sm font-semibold transition-colors ${savingNotes ? 'bg-gray-300 text-gray-500' : 'bg-brand-600 text-white hover:bg-brand-700'}`}
            >{savingNotes ? '저장 중...' : '💾 메모 저장'}</button>
          </div>

          <p className="text-[10px] text-text-tertiary text-center">
            {new Date(record.submitted_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} 제출
          </p>
        </div>
      ) : (
        <div className="bg-surface-sunken rounded-2xl p-6 flex flex-col items-center gap-4">
          <div className="w-20 h-20 bg-brand-100 rounded-full flex items-center justify-center">
            <Camera size={40} />
          </div>
          <p className="text-sm text-text-secondary text-center">
            이번 주 장비관리보고 사진을<br />아직 제출하지 않았습니다.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
            id="rc-photo-first"
          />
          <label
            htmlFor="rc-photo-first"
            className={`w-full text-center py-4 rounded-2xl text-base font-bold cursor-pointer ${uploading ? 'bg-gray-300 text-gray-500' : 'bg-brand-600 text-white'}`}
          >
            {uploading ? '업로드 중...' : <><Camera size={20} className="inline mr-2" /> 사진 촬영·업로드</>}
          </label>
          <p className="text-[10px] text-text-tertiary text-center">
            자신의 차량·창고·현장에 장비를<br />잘 정리한 모습을 촬영해주세요
          </p>
        </div>
      )}

      {/* B-후속: 지난 보고 이력 */}
      <div className="bg-surface rounded-2xl border border-border-subtle overflow-hidden">
        <button
          type="button"
          onClick={() => setShowHistory(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-sunken transition-colors"
        >
          <span className="text-sm font-semibold text-text-primary">📋 지난 보고 이력 ({history.length})</span>
          <span className={`text-text-tertiary transition-transform ${showHistory ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {showHistory && (
          <div className="border-t border-border-subtle divide-y divide-border-subtle">
            {history.length === 0 ? (
              <p className="text-xs text-text-tertiary text-center py-6">이력이 없습니다.</p>
            ) : (
              history.map(h => {
                const hPhotos = getPhotos(h)
                const firstPhoto = hPhotos[0] ?? h.photo_url
                return (
                <div key={h.id} className="flex items-center gap-3 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <button
                    type="button"
                    onClick={() => setZoomPhoto(firstPhoto)}
                    className="w-14 h-14 rounded-lg overflow-hidden border border-border-subtle shrink-0 hover:opacity-80 relative"
                  >
                    <img src={firstPhoto} alt={fmtWeek(h.week_start)} className="w-full h-full object-cover" />
                    {hPhotos.length > 1 && (
                      <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[9px] px-1 rounded-tl-md">
                        +{hPhotos.length - 1}
                      </span>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-text-primary">{fmtWeek(h.week_start)}</p>
                    <p className="text-[10px] text-text-tertiary mt-0.5">
                      {new Date(h.submitted_at).toLocaleDateString('ko-KR')} 제출
                    </p>
                    {h.notes && <p className="text-[10px] text-text-secondary mt-0.5 truncate">📝 {h.notes}</p>}
                  </div>
                  {h.review_status === 'approved' && (
                    <span className="text-[10px] bg-state-success-bg text-state-success px-1.5 py-0.5 rounded shrink-0">승인</span>
                  )}
                  {h.review_status === 'need_recheck' && (
                    <span className="text-[10px] bg-state-warning-bg text-state-warning px-1.5 py-0.5 rounded shrink-0">재정리</span>
                  )}
                  {!h.review_status && (
                    <span className="text-[10px] text-text-tertiary shrink-0">검토대기</span>
                  )}
                </div>
                )
              })
            )}
          </div>
        )}
      </div>

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
