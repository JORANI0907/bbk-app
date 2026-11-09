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

const PANO_WIDTH = 4096
const PANO_THUMB_WIDTH = 1024
const ASSET_IMAGE_WIDTH = 3000
const ASSET_IMAGE_MAX_BYTES = 4_000_000

/** 이미지 파일을 지정 너비(2:1 비율 유지)로 줄여 webp 로 */
function resizeToWidth(file: File, width: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, width / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('이미지 변환 실패'))), 'image/webp', quality)
    }
    img.onerror = () => reject(new Error('이미지를 읽지 못했습니다'))
    img.src = url
  })
}

/** 사진 크기 → 360(등장방형 2:1) 인지 평면인지 */
export function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.width, height: img.height }) }
    img.onerror = () => reject(new Error('이미지를 읽지 못했습니다'))
    img.src = url
  })
}
export const detectPhotoKind = (w: number, h: number): 'flat' | '360' => (w / h > 1.9 && w / h < 2.1 ? '360' : 'flat')

const FLAT_WIDTH = 2048
const FLAT_THUMB_WIDTH = 512

/**
 * 구역 사진 압축 — 360 은 4096 폭(둘러보기용 화소 필요), 평면은 2048 폭. 목록용 작은 사본도 함께.
 *   원본은 보관하지 않는다.
 */
export async function compressZonePhoto(file: File, kind: 'flat' | '360'): Promise<{ main: Blob; thumb: Blob }> {
  const [w, tw] = kind === '360' ? [PANO_WIDTH, PANO_THUMB_WIDTH] : [FLAT_WIDTH, FLAT_THUMB_WIDTH]
  const [main, thumb] = await Promise.all([resizeToWidth(file, w, 0.85), resizeToWidth(file, tw, 0.7)])
  return { main, thumb }
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

  /** 구역 사진 1장 업로드 → 보기용·목록용 URL + 종류(평면/360 자동 판별). 실패하면 null */
  const uploadPanorama = useCallback(async (file: File, tag: string): Promise<{ url: string; thumbUrl: string; kind: 'flat' | '360' } | null> => {
    setUploadingKey(tag)
    try {
      const { width, height } = await readImageSize(file)
      const kind = detectPhotoKind(width, height)
      const { main, thumb } = await compressZonePhoto(file, kind)
      const send = async (blob: Blob, suffix: string): Promise<string> => {
        const form = new FormData()
        form.append('file', blob, `${tag}_${suffix}.webp`)
        form.append('tag', `${tag}-${suffix}`)
        const res = await fetch(`/api/admin/customers/${customerId}/care-manual/image`, { method: 'POST', body: form })
        if (!res.ok) throw new Error('업로드 실패')
        return ((await res.json()) as { url: string }).url
      }
      const [url, thumbUrl] = await Promise.all([send(main, kind === '360' ? 'pano' : 'photo'), send(thumb, 'thumb')])
      return { url, thumbUrl, kind }
    } catch (e) {
      console.error('[care-manual] 구역 사진 업로드 실패:', e instanceof Error ? e.message : e)
      return null
    } finally {
      setUploadingKey(null)
    }
  }, [customerId])

  /**
   * 자료함 파일 1개 업로드 (도면·건축물대장·참고사진). PDF 는 그대로, 사진은 3000폭 이하로 줄여서.
   *   실패하면 null. 도면 사진은 글자가 보여야 하므로 일반 사진보다 크게 둔다.
   */
  const uploadAsset = useCallback(async (file: File, kind: string): Promise<{ url: string; mime: string; size: number } | null> => {
    setUploadingKey(`asset-${kind}`)
    try {
      const isImage = file.type.startsWith('image/') && file.type !== 'image/heic'
      const blob = isImage && file.size > ASSET_IMAGE_MAX_BYTES ? await resizeToWidth(file, ASSET_IMAGE_WIDTH, 0.9) : file
      const form = new FormData()
      form.append('file', blob, isImage && blob !== file ? file.name.replace(/\.[^.]+$/, '.webp') : file.name)
      form.append('kind', kind)
      const res = await fetch(`/api/admin/customers/${customerId}/care-manual/asset`, { method: 'POST', body: form })
      const body = await res.json().catch(() => ({})) as { url?: string; mime?: string; size?: number; error?: string }
      if (!res.ok || !body.url) throw new Error(body.error ?? '업로드 실패')
      return { url: body.url, mime: body.mime ?? file.type, size: body.size ?? file.size }
    } catch (e) {
      console.error('[care-manual] 자료 업로드 실패:', e instanceof Error ? e.message : e)
      return null
    } finally {
      setUploadingKey(null)
    }
  }, [customerId])

  /** 자료함 파일 삭제 (경로는 공개 URL 에서 뽑는다) */
  const removeAsset = useCallback(async (url: string): Promise<void> => {
    const path = storagePathFromUrl(url)
    if (!path) return
    try {
      await fetch(`/api/admin/customers/${customerId}/care-manual/asset`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }),
      })
    } catch (e) {
      console.error('[care-manual] 자료 삭제 실패:', e instanceof Error ? e.message : e)
    }
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

  return { upload, uploadPanorama, uploadAsset, remove, removeAsset, uploadingKey }
}
