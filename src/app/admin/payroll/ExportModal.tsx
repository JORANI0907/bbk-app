'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Folder, Upload, Download } from 'lucide-react'
import { Button } from '@/components/ui'
import {
  loadGoogleAPIs,
  requestGoogleToken,
  openFolderPicker,
  resolveFolder,
  uploadFileToDrive,
  type DriveFolder,
} from '@/lib/googleDrive'

export default function ExportModal({
  month,
  displayMonth,
  selectedPersons,
  onClose,
}: {
  month: string
  displayMonth: string
  // "user:<id>" 또는 "worker:<id>" 형식. null이면 전체
  selectedPersons: string[] | null
  onClose: () => void
}) {
  const [folder, setFolder] = useState<DriveFolder | null>(null)
  const [folderLoading, setFolderLoading] = useState(true)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    fetch('/api/admin/payroll/drive-folder')
      .then(r => r.json())
      .then(d => setFolder(d.folder ?? null))
      .catch(() => {})
      .finally(() => setFolderLoading(false))
  }, [])

  const handleSelectFolder = async () => {
    setSelecting(true)
    try {
      await loadGoogleAPIs()
      const token = await requestGoogleToken()
      setAccessToken(token)
      const picked = await openFolderPicker(token)
      if (!picked) return
      const resolved = await resolveFolder(picked, token)
      const res = await fetch('/api/admin/payroll/drive-folder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: resolved }),
      })
      if (!res.ok) throw new Error('폴더 저장 실패')
      setFolder(resolved)
      toast.success(`저장 위치 설정됨: ${resolved.name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '폴더 선택 실패')
    } finally {
      setSelecting(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      // 선택된 인원이 있으면 person_type별로 id 배열을 분리해 API에 전달
      const filter = selectedPersons && selectedPersons.length > 0
        ? {
            user_ids: selectedPersons.filter(k => k.startsWith('user:')).map(k => k.slice(5)),
            worker_ids: selectedPersons.filter(k => k.startsWith('worker:')).map(k => k.slice(7)),
          }
        : null

      const res = await fetch('/api/admin/payroll/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, filter }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? '엑셀 생성 실패')
      }
      const blob = await res.blob()
      const suffix = filter ? `_선택${selectedPersons!.length}명` : ''
      const fileName = `BBK_급여정산_${month}${suffix}.xlsx`

      if (folder) {
        let token = accessToken
        if (!token) {
          await loadGoogleAPIs()
          token = await requestGoogleToken()
          setAccessToken(token)
        }
        const file = new File([blob], fileName, { type: blob.type })
        const { fileUrl } = await uploadFileToDrive(file, folder.id, fileName, token)
        toast.success(`[${folder.name}] 에 저장되었습니다!`)
        window.open(fileUrl, '_blank')
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        a.click()
        URL.revokeObjectURL(url)
        toast.success('엑셀 파일이 다운로드되었습니다.')
      }

      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-sm p-5">
        <h3 className="font-bold text-text-primary mb-1">급여정산 현황 저장</h3>
        <p className="text-xs text-text-tertiary mb-4">
          <span className="font-semibold text-brand-600">{displayMonth}</span> 급여 지급 현황을 엑셀로 내보냅니다.
          {selectedPersons && selectedPersons.length > 0 && (
            <span className="ml-1 font-semibold text-indigo-600">
              (선택 {selectedPersons.length}명만)
            </span>
          )}
        </p>

        <div className="mb-5">
          <p className="text-xs font-medium text-text-secondary mb-2">저장 위치 (Google Drive)</p>

          {folderLoading ? (
            <div className="h-11 rounded-xl bg-surface-sunken animate-pulse" />
          ) : folder ? (
            <div className="flex items-center justify-between px-3 py-2.5 bg-state-success-bg rounded-xl">
              <div className="flex items-center gap-2 min-w-0">
                <Folder size={16} className="shrink-0" />
                <span className="text-sm font-semibold text-state-success truncate">{folder.name}</span>
              </div>
              <button
                onClick={handleSelectFolder}
                disabled={selecting}
                className="text-xs text-text-tertiary hover:text-brand-600 ml-2 shrink-0 disabled:opacity-40 transition-colors"
              >
                {selecting ? '선택 중...' : '변경'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleSelectFolder}
              disabled={selecting}
              className="w-full flex items-center justify-center gap-2 px-3 py-3 border-2 border-dashed border-border rounded-xl text-sm text-text-secondary hover:border-brand-400 hover:text-brand-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {selecting ? (
                <span className="text-text-tertiary">Google 폴더 선택 중...</span>
              ) : (
                <>
                  <Folder size={16} />
                  <span>Google Drive 폴더 선택</span>
                </>
              )}
            </button>
          )}

          {!folder && !folderLoading && (
            <p className="text-xs text-text-tertiary mt-1.5">
              폴더 미설정 시 로컬 다운로드로 저장됩니다.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-border text-text-secondary hover:bg-surface-sunken transition-colors"
          >
            취소
          </button>
          <Button
            onClick={handleExport}
            disabled={exporting || folderLoading}
            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
          >
            {exporting ? '처리 중...' : folder ? <><Upload size={14} className="inline mr-1" />Drive에 저장</> : <><Download size={14} className="inline mr-1" />다운로드</>}
          </Button>
        </div>
      </div>
    </div>
  )
}
