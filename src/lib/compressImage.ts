// Client-side only — uses Canvas & URL.createObjectURL

const MAX_BYTES = 2 * 1024 * 1024 // 2MB

function base64ByteSize(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] ?? ''
  // base64 char 4개 = 3바이트
  return Math.floor(base64.length * 0.75)
}

export async function compressImageToDataUrl(
  file: File,
  maxBytes = MAX_BYTES,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      let { width, height } = img
      const MAX_DIM = 1400
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)

      let quality = 0.9
      let dataUrl = canvas.toDataURL('image/jpeg', quality)

      while (base64ByteSize(dataUrl) > maxBytes && quality > 0.2) {
        quality = parseFloat((quality - 0.1).toFixed(1))
        dataUrl = canvas.toDataURL('image/jpeg', quality)
      }

      // 품질 조정으로도 부족하면 해상도까지 축소
      if (base64ByteSize(dataUrl) > maxBytes) {
        const shrinkRatio = Math.sqrt(maxBytes / base64ByteSize(dataUrl))
        canvas.width = Math.round(width * shrinkRatio)
        canvas.height = Math.round(height * shrinkRatio)
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        dataUrl = canvas.toDataURL('image/jpeg', 0.6)
      }

      resolve(dataUrl)
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('이미지를 불러올 수 없습니다.'))
    }
    img.src = objectUrl
  })
}
