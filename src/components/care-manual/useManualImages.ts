'use client'

/**
 * 케어매뉴얼 사진 업로드·삭제 (Supabase Storage 'care-manual-images')
 *   업로드 전 1MB 이하로 줄여 webp 로 보낸다. 삭제는 공개 URL 에서 경로를 뽑아 요청.
 */

import { useCallback, useState } from 'react'

const BUCKET = 'care-manual-images'
const MAX_BYTES = 1_000_000

export async function compressImage(file: File): Promise<Blob> {
  if (file.size <= MAX_BYTES) return file
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, Math.sqrt(MAX_BYTES / file.size) * 0.85)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('이미지 압축 실패'))), 'image/webp', 0.82)
    }
    img.onerror = () => reject(new Error('이미지를 읽지 못했습니다'))
    img.src = url
  })
}

export function storagePathFromUrl(url: string): string | null {
  const marker = `${BUCKET}/`
  const idx = url.indexOf(marker)
  return idx === -1 ? null : url.slice(idx + marker.length)
}

export function useManualImages(customerId: string) {
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)

  /** 여러 장 업로드 → 성공한 URL 목록 (일부 실패해도 나머지는 돌려준다) */
  const upload = useCallback(async (files: File[], tag: string): Promise<{ urls: string[]; failed: number }> => {
    setUploadingKey(tag)
    const urls: string[] = []
    let failed = 0
    try {
      for (const file of files) {
        try {
          const blob = await compressImage(file)
          const form = new FormData()
          form.append('file', blob, `${tag}_${Date.now()}.webp`)
          form.append('tag', tag)
          const res = await fetch(`/api/admin/customers/${customerId}/care-manual/image`, { method: 'POST', body: form })
          if (!res.ok) throw new Error('업로드 실패')
          const { url } = await res.json() as { url: string }
          urls.push(url)
        } catch (e) {
          console.error('[care-manual] 사진 업로드 실패:', e instanceof Error ? e.message : e)
          failed += 1
        }
      }
    } finally {
      setUploadingKey(null)
    }
    return { urls, failed }
  }, [customerId])

  /** 스토리지에서 파일 삭제 (실패해도 화면 흐름은 막지 않는다) */
  const remove = useCallback(async (url: string): Promise<void> => {
    const path = storagePathFromUrl(url)
    if (!path) return
    try {
      await fetch(`/api/admin/customers/${customerId}/care-manual/image`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }),
      })
    } catch (e) {
      console.error('[care-manual] 사진 삭제 실패:', e instanceof Error ? e.message : e)
    }
  }, [customerId])

  return { upload, remove, uploadingKey }
}
