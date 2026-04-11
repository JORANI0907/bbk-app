import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'

const NOTICES_FOLDER_ID = '1l4xM29aSSRZvU5qWbM61zmQ2GNpH9Nv4' // BBK Drive folder

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
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: '관리자 전용' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('photo') as File | null

  if (!file) {
    return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
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
    const fileName = `notice_${Date.now()}.${file.name.split('.').pop() ?? 'jpg'}`

    const metadata = {
      name: fileName,
      parents: [NOTICES_FOLDER_ID],
    }

    const fileBuffer = await file.arrayBuffer()
    const boundary = 'bbk_notice_boundary'

    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\n\r\n`),
      Buffer.from(JSON.stringify(metadata)),
      Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${file.type || 'image/jpeg'}\r\n\r\n`),
      Buffer.from(fileBuffer),
      Buffer.from(`\r\n--${boundary}--`),
    ])

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
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

    const uploaded = await uploadRes.json() as { id: string }

    // 공개 읽기 권한 부여
    await fetch(`https://www.googleapis.com/drive/v3/files/${uploaded.id}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    })

    // 인라인 표시 가능한 URL 반환
    const imageUrl = `https://drive.google.com/uc?export=view&id=${uploaded.id}`
    return NextResponse.json({ url: imageUrl, file_id: uploaded.id })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : '업로드 실패',
    }, { status: 500 })
  }
}
