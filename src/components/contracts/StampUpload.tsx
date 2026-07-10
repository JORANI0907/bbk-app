'use client'

import { useRef, useState } from 'react'
import { compressImageToDataUrl } from '@/lib/compressImage'

interface StampUploadProps {
  label: React.ReactNode
  hint?: string
  value: string | null
  onChange: (dataUrl: string | null) => void
}

export function StampUpload({ label, hint, value, onChange }: StampUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isCompressing, setIsCompressing] = useState(false)
  const [error, setError] = useState('')

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsCompressing(true)
    setError('')
    try {
      const dataUrl = await compressImageToDataUrl(file)
      onChange(dataUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지 처리 중 오류가 발생했습니다.')
    } finally {
      setIsCompressing(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-text-primary mb-1.5">{label}</label>
      {hint && <p className="text-xs text-text-tertiary mb-2">{hint}</p>}

      {value ? (
        <div className="border border-border rounded-xl p-3 bg-surface-sunken flex items-center gap-4">
          <div className="w-20 h-20 flex-shrink-0 flex items-center justify-center bg-white rounded-lg border border-border overflow-hidden">
            <img src={value} alt="직인" className="max-w-full max-h-full object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-state-success font-medium mb-1">직인 등록 완료</p>
            <p className="text-xs text-text-tertiary">2MB 이하로 자동 압축되었습니다.</p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-xs text-brand-600 hover:underline mt-1.5"
            >
              다른 이미지로 교체
            </button>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-state-danger hover:underline shrink-0"
          >
            제거
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={isCompressing}
          onClick={() => inputRef.current?.click()}
          className="w-full border-2 border-dashed border-border rounded-xl py-5 flex flex-col items-center gap-1.5 text-text-tertiary hover:border-brand-600 hover:text-brand-600 transition-colors disabled:opacity-60"
        >
          {isCompressing ? (
            <span className="text-sm">압축 중...</span>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
              <span className="text-sm font-medium">직인 이미지 업로드</span>
              <span className="text-xs">PNG, JPG — 자동으로 2MB 이하 압축</span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      {error && <p className="text-xs text-state-danger mt-1">{error}</p>}
    </div>
  )
}
