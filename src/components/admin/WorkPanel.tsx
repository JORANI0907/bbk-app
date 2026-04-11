'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

interface WorkApp {
  id: string
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

function useCountdown(target: string | null) {
  const [remaining, setRemaining] = useState<number | null>(null)
  useEffect(() => {
    if (!target) { setRemaining(null); return }
    const tick = () => {
      const diff = Math.floor((new Date(target).getTime() - Date.now()) / 1000)
      setRemaining(diff > 0 ? diff : 0)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [target])
  return remaining
}

/** P1-15: 작업 시작 후 경과 초 실시간 측정 */
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
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatCountdown(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}분 ${String(s).padStart(2, '0')}초`
}

function toKST(date: Date): string {
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function postSlackWorkCancelNotice(businessName: string): Promise<void> {
  const webhookUrl = process.env.NEXT_PUBLIC_SLACK_WEBHOOK_URL
  if (!webhookUrl) return
  const text = `작업시작 취소\n• 현장: ${businessName}\n• 취소시각: ${toKST(new Date())}`
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).catch(() => undefined)
}

export function WorkPanel({ app, onUpdate }: Props) {
  const router = useRouter()
  const [customerMemo, setCustomerMemo] = useState(app.customer_memo ?? '')
  const [internalMemo, setInternalMemo] = useState(app.internal_memo ?? '')
  const [beforeChecked, setBeforeChecked] = useState(false)
  const [afterChecked, setAfterChecked] = useState(false)
  const [saving, setSaving] = useState(false)

  const countdown = useCountdown(app.notification_send_at)
  const status = app.work_status ?? 'pending'

  // P2-24: 정기엔드케어는 작업완료알림만 사용
  const isEndCare = app.service_type === '정기엔드케어'

  // P1-15: 진행 중 경과 시간
  const elapsed = useElapsed(app.work_started_at, status === 'in_progress')

  // P1-15: 완료 후 총 소요시간
  const totalElapsed = (() => {
    if (status !== 'completed' || !app.work_started_at || !app.work_completed_at) return null
    const diff = Math.floor(
      (new Date(app.work_completed_at).getTime() - new Date(app.work_started_at).getTime()) / 1000
    )
    return diff > 0 ? diff : null
  })()

  useEffect(() => { setCustomerMemo(app.customer_memo ?? '') }, [app.customer_memo])
  useEffect(() => { setInternalMemo(app.internal_memo ?? '') }, [app.internal_memo])

  const photosChecked = beforeChecked && afterChecked
  const canComplete = photosChecked && customerMemo.trim().length > 0

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

  // P1-14: 작업시작 취소
  async function handleCancelStart() {
    if (!confirm('작업시작을 취소하시겠습니까?')) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/applications/${app.id}/work`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel_start' }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onUpdate({ work_status: 'pending', work_started_at: null })
      toast.success('작업시작이 취소되었습니다.')
      await postSlackWorkCancelNotice(app.business_name)
    } catch (e) { toast.error(String(e)) }
    finally { setSaving(false) }
  }

