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
      const filter = selectedPersons && selectedPersons.length > 0
        ? {
            user_ids: selectedPersons.filter(k => k.startsWith('user:')).map(k => k.slice(5)),
            worker_ids: selectedPersons.filter(k => k.startsWith('worker:')).map(k => k.slice(7)),
          }
        : null
      const suffix = filter ? `_선택${selectedPersons!.length}명` : ''

      // Drive 저장이 필요한 경우 사전에 토큰 확보
      let token = accessToken
      if (folder && !token) {
        await loadGoogleAPIs()
        token = await requestGoogleToken()
        setAccessToken(token)
      }

      // 두 파일 (급여상세 + 급여이체) 순차 생성 · Drive + 로컬 각각 저장
      const targets: { path: string; name: string; mime: string }[] = [
        {
          path: '/api/admin/payroll/export/detail',
          name: `BBK_급여상세_${month}${suffix}.xlsx`,
          mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        {
          path: '/api/admin/payroll/export/bank',
          name: `BBK_급여이체_${month}${suffix}.xls`,
          mime: 'application/vnd.ms-excel',
        },
      ]

      const driveUrls: string[] = []
      for (const t of targets) {
        const res = await fetch(t.path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month, filter }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.error ?? `${t.name} 생성 실패`)
        }
        const blob = await res.blob()

        // Drive 업로드
        if (folder && token) {
          const file = new File([blob], t.name, { type: t.mime })
          const uploaded = await uploadFileToDrive(file, folder.id, t.name, token)
          driveUrls.push(uploaded.fileUrl)
        }
        // 로컬 다운로드 (Drive 여부와 무관하게 항상 다운로드)
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = t.name
        a.click()
        URL.revokeObjectURL(url)
      }

      if (folder && driveUrls.length > 0) {
        toast.success(`[${folder.name}] 에 2개 파일 저장 · 로컬에도 다운로드됨`)
      } else {
        toast.success('급여상세·급여이체 2개 파일이 다운로드되었습니다.')
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
            <span className="ml-1 font-semibold text-brand-600">
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
            className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-60"
          >
            {exporting ? '처리 중...' : folder ? <><Upload size={14} className="inline mr-1" />Drive에 저장</> : <><Download size={14} className="inline mr-1" />다운로드</>}
          </Button>
        </div>
      </div>
    </div>
  )
}
