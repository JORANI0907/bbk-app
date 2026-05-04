import nodemailer from 'nodemailer'

function createTransporter() {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) return null

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  })
}

export async function sendContractCompletedEmails({
  customerEmail,
  businessName,
  pdfBase64,
}: {
  customerEmail: string | null
  businessName: string
  pdfBase64: string
}) {
  const transporter = createTransporter()
  if (!transporter) {
    console.warn('[email] GMAIL_USER 또는 GMAIL_APP_PASSWORD 미설정 — 이메일 발송 건너뜀')
    return
  }

  const adminEmail = process.env.ADMIN_EMAIL ?? 'sunrise@bbkorea.co.kr'
  const fromEmail = process.env.GMAIL_USER!
  const subject = `[BBK 공간케어] ${businessName} 계약서 서명 완료`
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
      <h2>${businessName}님, 계약이 완료되었습니다.</h2>
      <p style="color:#555;line-height:1.7;">
        계약서 서명이 양쪽 모두 완료되었습니다.<br>
        첨부된 PDF 파일에서 계약 내용을 확인하실 수 있습니다.
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
      <p style="font-size:12px;color:#999;">
        문의: 031-759-4877 / sunrise@bbkorea.co.kr<br>
        BBK 공간케어
      </p>
    </div>
  `
  const attachment = {
    filename: `BBK_계약서_${businessName}.pdf`,
    content: Buffer.from(pdfBase64, 'base64'),
    contentType: 'application/pdf',
  }

  const recipients: string[] = [adminEmail]
  if (customerEmail) recipients.push(customerEmail)

  const results = await Promise.allSettled(
    recipients.map(to =>
      transporter.sendMail({
        from: `BBK 공간케어 <${fromEmail}>`,
        to,
        subject: to === adminEmail ? `[관리자 사본] ${subject}` : subject,
        html,
        attachments: [attachment],
      }),
    ),
  )

  results.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`[email] 발송 실패 #${i}:`, r.reason)
  })
}
