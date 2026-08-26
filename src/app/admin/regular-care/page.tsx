'use client'

/**
 * Batch B-후속-12: 관리자용 장비관리보고 대시보드 (다중 보고 지원)
 * - 이번 주 진행률 카드 (워커 대비 제출률)
 * - 제출완료 + 미제출자 통합 카드 (색상 구분)
 * - 이번 주 모든 보고 리스트 (개별 레코드 카드, 최신순)
 *   · 워커 이름 + 시각 + 사진 그리드 + 메모 + 검토 승인/재정리 요청
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ArrowLeft, Wrench, CheckCircle2, Clock } from 'lucide-react'

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

interface ListItem {
  worker_id: string
  worker_name: string
  worker_phone: string | null
  submitted: boolean
  submitted_count: number
  records: CareRecord[]
}

function getPhotos(r: CareRecord): string[] {
  if (r.photo_urls && r.photo_urls.length > 0) return r.photo_urls
  return r.photo_url ? [r.photo_url] : []
}

function getWeekStartMonday(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const dow = d.getUTCDay()
  const diff = dow === 0 ? -6 : 1 - dow
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

function shiftWeek(iso: string, weeks: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + weeks * 7)
  return d.toISOString().slice(0, 10)
}

function fmtRange(iso: string): string {
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

export default function AdminRegularCarePage() {
  const today = new Date().toISOString().slice(0, 10)
  const [week, setWeek] = useState(getWeekStartMonday(today))
  const [list, setList] = useState<ListItem[]>([])
  const [pct, setPct] = useState<number | null>(null)
  const [submittedCount, setSubmittedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/regular-care?week=${week}`)
      const json = await res.json()
      if (json.ok) {
        setList(json.list ?? [])
        setPct(json.pct)
        setSubmittedCount(json.submitted_count ?? 0)
        setTotalCount(json.total_workers ?? 0)
      }
    } catch {
      toast.error('로드 실패')
    } finally {
      setLoading(false)
    }
  }, [week])

  useEffect(() => { load() }, [load])

  const review = async (id: string, status: 'approved' | 'need_recheck') => {
    try {
      const res = await fetch('/api/admin/regular-care', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          review_status: status,
          review_notes: status === 'need_recheck' ? (reviewNotes || null) : null,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? '저장 실패')
      toast.success(status === 'approved' ? '승인됨' : '재정리 요청 발송')
      setReviewingId(null)
      setReviewNotes('')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    }
  }

  const submitted = list.filter(x => x.submitted)
  const notSubmitted = list.filter(x => !x.submitted)
  // 이번주 전체 레코드 (시간순 flat)
  const allRecords = submitted.flatMap(w => w.records.map(r => ({ ...r, worker_name: w.worker_name })))
                            .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))
  const totalReports = allRecords.length

  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Link href="/admin" className="text-text-tertiary hover:text-brand-600"><ArrowLeft size={18} /></Link>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Wrench size={20} className="text-brand-600" /> 장비관리보고
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeek(shiftWeek(week, -1))}
            className="px-3 py-1.5 border border-border rounded-lg text-sm hover:bg-surface-sunken"
          >이전 주</button>
          <span className="text-sm font-semibold text-text-primary min-w-[140px] text-center">
            {fmtRange(week)}
          </span>
          <button
            onClick={() => setWeek(shiftWeek(week, 1))}
            disabled={week >= getWeekStartMonday(today)}
            className="px-3 py-1.5 border border-border rounded-lg text-sm hover:bg-surface-sunken disabled:opacity-40"
          >다음 주</button>
        </div>
      </div>

      {/* 진행률 카드 */}
      <div className="bg-surface border border-border-subtle rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-text-tertiary">이번 주 제출 현황</p>
          <p className="text-2xl font-bold text-brand-600">{pct !== null ? `${pct}%` : '-'}</p>
        </div>
        <div className="bg-surface-sunken rounded-full h-3 overflow-hidden">
          <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${pct ?? 0}%` }} />
        </div>
        <p className="text-xs text-text-secondary mt-2">
          전체 {totalCount}명 중 <b className="text-state-success">{submittedCount}명 제출</b>, {totalCount - submittedCount}명 미제출
          <span className="text-text-tertiary ml-1">· 총 {totalReports}건 보고</span>
        </p>
      </div>

      {loading ? (
        <p className="p-6 text-center text-text-tertiary text-sm">불러오는 중…</p>
      ) : (
        <>
          {/* 제출 현황 통합 카드 */}
          {(submitted.length > 0 || notSubmitted.length > 0) && (
            <div className="bg-surface border border-border-subtle rounded-2xl p-4 space-y-3">
              {submitted.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-state-success mb-2 flex items-center gap-1">
                    <CheckCircle2 size={14} /> 제출완료 ({submitted.length}명)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {submitted.map(w => (
                      <span key={w.worker_id} className="text-xs bg-state-success-bg border border-state-success rounded-full px-2 py-1 text-state-success font-medium">
                        {w.worker_name}
                        {w.submitted_count > 1 && <span className="ml-1 text-[10px]">×{w.submitted_count}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {notSubmitted.length > 0 && (
                <div className={submitted.length > 0 ? 'pt-3 border-t border-border-subtle' : ''}>
                  <p className="text-sm font-semibold text-state-warning mb-2 flex items-center gap-1">
                    <Clock size={14} /> 미제출 ({notSubmitted.length}명)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {notSubmitted.map(w => (
                      <span key={w.worker_id} className="text-xs bg-state-warning-bg border border-state-warning rounded-full px-2 py-1 text-state-warning font-medium">
                        {w.worker_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 이번 주 모든 보고 카드 리스트 (최신순) */}
          {allRecords.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-text-primary mb-2">📋 이번 주 보고 ({totalReports}건)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {allRecords.map(r => {
                  const photos = getPhotos(r)
                  const isReviewing = reviewingId === r.id
                  return (
                    <div key={r.id} className="bg-surface border border-border-subtle rounded-xl overflow-hidden">
                      {/* 사진 그리드 */}
                      <div className={`grid gap-0.5 ${photos.length === 1 ? 'grid-cols-1' : photos.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                        {photos.map((url, idx) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={idx}
                            src={url}
                            alt={`${r.worker_name} ${idx + 1}`}
                            className={`w-full object-cover cursor-zoom-in hover:opacity-90 ${photos.length === 1 ? 'h-32' : 'h-20'}`}
                            onClick={() => setZoomPhoto(url)}
                            title="🔍 클릭하여 확대"
                          />
                        ))}
                      </div>

                      <div className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-text-primary">{r.worker_name}</p>
                          {r.review_status === 'approved' && (
                            <span className="text-[10px] bg-state-success-bg text-state-success px-1.5 py-0.5 rounded">✅ 승인</span>
                          )}
                          {r.review_status === 'need_recheck' && (
                            <span className="text-[10px] bg-state-warning-bg text-state-warning px-1.5 py-0.5 rounded">⚠️ 재정리</span>
                          )}
                          {!r.review_status && (
                            <span className="text-[10px] text-text-tertiary">검토대기</span>
                          )}
                        </div>
                        <p className="text-[10px] text-text-tertiary">{fmtDateTime(r.submitted_at)}</p>
                        {r.notes && <p className="text-xs text-text-secondary whitespace-pre-wrap">📝 {r.notes}</p>}

                        {isReviewing ? (
                          <div className="space-y-2 pt-2 border-t border-border-subtle">
                            <textarea
                              value={reviewNotes}
                              onChange={e => setReviewNotes(e.target.value)}
                              placeholder="재정리 요청 사유 (선택)"
                              rows={2}
                              className="w-full text-xs border border-border rounded-md px-2 py-1.5 resize-none"
                            />
                            <div className="flex gap-1">
                              <button onClick={() => review(r.id, 'approved')} className="flex-1 text-xs bg-state-success-bg text-state-success py-1.5 rounded-md font-semibold">승인</button>
                              <button onClick={() => review(r.id, 'need_recheck')} className="flex-1 text-xs bg-state-warning-bg text-state-warning py-1.5 rounded-md font-semibold">재정리</button>
                              <button onClick={() => { setReviewingId(null); setReviewNotes('') }} className="text-xs px-2 text-text-tertiary">취소</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setReviewingId(r.id); setReviewNotes(r.review_notes ?? '') }}
                            className="w-full text-xs text-brand-600 hover:underline py-1 border-t border-border-subtle mt-2 pt-2"
                          >{r.review_status ? '검토 재작성' : '검토하기'}</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {submitted.length === 0 && notSubmitted.length === 0 && (
            <div className="p-6 text-center text-text-tertiary text-sm bg-surface border border-border-subtle rounded-2xl">
              작업자가 없습니다.
            </div>
          )}
        </>
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
