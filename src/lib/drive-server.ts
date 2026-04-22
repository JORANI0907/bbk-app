// 서버사이드 Google Drive 폴더 생성 (서비스 계정 기반)
// 환경변수: GOOGLE_SERVICE_ACCOUNT_KEY_BASE64, GOOGLE_DRIVE_ENDCARE_FOLDER_ID

interface ServiceAccountKey {
  client_email: string
  private_key: string
  token_uri: string
}

async function getServiceAccountToken(key: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: key.token_uri,
    iat: now,
    exp: now + 3600,
  }
  const signingInput = `${encode(header)}.${encode(payload)}`
  const { createSign } = await import('crypto')
  const signer = createSign('RSA-SHA256')
  signer.update(signingInput)
  const signature = signer.sign(key.private_key, 'base64url')
  const jwt = `${signingInput}.${signature}`

  const res = await fetch(key.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!res.ok) throw new Error(`Google 토큰 발급 실패: ${await res.text()}`)
  const data = await res.json() as { access_token: string }
  return data.access_token
}

/**
 * 정기케어 월간 스케줄 폴더 생성
 * 폴더명: {업체명}_{YYYY년MM월}
 * 성공 시 folderUrl 반환, 실패 시 null 반환 (오류는 무시)
 */
export async function createScheduleDriveFolder(
  businessName: string,
  year: number,
  month: number,
): Promise<{ folderUrl: string } | null> {
  const keyBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64
  if (!keyBase64) return null

  try {
    const key = JSON.parse(Buffer.from(keyBase64, 'base64').toString('utf-8')) as ServiceAccountKey
    if (!key.token_uri) key.token_uri = 'https://oauth2.googleapis.com/token'

    const accessToken = await getServiceAccountToken(key)
    const monthStr = String(month).padStart(2, '0')
    const folderName = `${businessName}_${year}년${monthStr}월`
    const parentFolderId = process.env.GOOGLE_DRIVE_ENDCARE_FOLDER_ID ?? null

    const metadata: { name: string; mimeType: string; parents?: string[] } = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }
    if (parentFolderId) metadata.parents = [parentFolderId]

    const createRes = await fetch(
      'https://www.googleapis.com/drive/v3/files?fields=id,webViewLink',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata),
      }
    )
    if (!createRes.ok) return null

    const created = await createRes.json() as { id: string; webViewLink?: string }
    return {
      folderUrl: created.webViewLink ?? `https://drive.google.com/drive/folders/${created.id}`,
    }
  } catch {
    return null
  }
}
