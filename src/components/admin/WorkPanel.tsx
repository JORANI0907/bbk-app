'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'

interface Photo {
  id: string
  photo_type: 'before' | 'after'
  drive_file_id: string
  web_view_link: string
  thumbnail_link: string | null
  created_at: string
}

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

function formatCountdown(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}분 ${String(s).padStart(2, '0')}초`
}

function extractFolderId(url: string): string | null {
  const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : null
}

async function getOrCreateSubfolder(parentId: string, name: string, token: string): Promise<string> {
  const q = encodeURIComponent(
    `'${parentId}' in parents AND name='${name}' AND mimeType='application/vnd.google-apps.folder' AND trashed=false`
  )
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const data = await res.json()
  if (data.files?.length > 0) return data.files[0].id

  const createRes = await fetch(
    'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
    }
  )
  const folder = await createRes.json()
  return folder.id as string
}

export function WorkPanel({ app, onUpdate }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [customerMemo, setCustomerMemo] = useState(app.customer_memo ?? '')
  const [internalMemo, setInternalMemo] = useState(app.internal_memo ?? '')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'before' | 'after'>('before')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const tokenRef = useRef<string | null>(null)
  const countdown = useCountdown(app.notification_send_at)

  const status = app.work_status ?? 'pending'
  const hasDrive = !!app.drive_folder_url

  const loadPhotos = useCallback(async () => {
    const res = await fetch(`/api/admin/applications/${app.id}/photos`)
    if (res.ok) setPhotos((await res.json()).photos ?? [])
  }, [app.id])

  useEffect(() => {
    if (status === 'in_progress' || status === 'completed') loadPhotos()
  }, [status, loadPhotos])

  useEffect(() => { setCustomerMemo(app.customer_memo ?? '') }, [app.customer_memo])
  useEffect(() => { setInternalMemo(app.internal_memo ?? '') }, [app.internal_memo])

  const canComplete = photos.length > 0 && customerMemo.trim().length > 0

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
      onUpdate({ notification_sent_at: new Date().toISOString(), notification_send_at: null, customer_memo: customerMemo, internal_memo: internalMemo })
      toast.success('고객에게 알림을 발송했습니다.')
    } catch (e) { toast.error(String(e)) }
    finally { setSaving(false) }
  }

  function handleUploadClick() {
    if (!hasDrive) {
      toast.error('서비스 관리에서 Drive 폴더를 먼저 생성해주세요.')
      return
    }
    // user gesture와 직결되게 즉시 파일 선택창 열기
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return

    const folderId = extractFolderId(app.drive_folder_url!)
    if (!folderId) { toast.error('올바르지 않은 Drive 폴더 URL입니다.'); return }

    setUploading(true)
    try {
      // 파일 선택 후 Google OAuth 실행
      const { loadGoogleAPIs, requestGoogleToken, uploadFileToDrive } = await import('@/lib/googleDrive')
      await loadGoogleAPIs()
      const token = await requestGoogleToken()

      const subfolderName = activeTab === 'before' ? '작업 전' : '작업 후'
      const subfolderId = await getOrCreateSubfolder(folderId, subfolderName, token)

      let uploaded = 0
      for (const file of files) {
        const { default: imageCompression } = await import('browser-image-compression')
        const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true })
        const safeDate = (app.work_started_at ?? new Date().toISOString()).slice(0, 10).replace(/-/g, '')
        const safeName = app.business_name.replace(/[/\\:*?"<>|]/g, '_')
        const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
        const fileName = `${safeDate}_${safeName}_${Date.now()}.${ext}`

        const { fileId, fileUrl } = await uploadFileToDrive(
          new File([compressed], fileName, { type: compressed.type }),
          subfolderId,
          fileName,
          token,
        )

        const res = await fetch(`/api/admin/applications/${app.id}/photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ drive_file_id: fileId, web_view_link: fileUrl, thumbnail_link: null, photo_type: activeTab }),
        })
        if (res.ok) {
          const { photo } = await res.json()
          setPhotos(prev => [...prev, photo])
          uploaded++
        }
      }
      toast.success(`사진 ${uploaded}장 업로드 완료`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '업로드 실패')
    } finally {
      setUploading(false)
      tokenRef.current = null
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDeletePhoto(photoId: string) {
    if (!confirm('목록에서 제거하시겠습니까? (Drive 파일은 유지됩니다)')) return
    try {
      const res = await fetch(`/api/admin/applications/${app.id}/photos/${photoId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
      setPhotos(prev => prev.filter(p => p.id !== photoId))
    } catch (e) { toast.error(String(e)) }
  }

  const beforePhotos = photos.filter(p => p.photo_type === 'before')
  const afterPhotos = photos.filter(p => p.photo_type === 'after')
  const currentPhotos = activeTab === 'before' ? beforePhotos : afterPhotos

  return (
    <section>
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">작업 현황</p>

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
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
              진행 중
            </span>
            {app.work_started_at && (
              <span className="text-xs text-gray-400">
                {new Date(app.work_started_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 시작
              </span>
            )}
          </div>

          <div className="flex gap-1">
            {(['before', 'after'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {tab === 'before' ? `작업 전 (${beforePhotos.length})` : `작업 후 (${afterPhotos.length})`}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {currentPhotos.map(photo => (
              <div key={photo.id} className="relative aspect-square group">
                <a href={photo.web_view_link} target="_blank" rel="noreferrer"
                  className="block w-full h-full bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 text-xs font-medium hover:bg-blue-100">
                  📄 보기
                </a>
                <button onClick={() => handleDeletePhoto(photo.id)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs hidden group-hover:flex items-center justify-center">
                  ✕
                </button>
              </div>
            ))}
            <button onClick={handleUploadClick} disabled={uploading}
              className="aspect-square border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center gap-1 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-40">
              {uploading
                ? <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                : <span className="text-gray-400 text-lg">+</span>}
            </button>
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />

          {!hasDrive && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-2 py-1.5">⚠ 서비스 관리에서 Google Drive 폴더를 먼저 생성해주세요</p>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">고객 전달 특이사항 <span className="text-red-400">*</span></label>
            <textarea value={customerMemo} onChange={e => setCustomerMemo(e.target.value)} onBlur={saveMemos}
              placeholder="고객에게 전달할 내용 (완료 알림 SMS에 포함됩니다)"
              rows={3} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">내부 메모</label>
            <textarea value={internalMemo} onChange={e => setInternalMemo(e.target.value)} onBlur={saveMemos}
              placeholder="내부 참고용 메모 (고객에게 발송되지 않음)"
              rows={2} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-gray-50" />
          </div>

          {!canComplete && (
            <div className="text-xs text-gray-400 space-y-0.5">
              {photos.length === 0 && <p>• 사진을 1장 이상 업로드해주세요</p>}
              {customerMemo.trim().length === 0 && <p>• 고객 전달 특이사항을 작성해주세요</p>}
            </div>
          )}

          <button onClick={handleComplete} disabled={!canComplete || saving}
            className={`w-full py-3 font-semibold rounded-xl text-sm ${canComplete && !saving ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
            {saving ? '처리 중...' : '✅ 작업 완료'}
          </button>
        </div>
      )}

      {/* 완료 */}
      {status === 'completed' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
              ✅ 작업 완료
            </span>
            {app.work_completed_at && (
              <span className="text-xs text-gray-400">
                {new Date(app.work_completed_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          {photos.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {photos.map(photo => (
                <a key={photo.id} href={photo.web_view_link} target="_blank" rel="noreferrer"
                  className={`text-xs px-2 py-1 rounded-full font-medium ${photo.photo_type === 'before' ? 'bg-gray-100 text-gray-600' : 'bg-blue-50 text-blue-600'}`}>
                  {photo.photo_type === 'before' ? '작업 전' : '작업 후'} 📷
                </a>
              ))}
              <span className="text-xs text-gray-400 self-center">총 {photos.length}장</span>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">고객 전달 특이사항</label>
            <textarea value={customerMemo} onChange={e => setCustomerMemo(e.target.value)} onBlur={saveMemos}
              disabled={!!app.notification_sent_at} rows={3}
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-gray-50 disabled:text-gray-400" />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">내부 메모</label>
            <textarea value={internalMemo} onChange={e => setInternalMemo(e.target.value)} onBlur={saveMemos}
              rows={2} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-gray-50" />
          </div>

          {app.notification_sent_at ? (
            <div className="bg-green-50 rounded-xl px-3 py-2.5 flex items-center gap-2">
              <p className="text-xs font-semibold text-green-700">고객 알림 발송 완료</p>
              <p className="text-xs text-green-600">
                {new Date(app.notification_sent_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          ) : app.notification_send_at && countdown !== null ? (
            <div className="bg-amber-50 rounded-xl px-3 py-2.5 space-y-2">
              <p className="text-xs font-semibold text-amber-700">고객 알림 발송 대기 중</p>
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
            <div className="bg-gray-50 rounded-xl px-3 py-2">
              <p className="text-xs text-gray-400">알림 발송이 취소됐습니다.</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
