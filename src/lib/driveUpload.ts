import { google } from 'googleapis'
import { Readable } from 'stream'

const QUOTE_FOLDER_ID = '1H0aglzaXAvliiLmQA3c8OjVRjcpAQPPn'

function getAuth() {
  const clientId     = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) return null

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret)
  oauth2.setCredentials({ refresh_token: refreshToken })
  return oauth2
}

/** Google Drive 지정 폴더에 PDF 업로드 — 환경변수 미설정 시 null 반환 */
export async function uploadQuoteToDrive(
  pdfBuffer: Buffer,
  fileName: string,
): Promise<string | null> {
  const auth = getAuth()
  if (!auth) {
    console.warn('[drive] GOOGLE_DRIVE_REFRESH_TOKEN 미설정 — Drive 업로드 건너뜀')
    return null
  }

  const drive = google.drive({ version: 'v3', auth })

  const stream = new Readable()
  stream.push(pdfBuffer)
  stream.push(null)

  const res = await drive.files.create({
    requestBody: {
      name:     fileName,
      mimeType: 'application/pdf',
      parents:  [QUOTE_FOLDER_ID],
    },
    media: {
      mimeType: 'application/pdf',
      body:     stream,
    },
    fields: 'id,webViewLink',
  })

  return res.data.webViewLink ?? null
}
