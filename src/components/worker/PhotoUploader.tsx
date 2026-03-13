'use client'

import { useRef, useState } from 'react'
import imageCompression from 'browser-image-compression'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

interface Props {
  scheduleId: string
  photoType: 'before' | 'after'
  onUploadComplete: (photoUrl: string) => void
}

export function PhotoUploader({ scheduleId, photoType, onUploadComplete }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)
  const [progress, setProgress] = useState<number>(0)
  const [isUploading, setIsUploading] = useState(false)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setProgress(10)

    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        onProgress: (p) => setProgress(10 + Math.floor(p * 0.4)),
      })

      setProgress(50)

      const supabase = createClient()
      const ext = compressed.name.split('.').pop() ?? 'jpg'
      const path = `${scheduleId}/${photoType}_${Date.now()}.${ext}`

      const { error } = await supabase.storage
        .from('work-photos')
        .upload(path, compressed, { upsert: false })

      if (error) throw error

      setProgress(90)

      const {
        data: { publicUrl },
      } = supabase.storage.from('work-photos').getPublicUrl(path)

      await supabase.from('work_photos').insert({
        schedule_id: scheduleId,
        photo_type: photoType,
        storage_path: path,
        photo_url: publicUrl,
        taken_at: new Date().toISOString(),
      })

      setProgress(100)
      setUploadedUrl(publicUrl)
      onUploadComplete(publicUrl)
      toast.success('사진이 업로드되었습니다.')
    } catch (err) {
      console.error('사진 업로드 실패:', err)
      toast.error('사진 업로드에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setIsUploading(false)
      setProgress(0)
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
        </button>
      )}

      {isUploading && (
        <div className="w-full max-w-sm">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>업로드 중...</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
