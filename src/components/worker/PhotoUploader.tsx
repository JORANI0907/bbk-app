'use client'

import { useRef, useState } from 'react'
import imageCompression from 'browser-image-compression'
import toast from 'react-hot-toast'

interface Props {
  scheduleId: string
  photoType: 'before' | 'after'
  onUploadComplete: (photoUrl: string) => void
}

export function PhotoUploader({ scheduleId, photoType, onUploadComplete }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)

    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      })

      const formData = new FormData()
      formData.append('file', compressed, compressed.name)
      formData.append('scheduleId', scheduleId)
      formData.append('photoType', photoType)

      const res = await fetch('/api/worker/photos', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? '업로드 실패')
      }

      const { photoUrl } = await res.json()
      setUploadedUrl(photoUrl)
      onUploadComplete(photoUrl)
      toast.success('사진이 업로드되었습니다.')
    } catch (err) {
      console.error('사진 업로드 실패:', err)
      toast.error(err instanceof Error ? err.message : '사진 업로드에 실패했습니다.')
    } finally {
      setIsUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
        disabled={isUploading}
      />

      {uploadedUrl ? (
        <div className="relative w-full max-w-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={uploadedUrl}
            alt={`${photoType === 'before' ? '작업 전' : '작업 후'} 사진`}
            className="w-full rounded-2xl object-cover aspect-video shadow"
          />
          <div className="absolute top-2 right-2 bg-green-500 text-white text-xs font-medium px-2 py-1 rounded-full">
            업로드 완료
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            className="mt-2 w-full py-2 text-sm text-blue-600 border border-blue-300 rounded-xl hover:bg-blue-50 transition-colors"
          >
            다시 찍기
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="w-full max-w-sm aspect-video bg-gray-100 rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-3 hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">업로드 중...</p>
            </div>
          ) : (
            <>
              <span className="text-4xl">
                {photoType === 'before' ? '📷' : '✨'}
              </span>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700">
                  {photoType === 'before' ? '작업 전 사진 촬영' : '작업 후 사진 촬영'}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  카메라 또는 갤러리에서 선택
                </p>
              </div>
            </>
          )}
        </button>
      )}
    </div>
  )
}
