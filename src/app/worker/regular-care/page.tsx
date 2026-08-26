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
  photo_url: string
  notes: string | null
  submitted_at: string
  review_status: 'approved' | 'need_recheck' | null
  review_notes: string | null
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/worker/regular-care')
      const json = await res.json()
      if (json.ok) {
        setRecord(json.record)
        setWeekStart(json.week_start)
        if (json.record?.notes) setNotes(json.record.notes)
      }
    } catch {
      toast.error('로드 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const original = e.target.files?.[0]
    if (!original) return
    if (original.size > 20 * 1024 * 1024) {
      toast.error('파일 크기는 20MB 이하여야 합니다.')
      return
    }
    setUploading(true)
    try {
      // Batch B-2: 업로드 전 자동 2MB 이하로 리사이즈 (클라이언트 side)
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

      // 2) 레코드 저장
      const saveRes = await fetch('/api/worker/regular-care', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_url: upJson.url, notes: notes || null }),
      })
      const saveJson = await saveRes.json()
      if (!saveRes.ok || !saveJson.ok) throw new Error(saveJson.error ?? '저장 실패')

      toast.success('제출 완료!')
      setRecord(saveJson.record)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '제출 실패')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const saveNotes = async () => {
    if (!record) return
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
    }
  }

  if (loading) {
    return <div className="p-6 text-center text-text-tertiary text-sm">불러오는 중...</div>
  }

  return (
    <div className="px-4 pb-6 flex flex-col gap-5">
      <Toaster position="top-center" />

      <div className="text-center pt-2">
        <h1 className="text-xl font-bold text-text-primary">🧰 장비관리보고</h1>
        <p className="text-xs text-text-tertiary mt-1">이번 주 사용한 장비 사진을 1장 보고해주세요</p>
        {weekStart && <p className="text-xs text-brand-600 font-medium mt-1">{fmtWeek(weekStart)}</p>}
      </div>

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

          {/* 사진 미리보기 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={record.photo_url} alt="정기관리 사진" className="w-full rounded-xl border border-border-subtle" />

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
              className="mt-2 text-xs text-brand-600 hover:underline"
            >메모 저장</button>
          </div>

          {/* 재제출 버튼 */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
              id="rc-photo-input"
            />
            <label
              htmlFor="rc-photo-input"
              className={`w-full block text-center py-3 rounded-xl text-sm font-semibold cursor-pointer ${uploading ? 'bg-gray-300 text-gray-500' : 'bg-surface-sunken text-text-secondary hover:bg-brand-50'}`}
            >
              {uploading ? '업로드 중...' : <><RefreshCw size={14} className="inline mr-1" /> 사진 다시 찍기</>}
            </label>
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
            이번 주 정기관리 사진을<br />아직 제출하지 않았습니다.
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
    </div>
  )
}
