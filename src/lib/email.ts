import nodemailer from 'nodemailer'

/** 가상 이메일(포털 로그인용) 및 잘못된 형식 제외, 실제 발송 가능한 이메일만 통과 */
export function isValidRealEmail(email: string | null | undefined): email is string {
  if (!email) return false
  if (email.endsWith('@bbkorea.app')) return false    // 고객 포털 가상 이메일
  if (email.endsWith('@bbkorea.co.kr')) return false  // 직원 포털 가상 이메일
  if (email.endsWith('@bbkorea.hq')) return false     // 가맹 포털 가상 이메일
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

function createTransporter() {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) return null

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  })
}

/**
 * 급여명세서 이메일 발송 (PDF 첨부).
 * @throws GMAIL 환경변수 미설정 또는 이메일 유효하지 않을 때
 */
export async function sendPayslipEmail(opts: {
  toEmail: string
  personName: string
  monthLabel: string        // "2026년 7월"
  fileName: string          // 첨부 파일명
  pdfBase64: string
  downloadUrl?: string      // 브라우저 다운로드용 signed URL (선택)
}): Promise<void> {
  const transporter = createTransporter()
  if (!transporter) throw new Error('GMAIL_USER 또는 GMAIL_APP_PASSWORD 미설정')
  if (!isValidRealEmail(opts.toEmail)) throw new Error(`유효하지 않은 이메일: ${opts.toEmail}`)

  const fromEmail = process.env.GMAIL_USER!
  const subject = `[BBK 공간케어] ${opts.personName}님 ${opts.monthLabel} 급여명세서`
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
      <h2 style="color:#1a3a5c;">${opts.personName}님, ${opts.monthLabel} 급여명세서입니다.</h2>
      <p style="color:#555;line-height:1.7;">
        첨부된 PDF 파일에서 급여 지급 내역·공제 내역·실지급액을 확인하실 수 있습니다.<br>
        급여 관련 문의사항은 아래 연락처로 회신 부탁드립니다.
      </p>
      ${opts.downloadUrl ? `<p><a href="${opts.downloadUrl}" style="display:inline-block;padding:10px 18px;background:#1a3a5c;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">웹에서 다운로드</a></p>` : ''}
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
      <p style="font-size:12px;color:#999;">
        문의: 1522-9597 / sunrise@bbkorea.co.kr<br>
        범빌드코리아 (BBK Korea)
      </p>
    </div>
  `

  await transporter.sendMail({
    from: `BBK 공간케어 <${fromEmail}>`,
    to: opts.toEmail,
    subject,
    html,
    attachments: [{
      filename: opts.fileName,
      content: Buffer.from(opts.pdfBase64, 'base64'),
      contentType: 'application/pdf',
    }],
  })
}

/**
 * 견적서 이메일 발송 (PDF 첨부 + 바로보기 링크).
 * 2026-10-25: 기존 Resend 경로를 Gmail SMTP 로 전환. RESEND_API_KEY 미설정으로 발송이
 * 조용히 skip 되던 문제 해결. 급여명세서 nodemailer 인프라 재사용.
 *
 * @throws GMAIL 환경변수 미설정 또는 이메일 유효하지 않을 때
 */
export async function sendQuoteEmail(opts: {
  toEmail: string
  ownerName: string
  businessName: string
  quoteNo: string
  constructionDate: string
  supplyAmount: number
  vat: number
  totalAmount: number
  validUntilStr: string
  pdfUrl?: string | null
  /** 있으면 첨부. 없으면 pdfUrl 링크만 포함. */
  pdfBuffer?: Buffer
  pdfFileName?: string
  // 할인 (선택)
  discountAmount?: number
  discountRate?: number
  discountBaseLabel?: string
  origSupplyAmount?: number
  origTotalAmount?: number
  discount2Amount?: number
  taxExempt?: boolean
}): Promise<void> {
  const transporter = createTransporter()
  if (!transporter) throw new Error('GMAIL_USER 또는 GMAIL_APP_PASSWORD 미설정')
  if (!isValidRealEmail(opts.toEmail)) throw new Error(`유효하지 않은 이메일: ${opts.toEmail}`)

  const fromEmail = process.env.GMAIL_USER!
  const fmt = (n: number) => n.toLocaleString('ko-KR')
  const subject = `[BBK 공간케어] 견적서 안내 (${opts.quoteNo})`

  const hasDiscount1 = !!opts.discountAmount && opts.discountAmount > 0
  const hasDiscount2 = !!opts.discount2Amount && opts.discount2Amount > 0
  const origBase = opts.discountBaseLabel === '총액' ? opts.origTotalAmount : opts.origSupplyAmount

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;color:#333;line-height:1.7;max-width:600px;margin:0 auto;padding:24px;">
  <p>안녕하세요, <strong>${opts.ownerName || '-'}</strong>님.</p>
  <p>BBK 공간케어 견적서를 보내드립니다.</p>
  <table style="border-collapse:collapse;margin:16px 0;width:100%;">
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">견적서 번호</td><td>${opts.quoteNo}</td></tr>
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">업체명</td><td>${opts.businessName || '-'}</td></tr>
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">시공일자</td><td>${opts.constructionDate || '-'}</td></tr>
    ${((hasDiscount1 || hasDiscount2) && origBase)
      ? `<tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">${opts.discountBaseLabel === '총액' ? '합계 (할인 전)' : '공급가액 (할인 전)'}</td><td style="text-decoration:line-through;color:#888;">${fmt(origBase)}원</td></tr>`
      : ''}
    ${hasDiscount1
      ? `<tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#d9534f;white-space:nowrap;">할인${opts.discountRate ? ` (${opts.discountRate}%)` : ''}</td><td style="color:#d9534f;">-${fmt(opts.discountAmount!)}원</td></tr>`
      : ''}
    ${hasDiscount2
      ? `<tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#d9534f;white-space:nowrap;">할인2 (잔돈)</td><td style="color:#d9534f;">-${fmt(opts.discount2Amount!)}원</td></tr>`
      : ''}
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">${opts.taxExempt ? '금액 (면세)' : '공급가액'}</td><td>${fmt(opts.supplyAmount)}원</td></tr>
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">부가세</td><td>${opts.taxExempt ? '면세' : `${fmt(opts.vat)}원`}</td></tr>
    <tr style="border-bottom:1px solid #eee;"><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">합계</td><td><strong>${fmt(opts.totalAmount)}원</strong></td></tr>
    <tr><td style="padding:6px 16px 6px 0;color:#888;white-space:nowrap;">유효기간</td><td>${opts.validUntilStr}까지</td></tr>
  </table>
  ${opts.pdfUrl ? `<p><a href="${opts.pdfUrl}" style="display:inline-block;padding:12px 28px;background:#1a73e8;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:14px;">견적서 바로보기</a></p>` : ''}
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="margin:0;">감사합니다.<br><strong>BBK 공간케어</strong></p>
  <p style="font-size:12px;color:#999;margin-top:8px;">문의: 1522-9597 / sunrise@bbkorea.co.kr</p>
</body>
</html>`

  const attachments = opts.pdfBuffer && opts.pdfFileName
    ? [{
        filename: opts.pdfFileName,
        content: opts.pdfBuffer,
        contentType: 'application/pdf',
      }]
    : undefined

  await transporter.sendMail({
    from: `BBK 공간케어 <${fromEmail}>`,
    to: opts.toEmail,
    subject,
    html,
    attachments,
  })
}
