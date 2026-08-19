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
        문의: 031-759-4877 / sunrise@bbkorea.co.kr<br>
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
