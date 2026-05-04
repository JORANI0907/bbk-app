// Client-side only — uses DOM, html2canvas, jsPDF (lazy loaded)

export interface GeneratePdfOptions {
  contractHtml: string
  customerSignature: string   // base64 PNG data URL, or empty string
  adminSignature: string      // base64 PNG data URL
  businessName: string
  customerAgreedAt: string | null
  adminSignedAt: string
}

function fmt(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function sigBox(src: string, label: string, name: string, date: string): string {
  return `
    <div style="flex:1;text-align:center;">
      <p style="font-size:11px;color:#666;margin:0 0 6px;font-family:sans-serif;">${label}</p>
      <div style="border:1px solid #ccc;border-radius:8px;height:130px;display:flex;align-items:center;justify-content:center;background:#fafafa;overflow:hidden;">
        ${src
          ? `<img src="${src}" style="max-width:90%;max-height:120px;object-fit:contain;" />`
          : '<span style="color:#bbb;font-size:11px;font-family:sans-serif;">(서명 없음)</span>'}
      </div>
      <p style="margin:8px 0 2px;font-size:12px;font-weight:600;font-family:sans-serif;">${name}</p>
      <p style="font-size:10px;color:#999;margin:0;font-family:sans-serif;">${date}</p>
    </div>
  `
}

export async function generateContractPdf(opts: GeneratePdfOptions): Promise<string> {
  const [{ jsPDF }, html2canvas] = await Promise.all([
    import('jspdf'),
    import('html2canvas').then(m => m.default),
  ])

  const { contractHtml, customerSignature, adminSignature, businessName, customerAgreedAt, adminSignedAt } = opts

  // Parse contract HTML → extract styles + body
  const parsed = new DOMParser().parseFromString(contractHtml, 'text/html')
  const styleContent = Array.from(parsed.querySelectorAll('style')).map(s => s.textContent ?? '').join('\n')
  const bodyContent = parsed.body.innerHTML

  // Signature section appended to the body
  const sigHtml = `
    <div style="margin-top:48px;padding:32px;border-top:2px solid #e0e0e0;background:white;">
      <h2 style="text-align:center;font-size:16px;font-weight:700;margin:0 0 28px;font-family:sans-serif;">전자 서명</h2>
      <div style="display:flex;gap:24px;">
        ${sigBox(customerSignature, '고객 서명', businessName, fmt(customerAgreedAt))}
        ${sigBox(adminSignature, '관리자 서명', '범빌드코리아 (BBK)', fmt(adminSignedAt))}
      </div>
      <p style="text-align:center;font-size:9px;color:#bbb;margin:24px 0 0;font-family:sans-serif;">
        이 문서는 전자서명법 제3조에 따라 서면 서명과 동일한 법적 효력을 가집니다.
      </p>
    </div>
  `

  // Off-screen container
  const container = document.createElement('div')
  container.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;background:white;'

  const styleEl = document.createElement('style')
  styleEl.textContent = styleContent
  container.appendChild(styleEl)

  const contentDiv = document.createElement('div')
  contentDiv.innerHTML = bodyContent
  container.appendChild(contentDiv)

  const sigDiv = document.createElement('div')
  sigDiv.innerHTML = sigHtml
  container.appendChild(sigDiv)

  document.body.appendChild(container)

  // Wait for signature images
  const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[]
  await Promise.all(
    imgs.map(img =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res() }),
    ),
  )
  await new Promise(r => setTimeout(r, 300))

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

  // Build multi-page PDF
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

  // Return base64 string only (no data URI prefix)
  return pdf.output('datauristring').split(',')[1]
}
