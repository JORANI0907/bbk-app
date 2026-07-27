import { google } from 'googleapis'
import { Readable } from 'stream'

/** 견적서 PDF 저장 폴더 (기존) */
export const QUOTE_FOLDER_ID = '1H0aglzaXAvliiLmQA3c8OjVRjcpAQPPn'
/** 세금계산서 CSV/Sheet 저장 폴더 (Phase 26b: 견적서 폴더에서 분리) */
export const TAX_INVOICE_FOLDER_ID = '15CSPDzfdNSVWc4GjpgSCFwCW8laepNoT'

/** Google Sheets 자동 변환용 MIME 타입 */
export const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet'

function getAuth() {
  // client id: NEXT_PUBLIC_ 프리픽스 또는 서버 전용 이름 어느 쪽이든 지원
  const clientId     = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  // refresh token: 신규 이름(GOOGLE_DRIVE_REFRESH_TOKEN) → 레거시(GOOGLE_REFRESH_TOKEN) fallback
  // 프로덕션은 GOOGLE_REFRESH_TOKEN을 이미 세팅하고 있으며 Google Workspace 통합용
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) return null

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret)
  oauth2.setCredentials({ refresh_token: refreshToken })
  return oauth2
}

export interface DriveUploadResult {
  fileId: string | null
  webViewLink: string | null
}

export interface UploadOptions {
  /**
   * Drive에 저장될 파일의 목표 MIME 타입.
   * 원본 MIME과 다르게 지정하면 Drive가 자동 변환.
   * 예: mimeType='text/csv' + convertToMimeType='application/vnd.google-apps.spreadsheet'
   *     → CSV를 Google Sheets 문서로 변환하여 저장
   */
  convertToMimeType?: string
}

/**
 * 임의 바이너리를 Google Drive에 업로드 (범용).
 * 환경변수 미설정 시 { fileId: null, webViewLink: null } 반환.
 */
export async function uploadToDrive(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  folderId: string = QUOTE_FOLDER_ID,
  options: UploadOptions = {},
): Promise<DriveUploadResult> {
  const auth = getAuth()
  if (!auth) {
    console.warn('[drive] GOOGLE_DRIVE_REFRESH_TOKEN 미설정 — Drive 업로드 건너뜀')
    return { fileId: null, webViewLink: null }
  }

  const drive = google.drive({ version: 'v3', auth })

  const stream = new Readable()
  stream.push(buffer)
  stream.push(null)

  // 목표 MIME이 원본과 다르면 Drive가 자동 변환 (예: CSV → Google Sheets)
  const targetMime = options.convertToMimeType ?? mimeType

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType: targetMime,
      parents: [folderId],
    },
    media: { mimeType, body: stream },
    fields: 'id,webViewLink',
  })

  return {
    fileId: res.data.id ?? null,
    webViewLink: res.data.webViewLink ?? null,
  }
}

/** Google Drive 지정 폴더에 PDF 업로드 — 환경변수 미설정 시 null 반환 (레거시) */
export async function uploadQuoteToDrive(
  pdfBuffer: Buffer,
  fileName: string,
): Promise<string | null> {
  const { webViewLink } = await uploadToDrive(pdfBuffer, fileName, 'application/pdf')
  return webViewLink
}
