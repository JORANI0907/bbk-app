// 규정 PDF 다운로드 — 브라우저 전용 (html2canvas + jsPDF, 지연 로드). generateContractPdf 와 같은 방식.
import { renderRegulationHtml, formatKoreanDate } from './articles'

export interface RegulationPdfInput {
  code: string
  title: string
  htmlBody: string
  effectiveDate: string | null
  versionNo?: number | null
}

const PAGE_CSS = `
  body{font-family:'Pretendard Variable',Pretendard,-apple-system,sans-serif;font-size:13px;line-height:1.8;color:#1a1a1a;}
  h1{text-align:center;font-size:20px;font-weight:700;margin:0 0 6px;}
  h2{font-size:15px;font-weight:700;margin:26px 0 8px;padding-bottom:4px;border-bottom:1px solid #ddd;}
  p{margin:5px 0;word-break:keep-all;}
  p>strong:only-child{display:block;margin-top:16px;}
  table{width:100%;border-collapse:collapse;margin:10px 0;font-size:12px;}
  td,th{border:1px solid #bbb;padding:6px 8px;vertical-align:top;}
  .meta{text-align:center;font-size:11px;color:#666;margin:0 0 20px;}
  .foot{margin-top:32px;padding-top:10px;border-top:1px solid #ddd;font-size:10px;color:#888;text-align:center;}
`

function buildDocument(input: RegulationPdfInput): string {
  const body = renderRegulationHtml(input.htmlBody, input.effectiveDate)
  const dateText = formatKoreanDate(input.effectiveDate) || '미정'
  const edition = input.versionNo ? ` · 제${input.versionNo}판` : ''
  return (
    `<h1>${escapeHtml(input.title)}</h1>` +
    `<p class="meta">${escapeHtml(input.code)}${edition} · 시행일 ${dateText} · 범빌드코리아 주식회사</p>` +
    body +
    `<p class="foot">이 문서는 BBK 공간케어 앱 회사 규정에서 출력되었습니다. 최신 본문은 앱에서 확인하십시오.</p>`
  )
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 규정을 A4 PDF 로 만들어 바로 내려받는다. */
export async function downloadRegulationPdf(input: RegulationPdfInput): Promise<void> {
  const [{ jsPDF }, html2canvas] = await Promise.all([
    import('jspdf'),
    import('html2canvas').then((m) => m.default),
  ])

  const container = document.createElement('div')
  container.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;padding:40px 36px;background:white;'
  const style = document.createElement('style')
  style.textContent = PAGE_CSS
  container.appendChild(style)
  const content = document.createElement('div')
  content.innerHTML = buildDocument(input)
  container.appendChild(content)
  document.body.appendChild(container)

  try {
    await new Promise((r) => setTimeout(r, 200))
    const canvas = await html2canvas(container, {
      scale: 1.5, useCORS: true, width: 800, windowWidth: 800, scrollX: 0, scrollY: 0, backgroundColor: '#ffffff',
    })
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' })
    addCanvasPages(pdf, canvas)
    const date = (input.effectiveDate ?? '').replace(/-/g, '') || 'draft'
    pdf.save(`${input.code}_${input.title}_${date}.pdf`)
  } finally {
    document.body.removeChild(container)
  }
}

function addCanvasPages(pdf: { internal: { pageSize: { getWidth(): number; getHeight(): number } }; addPage(): void; addImage(...a: unknown[]): void }, canvas: HTMLCanvasElement) {
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 24
  const imgW = pageW - margin * 2
  const scale = canvas.width / imgW
  const pagePx = Math.floor((pageH - margin * 2) * scale)

  let y = 0
  let first = true
  while (y < canvas.height) {
    if (!first) pdf.addPage()
    first = false
    const h = Math.min(pagePx, canvas.height - y)
    const slice = document.createElement('canvas')
    slice.width = canvas.width
    slice.height = h
    slice.getContext('2d')?.drawImage(canvas, 0, -y)
    pdf.addImage(slice.toDataURL('image/jpeg', 0.9), 'JPEG', margin, margin, imgW, h / scale)
    y += pagePx
  }
}
