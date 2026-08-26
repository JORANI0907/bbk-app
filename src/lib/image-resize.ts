/**
 * Batch B-2: 브라우저 client-side 이미지 리사이즈 유틸
 *
 * 목적: 업로드 사진을 2MB 이하로 자동 축소.
 * 서버로 보내기 전에 크기를 줄여 업로드 시간 · 저장소 비용 · 전송 트래픽 절약.
 *
 * 알고리즘:
 *   1) 이미지 로드 → 최대 변 2048px 로 제한 (비율 유지)
 *   2) canvas 로 그려서 JPEG 로 인코딩 (quality 0.85 시작)
 *   3) 결과가 목표 크기 초과면 quality 를 0.1 씩 낮춤 (최소 0.3)
 *   4) 여전히 크면 최대 변을 다시 0.85배 축소 후 반복
 *   5) 안전 상한 5회 반복
 *
 * 반환: 원본 File 을 리사이즈한 File (JPEG). 리사이즈 불필요하면 원본 그대로 반환.
 */

export async function resizeImageToUnder(
  file: File,
  maxBytes = 2 * 1024 * 1024,
  initialMaxSide = 2048,
): Promise<File> {
  // 이미지 아닌 파일은 그대로 반환 (호출자가 확장자 걸러야 함)
  if (!file.type.startsWith('image/')) return file

  // 이미 목표보다 작으면 그대로 반환 (불필요한 재인코딩 방지)
  if (file.size <= maxBytes) return file

  const bitmap = await createImageBitmapCompat(file)
  let maxSide = initialMaxSide
  let quality = 0.85

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const blob = await drawToBlob(bitmap, maxSide, quality)
    if (blob && blob.size <= maxBytes) {
      // 파일명은 유지하되 확장자만 .jpg 로 통일
      const baseName = file.name.replace(/\.[^.]+$/, '')
      return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
    }
    // quality 우선 감소, 이미 낮으면 크기 축소
    if (quality > 0.35) quality = Math.max(0.35, quality - 0.15)
    else maxSide = Math.floor(maxSide * 0.85)
  }

  // 5회 시도 후에도 초과 시 마지막 결과 그대로 반환 (사용자에게 통보)
  const finalBlob = await drawToBlob(bitmap, maxSide, quality)
  if (finalBlob) {
    const baseName = file.name.replace(/\.[^.]+$/, '')
    return new File([finalBlob], `${baseName}.jpg`, { type: 'image/jpeg' })
  }
  return file
}

async function createImageBitmapCompat(file: File): Promise<HTMLImageElement | ImageBitmap> {
  // 최신 브라우저: createImageBitmap 이 훨씬 빠름
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // 실패 시 폴백
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지 로드 실패'))
    img.src = URL.createObjectURL(file)
  })
}

async function drawToBlob(
  source: HTMLImageElement | ImageBitmap,
  maxSide: number,
  quality: number,
): Promise<Blob | null> {
  const srcWidth = 'width' in source ? source.width : 0
  const srcHeight = 'height' in source ? source.height : 0
  if (!srcWidth || !srcHeight) return null

  const ratio = Math.min(1, maxSide / Math.max(srcWidth, srcHeight))
  const targetWidth = Math.max(1, Math.round(srcWidth * ratio))
  const targetHeight = Math.max(1, Math.round(srcHeight * ratio))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(source as CanvasImageSource, 0, 0, targetWidth, targetHeight)

  return await new Promise<Blob | null>(resolve => {
    canvas.toBlob(b => resolve(b), 'image/jpeg', quality)
  })
}
