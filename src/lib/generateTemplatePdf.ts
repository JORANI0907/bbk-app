// Client-side only — 계약서 양식(템플릿) 자체를 PDF로 변환 (서명·변수 치환 없이 원본 그대로)
// 완성된 계약서 PDF는 lib/generateContractPdf.ts 를 사용한다.

export interface GenerateTemplatePdfOptions {
  html: string
  filename: string  // 확장자 제외, 예: '표준 서비스 계약서'
}

export async function generateTemplatePdf(opts: GenerateTemplatePdfOptions): Promise<void> {
  const [{ jsPDF }, html2canvas] = await Promise.all([
    import('jspdf'),
    import('html2canvas').then(m => m.default),
  ])

  const { html, filename } = opts

  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const styleContent = Array.from(parsed.querySelectorAll('style'))
    .map(s => s.textContent ?? '')
    .join('\n')
  const bodyContent = parsed.body.innerHTML

  const container = document.createElement('div')
  container.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;background:white;'

  const styleEl = document.createElement('style')
  styleEl.textContent = styleContent
  container.appendChild(styleEl)

  const contentDiv = document.createElement('div')
  contentDiv.innerHTML = bodyContent
  container.appendChild(contentDiv)

  document.body.appendChild(container)

  // 렌더링 안정화를 위한 짧은 대기
  await new Promise(r => setTimeout(r, 200))

  const canvas = await html2canvas(container, {
    scale: 1.5,
    useCORS: true,
    allowTaint: true,
    width: 800,
    windowWidth: 800,
    scrollX: 0,
    scrollY: 0,
    backgroundColor: '#ffffff',
  })

  document.body.removeChild(container)

  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 24
  const imgW = pageW - margin * 2
  const scale = canvas.width / imgW
  const pageCanvasPx = Math.floor((pageH - margin * 2) * scale)

  let srcY = 0
  let isFirst = true

  while (srcY < canvas.height) {
    if (!isFirst) pdf.addPage()
    isFirst = false

    const sliceH = Math.min(pageCanvasPx, canvas.height - srcY)
    const slice = document.createElement('canvas')
    slice.width = canvas.width
    slice.height = sliceH
    slice.getContext('2d')!.drawImage(canvas, 0, -srcY)

    pdf.addImage(slice.toDataURL('image/jpeg', 0.88), 'JPEG', margin, margin, imgW, sliceH / scale)
    srcY += pageCanvasPx
  }

  // 파일명에서 파일시스템 예약 문자 제거
  const safeName = filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || '계약서 양식'
  pdf.save(`${safeName}.pdf`)
}
