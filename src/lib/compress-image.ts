const MAX_DIMENSION = 1920  // 긴 변 최대 px
const THRESHOLD_BYTES = 2 * 1024 * 1024  // 2MB 이하면 원본 그대로

/**
 * 브라우저 Canvas API로 이미지 파일을 JPEG 압축.
 * - 2MB 이하 → 원본 반환
 * - 2MB 초과 → 최대 1920px 리사이즈 + JPEG 0.85 품질
 * - 압축 후도 targetMB 초과 → 품질 0.70으로 재시도
 */
export async function compressImage(file: File, targetMB = 5): Promise<File> {
  if (file.size <= THRESHOLD_BYTES) return file

  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap

  const ratio = Math.min(1, MAX_DIMENSION / Math.max(width, height))
  const targetW = Math.round(width * ratio)
  const targetH = Math.round(height * ratio)

  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, targetW, targetH)
  bitmap.close()

  const toBlob = (quality: number) =>
    new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/jpeg', quality))

  let blob = await toBlob(0.85)
  if (blob.size > targetMB * 1024 * 1024) {
    blob = await toBlob(0.70)
  }

  const baseName = file.name.replace(/\.[^.]+$/, '')
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
}
