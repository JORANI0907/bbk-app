import { Resend } from 'resend'

export async function sendContractCompletedEmails({
  customerEmail,
  businessName,
  pdfBase64,
}: {
  customerEmail: string | null
  businessName: string
  pdfBase64: string
}) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY 미설정 — 이메일 발송 건너뜀')
    return
  }

  const resend = new Resend(apiKey)
  const from = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'
  const adminEmail = process.env.ADMIN_EMAIL ?? 'sunrise@bbkorea.co.kr'

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
  }

  const sends: Promise<unknown>[] = []

  if (customerEmail) {
    sends.push(resend.emails.send({ from, to: customerEmail, subject, html, attachments: [attachment] }))
  }
  sends.push(
    resend.emails.send({
      from,
      to: adminEmail,
      subject: `[관리자 사본] ${subject}`,
      html,
      attachments: [attachment],
    }),
  )

  const results = await Promise.allSettled(sends)
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`[email] 발송 실패 #${i}:`, r.reason)
  })
}
