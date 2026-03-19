'use client'

import { useRef, useState } from 'react'
import imageCompression from 'browser-image-compression'
import {
  loadGoogleAPIs,
  requestGoogleToken,
  uploadFileToDrive,
  GOOGLE_CLIENT_ID,
} from '@/lib/googleDrive'
import toast from 'react-hot-toast'

interface Props {
  driveFolderUrl: string
  scheduledDate: string
  businessName: string
}

function extractFolderId(url: string): string | null {
  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

export function DriveUploadButton({ driveFolderUrl, scheduledDate, businessName }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const tokenRef = useRef<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // Google 클라이언트 ID가 없으면 링크로 fallback
  if (!GOOGLE_CLIENT_ID) {
    return (
      <a
        href={driveFolderUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 py-2.5 bg-blue-50 text-blue-700 text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 border border-blue-200 active:scale-[0.98] transition-transform"
      >
        📁 드라이브 보기
      </a>
    )
  }

  const handleClick = async () => {
    if (uploading) return
    setUploading(true)
    try {
      await loadGoogleAPIs()
      const token = await requestGoogleToken()
      tokenRef.current = token
      // 토큰 획득 후 파일 선택창 열기
      inputRef.current?.click()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google 인증 실패'
      toast.error(msg)
      setUploading(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      setUploading(false)
      return
    }

    const accessToken = tokenRef.current
    if (!accessToken) {
      toast.error('인증 토큰이 없습니다. 다시 시도해주세요.')
      setUploading(false)
      return
    }

    try {
      const folderId = extractFolderId(driveFolderUrl)
      if (!folderId) throw new Error('드라이브 폴더 주소가 올바르지 않습니다.')

      const compressed = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      })

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19)
      const safeDate = scheduledDate.replace(/-/g, '')
      const safeName = businessName.replace(/[/\\:*?"<>|]/g, '_')
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
      const fileName = `${safeDate}_${safeName}_${timestamp}.${ext}`

      await uploadFileToDrive(
        new File([compressed], fileName, { type: compressed.type }),
        folderId,
        fileName,
        accessToken,
      )

      toast.success('드라이브에 사진이 업로드되었습니다!')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '업로드 실패'
      toast.error(msg)
    } finally {
      setUploading(false)
      tokenRef.current = null
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        onClick={handleClick}
        disabled={uploading}
        className="flex-1 py-2.5 bg-blue-50 text-blue-700 text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 border border-blue-200 active:scale-[0.98] transition-transform disabled:opacity-60"
      >
        {uploading ? '업로드 중...' : '📁 드라이브 업로드'}
      </button>
    </>
  )
}
