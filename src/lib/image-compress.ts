/**
 * 이미지를 목표 크기 이하로 축소.
 * Canvas API 사용 → 모바일/데스크탑 브라우저 어디서나 동작.
 *
 * 알고리즘:
 *   1. EXIF 회전 보정 후 maxWidth 이하로 다운스케일
 *   2. quality 0.92부터 시작해 0.05씩 낮추며 목표 byte 이하 도달까지 반복
 *   3. quality 0.5에 도달했는데도 못 만나면 maxWidth를 0.8배로 줄여 재시도
 *
 * SVG는 압축 불필요 (벡터). PNG/JPEG/WebP 대상.
 */

const MAX_BYTES = 1 * 1024 * 1024
const MIN_QUALITY = 0.5
const QUALITY_STEP = 0.05
const INITIAL_QUALITY = 0.92
const INITIAL_MAX_WIDTH = 1024

async function readImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (err) => {
      URL.revokeObjectURL(url)
      reject(err)
    }
    img.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

export async function compressImageTo1MB(file: File): Promise<File> {
  // SVG는 압축할 게 없음
  if (file.type === 'image/svg+xml') return file
  // 이미 1MB 이하면 그대로
  if (file.size <= MAX_BYTES) return file

  const img = await readImage(file)
  const outputType = file.type === 'image/png' ? 'image/jpeg' : file.type // PNG는 JPEG로 변환해 크기 절감
  const outputExt = outputType === 'image/jpeg' ? 'jpg' : outputType.split('/')[1]

  let currentMaxWidth = INITIAL_MAX_WIDTH

  while (currentMaxWidth >= 320) {
    // 비율 유지하며 다운스케일
    const ratio = Math.min(1, currentMaxWidth / img.width)
    const w = Math.round(img.width * ratio)
    const h = Math.round(img.height * ratio)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas context 생성 실패')
    ctx.drawImage(img, 0, 0, w, h)

    let quality = INITIAL_QUALITY
    while (quality >= MIN_QUALITY) {
      const blob = await canvasToBlob(canvas, outputType, quality)
      if (blob && blob.size <= MAX_BYTES) {
        const baseName = file.name.replace(/\.[^.]+$/, '')
        return new File([blob], `${baseName}.${outputExt}`, { type: outputType })
      }
      quality -= QUALITY_STEP
    }

    // 이 width에서 quality 다 줄였는데도 못 도달 → width 더 줄임
    currentMaxWidth = Math.floor(currentMaxWidth * 0.8)
  }

  // 마지막 fallback — 어떻게든 가장 압축된 결과 반환
  const finalCanvas = document.createElement('canvas')
  finalCanvas.width = 320
  finalCanvas.height = Math.round((320 / img.width) * img.height)
  const finalCtx = finalCanvas.getContext('2d')
  if (!finalCtx) throw new Error('Canvas context 생성 실패')
  finalCtx.drawImage(img, 0, 0, finalCanvas.width, finalCanvas.height)
  const finalBlob = await canvasToBlob(finalCanvas, outputType, MIN_QUALITY)
  if (!finalBlob) throw new Error('이미지 압축 실패')
  const baseName = file.name.replace(/\.[^.]+$/, '')
  return new File([finalBlob], `${baseName}.${outputExt}`, { type: outputType })
}
