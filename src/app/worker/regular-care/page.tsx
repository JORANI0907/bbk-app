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

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

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

  // C-3: 장비관리보고 알림 요일 (정규 + 예비, 최대 2개)
  //  - persisted: 서버에 저장된 값 (마지막 저장 성공 시점 기준)
  //  - draft: 사용자가 편집 중인 값. 저장 버튼으로 서버 반영
  const [notifyWeekdaysPersisted, setNotifyWeekdaysPersisted] = useState<number[]>([])
  const [notifyWeekdaysDraft, setNotifyWeekdaysDraft] = useState<number[]>([])
  const [savingNotify, setSavingNotify] = useState(false)

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

  // C-3: 알림 요일 초기 로드
  useEffect(() => {
    fetch('/api/worker/notify-settings')
      .then(r => r.json())
      .then(j => {
        if (j.ok) {
          const list = (j.equipment_notify_weekdays ?? []) as number[]
          setNotifyWeekdaysPersisted(list)
          setNotifyWeekdaysDraft(list)
        }
      })
      .catch(() => {})
  }, [])

  // draft 만 갱신 (서버 저장은 별도 저장 버튼에서 수행)
  const toggleNotifyWeekday = (day: number) => {
    const already = notifyWeekdaysDraft.includes(day)
    let next: number[]
    if (already) {
      next = notifyWeekdaysDraft.filter(d => d !== day)
    } else {
      // 최대 2개 (정규 + 예비). 초과 시 가장 오래된 것 제거
      if (notifyWeekdaysDraft.length >= 2) {
        toast('정규+예비 최대 2개까지만 선택 가능. 첫 번째 요일이 제거됩니다.', { icon: 'ℹ️', duration: 2500 })
        next = [notifyWeekdaysDraft[1], day].sort((a, b) => a - b)
      } else {
        next = [...notifyWeekdaysDraft, day].sort((a, b) => a - b)
      }
    }
    setNotifyWeekdaysDraft(next)
  }

  const isNotifyDirty = (() => {
    const a = [...notifyWeekdaysDraft].sort((x, y) => x - y)
    const b = [...notifyWeekdaysPersisted].sort((x, y) => x - y)
    if (a.length !== b.length) return true
    return a.some((v, i) => v !== b[i])
  })()

  const handleSaveNotifyWeekdays = async () => {
    if (!isNotifyDirty || savingNotify) return
    setSavingNotify(true)
    try {
      const res = await fetch('/api/worker/notify-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipment_notify_weekdays: notifyWeekdaysDraft }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? '저장 실패')
      setNotifyWeekdaysPersisted(notifyWeekdaysDraft)
      toast.success('알림 요일이 저장되었습니다.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSavingNotify(false)
    }
  }

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
    <div className="px-4 pb-6 pt-4 flex flex-col gap-5 max-w-2xl mx-auto w-full">
      <Toaster position="top-center" />

      {/* 헤더 */}
      <header className="text-center">
        <div className="inline-flex items-center gap-2 text-2xl font-bold text-text-primary">
          <span>🧰</span>
          <h1>장비관리보고</h1>
        </div>
        <p className="text-sm text-text-secondary mt-1.5 leading-relaxed break-keep">
          사용한 장비 사진을 남겨주세요.<br className="sm:hidden" />
          <span className="hidden sm:inline"> </span>
          하루 여러 번, 업장별로 보고 가능합니다.
        </p>
        {weekStart && (
          <p className="text-xs text-brand-600 font-semibold mt-2 inline-block bg-brand-50 px-3 py-1 rounded-full">
            이번 주 · {fmtWeek(weekStart)}
          </p>
        )}
      </header>

      {/* 재정리 요청 배너 */}
      {recentRecheck && (
        <div className="bg-state-warning-bg border border-state-warning rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle size={20} className="text-state-warning shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <p className="text-sm font-bold text-state-warning">관리자 재정리 요청</p>
            <p className="text-xs text-text-primary leading-relaxed">
              {fmtDateTime(recentRecheck.submitted_at)} 보고 건에 재정리 요청이 있습니다.
            </p>
            {recentRecheck.review_notes && (
              <div className="text-xs text-text-secondary bg-white rounded-lg px-3 py-2 mt-1 whitespace-pre-wrap leading-relaxed">
                {recentRecheck.review_notes}
              </div>
            )}
          </div>
        </div>
      )}

      {/* C-3: 보고 알림 요일 (정규 + 예비, 최대 2개) — 탭 위 상시 노출 */}
      <section className="bg-surface rounded-2xl border border-border-subtle p-4 shadow-soft">
        <div className="flex items-baseline justify-between mb-2">
          <label className="text-sm font-semibold text-text-primary">🔔 보고 알림 요일 (정규+예비)</label>
          {isNotifyDirty && !savingNotify && (
            <span className="text-[10px] text-amber-600">변경 있음 · 저장 필요</span>
          )}
        </div>
        <p className="text-[11px] text-text-tertiary leading-relaxed mb-3">
          매주 정한 요일 <b className="text-brand-700">밤 9시</b>에 &quot;장비 사진 보고 잊지 마세요&quot; 알림이 발송됩니다.
          <br />정규 요일 못 지키면 예비 요일도 함께 알림받도록 최대 2개 선택 가능.
        </p>
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAY_LABELS.map((label, day) => {
            const idx = notifyWeekdaysDraft.indexOf(day)
            const active = idx !== -1
            const isBackup = active && idx === 1 // 두 번째 선택 = 예비
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleNotifyWeekday(day)}
                disabled={savingNotify}
                className={`h-10 rounded-lg text-sm font-bold transition-all relative ${
                  active
                    ? (isBackup ? 'bg-brand-400 text-white shadow-soft' : 'bg-brand-600 text-white shadow-soft')
                    : 'bg-surface-sunken text-text-tertiary hover:bg-brand-50 hover:text-brand-600'
                } ${day === 0 && !active ? 'text-red-500' : ''} ${day === 6 && !active ? 'text-blue-500' : ''}`}
              >
                {label}
                {active && (
                  <span className="absolute -top-1 -right-1 text-[9px] bg-white text-brand-700 rounded-full px-1 shadow border border-brand-200 leading-tight">
                    {isBackup ? '예비' : '정규'}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={handleSaveNotifyWeekdays}
          disabled={!isNotifyDirty || savingNotify}
          className={`mt-3 w-full py-2 rounded-lg text-sm font-semibold transition-all ${
            isNotifyDirty && !savingNotify
              ? 'bg-brand-600 text-white hover:bg-brand-700'
              : 'bg-surface-sunken text-text-tertiary cursor-not-allowed'
          }`}
        >
          {savingNotify ? '저장 중...' : '알림 요일 저장'}
        </button>
      </section>

      {/* 세그먼트 탭 */}
      <div className="grid grid-cols-2 bg-surface-sunken rounded-xl p-1 gap-1">
        {([{ key: 'report', label: '보고 작성' }, { key: 'history', label: `이력 ${history.length}` }] as { key: Tab; label: string }[]).map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === t.key
                ? 'bg-surface text-brand-700 shadow-soft'
                : 'text-text-tertiary hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'report' && (
        <>
        <section className="bg-surface rounded-2xl border border-border-subtle p-5 space-y-5 shadow-soft">
          {/* 사진 슬롯 3장 */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <label className="text-sm font-semibold text-text-primary">
                사진 <span className="text-brand-600 font-bold">{draftPhotos.length}</span><span className="text-text-tertiary text-xs font-normal"> / 3</span>
              </label>
              <span className="text-[11px] text-text-tertiary">필수 · 최대 3장</span>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {draftPhotos.map((url, idx) => (
                <div key={idx} className="relative aspect-square group">
                  <button
                    type="button"
                    onClick={() => setZoomPhoto(url)}
                    className="w-full h-full rounded-xl overflow-hidden border-2 border-border-subtle hover:border-brand-300 transition-colors"
                    aria-label={`사진 ${idx + 1} 확대`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`draft ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeDraftPhoto(idx)}
                    className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center shadow-md hover:bg-red-600 active:scale-90 transition-transform"
                    aria-label="사진 제거"
                  >✕</button>
                  <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                    {idx + 1}
                  </span>
                </div>
              ))}
              {draftPhotos.length < 3 && (
                <label
                  htmlFor="rc-photo-add"
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all ${
                    uploading
                      ? 'border-2 border-gray-200 bg-gray-100'
                      : 'border-2 border-dashed border-brand-300 bg-brand-50/50 text-brand-600 hover:bg-brand-50 hover:border-brand-500 active:scale-95'
                  }`}
                >
                  {uploading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-brand-300 border-t-brand-600 rounded-full animate-spin" />
                      <span className="text-[11px] text-text-tertiary font-medium">업로드 중</span>
                    </>
                  ) : (
                    <>
                      <Camera size={24} strokeWidth={2} />
                      <span className="text-xs font-semibold">사진 추가</span>
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
          <div className="space-y-2">
            <label className="text-sm font-semibold text-text-primary block">
              메모 <span className="text-text-tertiary text-xs font-normal">(선택)</span>
            </label>
            <textarea
              value={draftNotes}
              onChange={e => setDraftNotes(e.target.value)}
              rows={3}
              placeholder="예: OO업장 마무리 · 새 걸레 필요"
              className="w-full border border-border rounded-xl px-3.5 py-2.5 text-sm leading-relaxed resize-none focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-shadow"
              maxLength={500}
            />
          </div>

          {/* 제출 버튼 */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || draftPhotos.length === 0}
            className={`w-full h-12 rounded-xl text-base font-bold flex items-center justify-center gap-2 transition-all ${
              submitting || draftPhotos.length === 0
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-brand-600 text-white hover:bg-brand-700 active:scale-[0.98] shadow-soft'
            }`}
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                제출 중
              </>
            ) : (
              <>
                <Send size={18} strokeWidth={2.5} />
                보고 제출
              </>
            )}
          </button>

          {/* 이번주 제출 안내 */}
          {thisWeekRecords.length > 0 && (
            <div className="flex items-center justify-center gap-2 text-xs text-text-secondary bg-brand-50 border border-brand-100 rounded-lg py-2 px-3">
              <CheckCircle2 size={14} className="text-brand-600" />
              <span>이번 주 이미 <b className="text-brand-700">{thisWeekRecords.length}건</b> 보고했어요</span>
            </div>
          )}
        </section>
        </>
      )}

      {activeTab === 'history' && (
        <section className="space-y-3">
          {history.length === 0 ? (
            <div className="bg-surface rounded-2xl border border-border-subtle p-10 text-center">
              <div className="w-14 h-14 mx-auto mb-3 bg-surface-sunken rounded-full flex items-center justify-center">
                <Camera size={24} className="text-text-tertiary" />
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">
                보고 이력이 없습니다.<br />
                <span className="text-text-tertiary text-xs">첫 보고를 남겨보세요!</span>
              </p>
            </div>
          ) : (
            history.map(h => {
              const photos = getPhotos(h)
              return (
                <article key={h.id} className="bg-surface rounded-2xl border border-border-subtle overflow-hidden shadow-soft">
                  {/* 카드 헤더 */}
                  <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border-subtle">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-text-primary">{fmtDateTime(h.submitted_at)}</p>
                      <p className="text-[11px] text-text-tertiary mt-0.5">{fmtWeek(h.week_start)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {h.review_status === 'approved' && (
                        <span className="text-[11px] font-semibold bg-state-success-bg text-state-success px-2 py-1 rounded-md">승인됨</span>
                      )}
                      {h.review_status === 'need_recheck' && (
                        <span className="text-[11px] font-semibold bg-state-warning-bg text-state-warning px-2 py-1 rounded-md">재정리</span>
                      )}
                      {!h.review_status && (
                        <span className="text-[11px] text-text-tertiary px-2 py-1">대기</span>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteRecord(h.id)}
                        className="w-7 h-7 rounded-md text-text-tertiary hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors"
                        aria-label="삭제"
                        title="삭제"
                      ><Trash2 size={14} /></button>
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
                        className={`w-full object-cover cursor-zoom-in hover:opacity-90 transition-opacity ${photos.length === 1 ? 'h-56' : 'h-28'}`}
                      />
                    ))}
                  </div>

                  {/* 메모 · 재정리 사유 */}
                  {(h.notes || (h.review_status === 'need_recheck' && h.review_notes)) && (
                    <div className="px-4 py-3 space-y-2">
                      {h.notes && (
                        <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
                          <span className="text-text-tertiary">메모</span> · {h.notes}
                        </p>
                      )}
                      {h.review_status === 'need_recheck' && h.review_notes && (
                        <div className="bg-state-warning-bg border border-state-warning rounded-lg px-3 py-2 text-xs text-text-primary leading-relaxed">
                          <p className="font-semibold text-state-warning mb-0.5">관리자 메모</p>
                          <p className="whitespace-pre-wrap">{h.review_notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              )
            })
          )}
        </section>
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
