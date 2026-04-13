import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase/server'

const DEFAULT_ATTENDANCE_FOLDER_ID = '1l4xM29aSSRZvU5qWbM61zmQ2GNpH9Nv4'

async function getAttendanceFolderId(): Promise<string> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'attendance_drive_folder')
      .maybeSingle()
    if (data?.value) {
      const parsed = JSON.parse(data.value) as { id?: string }
      if (parsed.id) return parsed.id
    }
  } catch { /* fall through */ }
  return DEFAULT_ATTENDANCE_FOLDER_ID
}

interface ServiceAccountKey {
  client_email: string
  private_key: string
  token_uri: string
}

async function getServiceAccountAccessToken(key: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: key.token_uri,
    iat: now,
    exp: now + 3600,
  }

  const encode = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')

  const signingInput = `${encode(header)}.${encode(payload)}`

  const { createSign } = await import('crypto')
  const signer = createSign('RSA-SHA256')
  signer.update(signingInput)
  const signature = signer.sign(key.private_key, 'base64url')

  const jwt = `${signingInput}.${signature}`

  const tokenRes = await fetch(key.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    throw new Error(`Google 토큰 발급 실패: ${err}`)
  }

  const tokenData = await tokenRes.json() as { access_token: string }
  return tokenData.access_token
}

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('photo') as File | null
  const type = formData.get('type') as string | null // 'clock_in' | 'clock_out'
  const workerName = formData.get('worker_name') as string | null
  const date = formData.get('date') as string | null

  if (!file || !type || !date) {
    return NextResponse.json({ error: '필수 파라미터 누락 (photo, type, date)' }, { status: 400 })
  }

  const keyBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64
  if (!keyBase64) {
    return NextResponse.json({ error: 'GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 미설정' }, { status: 500 })
  }

  try {
    const keyJson = Buffer.from(keyBase64, 'base64').toString('utf-8')
    const key = JSON.parse(keyJson) as ServiceAccountKey
    if (!key.token_uri) key.token_uri = 'https://oauth2.googleapis.com/token'

    const accessToken = await getServiceAccountAccessToken(key)

    const typeLabel = type === 'clock_in' ? '출근' : '퇴근'
    const name = workerName ?? session.name ?? '직원'
    const fileName = `${date}_${name}_${typeLabel}_${Date.now()}.jpg`

    const folderId = await getAttendanceFolderId()
    const metadata = {
      name: fileName,
      parents: [folderId],
    }

    const fileBuffer = await file.arrayBuffer()
    const boundary = 'bbk_attendance_boundary'

    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\n\r\n`),
      Buffer.from(JSON.stringify(metadata)),
      Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${file.type || 'image/jpeg'}\r\n\r\n`),
      Buffer.from(fileBuffer),
      Buffer.from(`\r\n--${boundary}--`),
    ])

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    )

    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      return NextResponse.json({ error: `Drive 업로드 실패: ${err}` }, { status: 500 })
    }

    const uploaded = await uploadRes.json() as { id: string; webViewLink: string }

    // 파일 공개 읽기 권한 부여
    await fetch(`https://www.googleapis.com/drive/v3/files/${uploaded.id}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    })

    const viewUrl = `https://drive.google.com/file/d/${uploaded.id}/view`
    return NextResponse.json({ url: viewUrl, file_id: uploaded.id })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : '업로드 실패',
    }, { status: 500 })
  }
}