  async function saveMemos() {
    const res = await fetch(`/api/admin/applications/${app.id}/work`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', customer_memo: customerMemo, internal_memo: internalMemo }),
    })
    if (!res.ok) throw new Error((await res.json()).error)
    onUpdate({ customer_memo: customerMemo, internal_memo: internalMemo })
  }

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
      const { send_at } = await res.json()
      onUpdate({
        work_status: 'completed',
        work_completed_at: new Date().toISOString(),
        notification_send_at: send_at,
        customer_memo: customerMemo,
        internal_memo: internalMemo,
      })
      toast.success('작업 완료! 1시간 후 고객에게 알림이 발송됩니다.')
    } catch (e) { toast.error(String(e)) }
    finally { setSaving(false) }
  }

  async function handleCancelNotification() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/applications/${app.id}/work`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel_notification' }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onUpdate({ notification_send_at: null })
      toast.success('알림 발송을 취소했습니다.')
    } catch (e) { toast.error(String(e)) }
    finally { setSaving(false) }
  }

  async function handleSendNow() {
    setSaving(true)
    try {
      await saveMemos()
      const res = await fetch(`/api/admin/applications/${app.id}/work`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_now' }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onUpdate({
        notification_sent_at: new Date().toISOString(),
        notification_send_at: null,
        customer_memo: customerMemo,
        internal_memo: internalMemo,
      })
      const label = isEndCare ? '엔드케어 작업완료 알림을 발송했습니다.' : '고객에게 알림을 발송했습니다.'
      toast.success(label)
      // P1-16: 발송 완료 후 배정관리 목록으로 이동
      router.push('/admin/schedule')
    } catch (e) { toast.error(String(e)) }
    finally { setSaving(false) }
  }

  return (
    <section>
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">작업 현황</p>

      {/* P2-24: 정기엔드케어 안내 배너 */}
      {isEndCare && (
        <div className="mb-3 px-3 py-2 bg-violet-50 border border-violet-200 rounded-lg">
          <p className="text-xs text-violet-700 font-semibold">정기엔드케어</p>
          <p className="text-xs text-violet-500 mt-0.5">작업완료알림만 발송됩니다 (카카오 알림톡 전용 템플릿)</p>
        </div>
      )}

      {/* 대기 중 */}
      {status === 'pending' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">작업이 아직 시작되지 않았습니다.</p>
          <button
            onClick={handleStart}
            disabled={saving}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm"
          >
            {saving ? '처리 중...' : '▶ 작업 시작'}
          </button>
        </div>
      )}

      {/* 진행 중 */}
      {status === 'in_progress' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
              진행 중
            </span>
            {/* P1-15: 경과 시간 실시간 표시 */}
            <span className="text-xs font-mono text-orange-600 bg-orange-50 px-2 py-0.5 rounded-lg">
              {formatSeconds(elapsed)}
            </span>
            {app.work_started_at && (
              <span className="text-xs text-gray-400">
                {new Date(app.work_started_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 시작
              </span>
            )}
          </div>

          {/* P1-14: 작업시작 취소 버튼 */}
          <button
            onClick={handleCancelStart}
            disabled={saving}
            className="w-full py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-600 font-medium rounded-xl text-xs border border-gray-200 transition-colors"
          >
            {saving ? '처리 중...' : '↩ 작업시작 취소'}
          </button>

          {/* 사진 업로드 */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-600">사진 업로드</p>
              {app.drive_folder_url ? (
                <a
                  href={app.drive_folder_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors"
                >
                  Google Drive 열기
                </a>
              ) : (
                <span className="text-xs text-amber-600">Drive 폴더 미생성</span>
              )}
            </div>
            <p className="text-xs text-gray-400">Drive에서 작업 전/후 사진을 업로드한 후 아래를 체크해주세요.</p>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={beforeChecked}
                  onChange={e => setBeforeChecked(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-700">작업 전 사진 업로드 완료</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={afterChecked}
                  onChange={e => setAfterChecked(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-700">작업 후 사진 업로드 완료</span>
              </label>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">
              고객 전달 특이사항 <span className="text-red-400">*</span>
            </label>
            <textarea
              value={customerMemo}
              onChange={e => setCustomerMemo(e.target.value)}
              onBlur={saveMemos}
              placeholder="고객에게 전달할 내용 (완료 알림 SMS에 포함됩니다)"
              rows={3}
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">내부 메모</label>
            <textarea
              value={internalMemo}
              onChange={e => setInternalMemo(e.target.value)}
              onBlur={saveMemos}
              placeholder="내부 참고용 메모 (고객에게 발송되지 않음)"
              rows={2}
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-gray-50"
            />
          </div>

          {!canComplete && (
            <div className="text-xs text-gray-400 space-y-0.5">
              {!photosChecked && <p>• 사진 업로드 체크박스를 모두 확인해주세요</p>}
              {customerMemo.trim().length === 0 && <p>• 고객 전달 특이사항을 작성해주세요</p>}
            </div>
          )}

          <button
            onClick={handleComplete}
            disabled={!canComplete || saving}
            className={`w-full py-3 font-semibold rounded-xl text-sm ${
              canComplete && !saving
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {saving ? '처리 중...' : '✅ 작업 완료'}
          </button>
        </div>
      )}

      {/* 완료 */}
      {status === 'completed' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
              작업 완료
            </span>
            {app.work_completed_at && (
              <span className="text-xs text-gray-400">
                {new Date(app.work_completed_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {/* P1-15: 총 소요시간 표시 */}
            {totalElapsed !== null && (
              <span className="text-xs font-mono text-green-600 bg-green-50 px-2 py-0.5 rounded-lg">
                소요: {formatSeconds(totalElapsed)}
              </span>
            )}
          </div>

          {app.drive_folder_url && (
            <a
              href={app.drive_folder_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors"
            >
              Google Drive 열기
            </a>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">고객 전달 특이사항</label>
            <textarea
              value={customerMemo}
              onChange={e => setCustomerMemo(e.target.value)}
              onBlur={saveMemos}
              disabled={!!app.notification_sent_at}
              rows={3}
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">내부 메모</label>
            <textarea
              value={internalMemo}
              onChange={e => setInternalMemo(e.target.value)}
              onBlur={saveMemos}
              rows={2}
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-gray-50"
            />
          </div>

          {/* P2-24: 정기엔드케어는 예약 관련 알림 버튼 숨김, 작업완료알림만 표시 */}
          {app.notification_sent_at ? (
            <div className="bg-green-50 rounded-xl px-3 py-2.5 flex items-center gap-2">
              <p className="text-xs font-semibold text-green-700">
                {isEndCare ? '엔드케어 작업완료 알림 발송 완료' : '고객 알림 발송 완료'}
              </p>
              <p className="text-xs text-green-600">
                {new Date(app.notification_sent_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          ) : app.notification_send_at && countdown !== null ? (
            <div className="bg-amber-50 rounded-xl px-3 py-2.5 space-y-2">
              <p className="text-xs font-semibold text-amber-700">
                {isEndCare ? '엔드케어 작업완료 알림 발송 대기 중' : '고객 알림 발송 대기 중'}
              </p>
              <p className="text-xs text-amber-600 font-mono">
                {countdown > 0 ? `${formatCountdown(countdown)} 후 자동 발송` : '곧 발송됩니다...'}
              </p>
              <div className="flex gap-2">
                <button onClick={handleSendNow} disabled={saving}
                  className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg">
                  지금 발송
                </button>
                <button onClick={handleCancelNotification} disabled={saving}
                  className="flex-1 py-1.5 bg-white hover:bg-gray-50 disabled:opacity-50 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg">
                  발송 취소
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="bg-gray-50 rounded-xl px-3 py-2">
                <p className="text-xs text-gray-400">
                  {app.notification_send_at === null && app.notification_sent_at === null
                    ? '알림 발송이 취소됐습니다.'
                    : '알림을 수동으로 발송할 수 있습니다.'}
                </p>
              </div>
              {/* 취소 후 재발송 버튼 */}
              <button onClick={handleSendNow} disabled={saving}
                className="w-full py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg">
                {saving ? '발송 중...' : isEndCare ? '엔드케어 작업완료 알림 발송' : '작업완료 알림 발송'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
