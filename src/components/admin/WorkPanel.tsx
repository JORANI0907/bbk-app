'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'

interface WorkApp {
  id: string
  status?: string | null
  work_status: string | null
  work_started_at: string | null
  work_completed_at: string | null
  customer_memo: string | null
  internal_memo: string | null
  notification_send_at: string | null
  notification_sent_at: string | null
  drive_folder_url: string | null
  business_name: string
  owner_name: string
  service_type?: string | null
}

interface Props {
  app: WorkApp
  onUpdate: (updates: Partial<WorkApp>) => void
}

function useElapsed(startedAt: string | null, active: boolean): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startedAt || !active) { setElapsed(0); return }
    const tick = () => {
      const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
      setElapsed(diff > 0 ? diff : 0)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt, active])
  return elapsed
}

function formatSeconds(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function WorkPanel({ app, onUpdate }: Props) {
  const [customerMemo, setCustomerMemo] = useState(app.customer_memo ?? '')
  const [internalMemo, setInternalMemo] = useState(app.internal_memo ?? '')
  const [beforeChecked, setBeforeChecked] = useState(false)
  const [afterChecked, setAfterChecked] = useState(false)
  const [saving, setSaving] = useState(false)

  const status = app.work_status ?? 'pending'
  const elapsed = useElapsed(app.work_started_at, status === 'in_progress')

  const totalElapsed = (() => {
    if (status !== 'completed' || !app.work_started_at || !app.work_completed_at) return null
    const diff = Math.floor(
      (new Date(app.work_completed_at).getTime() - new Date(app.work_started_at).getTime()) / 1000,
    )
    return diff > 0 ? diff : null
  })()

  useEffect(() => { setCustomerMemo(app.customer_memo ?? '') }, [app.customer_memo])
  useEffect(() => { setInternalMemo(app.internal_memo ?? '') }, [app.internal_memo])

  const photosChecked = beforeChecked && afterChecked
  const canComplete = photosChecked && customerMemo.trim().length > 0

  async function saveMemos() {
    const res = await fetch(`/api/admin/applications/${app.id}/work`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', customer_memo: customerMemo, internal_memo: internalMemo }),
    })
    if (!res.ok) throw new Error((await res.json()).error)
    onUpdate({ customer_memo: customerMemo, internal_memo: internalMemo })
  }

  // ── 1단계: 작업 시작 ──────────────────────────────────────────
  async function handleStart() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/applications/${app.id}/work`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onUpdate({ work_status: 'in_progress', work_started_at: new Date().toISOString() })
      toast.success('작업을 시작했습니다.')
    } catch (e) { toast.error(String(e)) }
    finally { setSaving(false) }
  }

  // ── 2단계: 작업 완료 (알림 발송 없이 상태만 저장) ──────────────
  async function handleComplete() {
    if (!canComplete) return
    setSaving(true)
    try {
      await saveMemos()
      const res = await fetch(`/api/admin/applications/${app.id}/work`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', customer_memo: customerMemo, internal_memo: internalMemo }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onUpdate({
        work_status: 'completed',
        work_completed_at: new Date().toISOString(),
        notification_send_at: null,
        customer_memo: customerMemo,
        internal_memo: internalMemo,
      })
      toast.success('작업 완료! 내용을 확인한 후 알림을 발송해주세요.')
    } catch (e) { toast.error(String(e)) }
    finally { setSaving(false) }
  }

  // ── 3단계: 알림 발송 ──────────────────────────────────────────
  async function handleSendNow() {
    setSaving(true)
    try {
      await saveMemos()
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: app.id, type: '작업완료알림', method: 'manual' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onUpdate({
        notification_sent_at: new Date().toISOString(),
        notification_send_at: null,
        customer_memo: customerMemo,
        internal_memo: internalMemo,
        ...(data.new_status ? { status: data.new_status } : {}),
      })
      toast.success('고객에게 작업완료 알림을 발송했습니다.')
    } catch (e) { toast.error(String(e)) }
    finally { setSaving(false) }
  }

  // ─── 단계 표시줄 ─────────────────────────────────────────────
  const step = status === 'pending' ? 1 : status === 'in_progress' ? 2 : app.notification_sent_at ? 4 : 3
  const steps = ['작업시작', '작업중', '작업완료', '알림발송']

  return (
    <section>
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">작업 현황</p>

      {/* 단계 표시줄 */}
      <div className="flex items-center mb-4">
        {steps.map((label, i) => {
          const idx = i + 1
          const done = step > idx
          const active = step === idx
          return (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-0.5">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                  ${done ? 'bg-green-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                  {done ? '✓' : idx}
                </div>
                <span className={`text-[10px] font-medium whitespace-nowrap
                  ${done ? 'text-green-600' : active ? 'text-blue-600' : 'text-gray-400'}`}>
                  {label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 mb-4 ${done ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* ── 1단계: 대기 중 ── */}
      {status === 'pending' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">작업 준비가 되면 시작 버튼을 눌러주세요.</p>
          <button
            onClick={handleStart}
            disabled={saving}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm"
          >
            {saving ? '처리 중...' : '▶ 작업 시작'}
          </button>
        </div>
      )}

      {/* ── 2단계: 진행 중 ── */}
      {status === 'in_progress' && (
        <div className="space-y-3">
          {/* 진행 상태 바 */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
              작업 진행 중
            </span>
            {app.work_started_at && (
              <span className="text-xs text-gray-400">
                {new Date(app.work_started_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 시작
              </span>
            )}
            {elapsed > 0 && (
              <span className="text-xs font-mono text-orange-500 ml-auto">{formatSeconds(elapsed)}</span>
            )}
          </div>

          {/* 사진 업로드 체크 */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-600">사진 업로드 확인</p>
              {app.drive_folder_url ? (
                <a href={app.drive_folder_url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors">
                  Google Drive 열기
                </a>
              ) : (
                <span className="text-xs text-amber-600">Drive 폴더 미생성</span>
              )}
            </div>
            <p className="text-xs text-gray-400">Drive에서 전/후 사진 업로드 후 체크해주세요.</p>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={beforeChecked} onChange={e => setBeforeChecked(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-xs text-gray-700">작업 전 사진 업로드 완료</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={afterChecked} onChange={e => setAfterChecked(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-xs text-gray-700">작업 후 사진 업로드 완료</span>
              </label>
            </div>
          </div>

          {/* 메모 */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">
              고객 전달 특이사항 <span className="text-red-400">*</span>
            </label>
            <textarea value={customerMemo} onChange={e => setCustomerMemo(e.target.value)} onBlur={saveMemos}
              placeholder="고객에게 전달할 내용 (완료 알림에 포함됩니다)" rows={3}
              className="w-full text-xs text-gray-900 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">내부 메모</label>
            <textarea value={internalMemo} onChange={e => setInternalMemo(e.target.value)} onBlur={saveMemos}
              placeholder="내부 참고용 (고객에게 발송되지 않음)" rows={2}
              className="w-full text-xs text-gray-900 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-gray-50" />
          </div>

          {!canComplete && (
            <div className="text-xs text-gray-400 space-y-0.5">
              {!photosChecked && <p>• 사진 업로드 체크박스를 모두 확인해주세요</p>}
              {customerMemo.trim().length === 0 && <p>• 고객 전달 특이사항을 작성해주세요</p>}
            </div>
          )}

          <button onClick={handleComplete} disabled={!canComplete || saving}
            className={`w-full py-3 font-semibold rounded-xl text-sm ${canComplete && !saving
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
            {saving ? '처리 중...' : '✅ 작업 완료'}
          </button>

          <button
            onClick={async () => {
              if (!confirm('작업 시작을 취소하시겠습니까?')) return
              setSaving(true)
              try {
                const res = await fetch(`/api/admin/applications/${app.id}/work`, {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'cancel_start' }),
                })
                if (!res.ok) throw new Error((await res.json()).error)
                onUpdate({ work_status: 'pending', work_started_at: null })
                toast.success('작업 시작이 취소되었습니다.')
              } catch (e) { toast.error(String(e)) }
              finally { setSaving(false) }
            }}
            disabled={saving}
            className="w-full py-2 bg-white hover:bg-red-50 border border-gray-200 hover:border-red-200 text-gray-500 hover:text-red-600 text-xs font-semibold rounded-xl transition-colors"
          >
            작업시작 취소
          </button>
        </div>
      )}

      {/* ── 3단계: 작업완료 후 알림발송 대기 ── */}
      {status === 'completed' && (
        <div className="space-y-3">
          {/* 완료 헤더 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
              ✅ 작업 완료
            </span>
            {app.work_completed_at && (
              <span className="text-xs text-gray-400">
                {new Date(app.work_completed_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {totalElapsed !== null && (
              <span className="text-xs text-gray-400 ml-auto">소요 {formatSeconds(totalElapsed)}</span>
            )}
          </div>

          {/* Drive 링크 */}
          {app.drive_folder_url && (
            <a href={app.drive_folder_url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors">
              📁 Google Drive 사진 확인
            </a>
          )}

          {/* 메모 수정 가능 (알림 발송 전까지) */}
          <div className={`rounded-xl p-3 space-y-3 border ${app.notification_sent_at ? 'bg-gray-50 border-gray-200' : 'bg-blue-50 border-blue-200'}`}>
            {!app.notification_sent_at && (
              <p className="text-xs text-blue-600 font-semibold">📝 알림 발송 전 내용을 수정할 수 있습니다</p>
            )}
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">고객 전달 특이사항</label>
              <textarea value={customerMemo} onChange={e => setCustomerMemo(e.target.value)} onBlur={saveMemos}
                disabled={!!app.notification_sent_at} rows={3}
                className="w-full text-xs text-gray-900 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-white disabled:text-gray-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">내부 메모</label>
              <textarea value={internalMemo} onChange={e => setInternalMemo(e.target.value)} onBlur={saveMemos}
                rows={2}
                className="w-full text-xs text-gray-900 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white" />
            </div>
          </div>

          {/* 알림 발송 버튼 or 발송 완료 표시 */}
          {app.notification_sent_at ? (
            <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-green-700">✅ 알림 발송 완료</p>
                <p className="text-xs text-green-600 mt-0.5">
                  {new Date(app.notification_sent_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <button onClick={handleSendNow} disabled={saving}
                className="shrink-0 text-xs px-3 py-1.5 bg-white border border-green-300 text-green-700 hover:bg-green-50 rounded-lg font-semibold disabled:opacity-50">
                {saving ? '발송 중...' : '재발송'}
              </button>
            </div>
          ) : (
            <button onClick={handleSendNow} disabled={saving}
              className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-xl text-sm">
              {saving ? '발송 중...' : '📣 작업완료 알림 발송'}
            </button>
          )}

          {/* 작업완료 취소 (알림 미발송 시에만) */}
          {!app.notification_sent_at && (
            <button
              onClick={async () => {
                if (!confirm('작업 완료를 취소하시겠습니까?')) return
                setSaving(true)
                try {
                  const res = await fetch(`/api/admin/applications/${app.id}/work`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'cancel_complete' }),
                  })
                  if (!res.ok) throw new Error((await res.json()).error)
                  onUpdate({ work_status: 'in_progress', work_completed_at: null, notification_send_at: null })
                  toast.success('작업 완료가 취소되었습니다.')
                } catch (e) { toast.error(String(e)) }
                finally { setSaving(false) }
              }}
              disabled={saving}
              className="w-full py-2 bg-white hover:bg-red-50 border border-gray-200 hover:border-red-200 text-gray-500 hover:text-red-600 text-xs font-semibold rounded-xl transition-colors"
            >
              작업완료 취소 (내용 수정하러 가기)
            </button>
          )}
        </div>
      )}
    </section>
  )
}
