'use client'

import { useState, useRef } from 'react'
import { Upload, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  value: string
  onChange: (logoUrl: string) => void
  disabled?: boolean
}

export function LogoUploader({ value, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFile = async (file: File) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/admin/franchise-hq/upload-logo', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '업로드 실패')
      onChange(data.logo_url)
      toast.success('로고가 업로드되었습니다.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '업로드 실패')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
  }

  const clearLogo = () => onChange('')

  return (
    <div className="flex flex-col gap-2">
      <span className="block text-xs font-semibold text-text-secondary">로고</span>
      <div className="flex items-start gap-3">
        {/* 미리보기 */}
        <div className="w-20 h-20 rounded-xl border border-border-subtle bg-surface-sunken flex items-center justify-center overflow-hidden shrink-0">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="로고" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] text-text-tertiary text-center px-1">미리보기</span>
          )}
        </div>

        {/* 업로드 / 제거 버튼 */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-border rounded-md text-xs font-semibold text-text-secondary hover:bg-surface-sunken disabled:opacity-50 transition-colors"
          >
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                업로드 중...
              </>
            ) : (
              <>
                <Upload size={14} />
                이미지 선택
              </>
            )}
          </button>
          {value && (
            <button
              type="button"
              onClick={clearLogo}
              disabled={disabled || uploading}
              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-[11px] font-semibold text-state-danger hover:bg-red-50 rounded-md disabled:opacity-50"
            >
              <X size={12} />
              로고 제거
            </button>
          )}
          <p className="text-[10px] text-text-tertiary leading-tight">JPG · PNG · WebP · SVG (최대 5MB)</p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml"
        onChange={onSelect}
        className="hidden"
        disabled={disabled || uploading}
      />
    </div>
  )
}
