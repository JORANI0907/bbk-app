import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

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

  // Use Node.js crypto to sign with RS256
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

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient()
  const { id: customerId } = params

  const body = await request.json() as { year: number; month: number }
  const { year, month } = body

  if (!year || !month) {
    return NextResponse.json({ error: 'year, month 파라미터가 필요합니다.' }, { status: 400 })
  }

  const keyBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64
  if (!keyBase64) {
    return NextResponse.json({ error: 'GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 환경변수가 설정되지 않았습니다.' }, { status: 500 })
  }

  // 고객 정보 조회
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('id, business_name')
    .eq('id', customerId)
    .single()

  if (customerError || !customer) {
    return NextResponse.json({ error: '고객을 찾을 수 없습니다.' }, { status: 404 })
  }

  // 폴더명: {고객사명}_{YYYY년MM월}
  const monthStr = String(month).padStart(2, '0')
  const folderName = `${customer.business_name}_${year}년${monthStr}월`

  try {
    const keyJson = Buffer.from(keyBase64, 'base64').toString('utf-8')
    const key = JSON.parse(keyJson) as ServiceAccountKey
    if (!key.token_uri) {
      key.token_uri = 'https://oauth2.googleapis.com/token'
    }

    const accessToken = await getServiceAccountAccessToken(key)
    const parentFolderId = process.env.GOOGLE_DRIVE_ENDCARE_FOLDER_ID ?? null

    const metadata: { name: string; mimeType: string; parents?: string[] } = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }
    if (parentFolderId) {
      metadata.parents = [parentFolderId]
    }

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    })

    if (!createRes.ok) {
      const err = await createRes.text()
      return NextResponse.json({ error: `Drive 폴더 생성 실패: ${err}` }, { status: 500 })
    }

    const created = await createRes.json() as { id: string; name: string; webViewLink: string }
    const folderUrl = created.webViewLink ?? `https://drive.google.com/drive/folders/${created.id}`

    // 관련 service_applications에 drive_folder_url 저장 (미설정 건만)
    await supabase
      .from('service_applications')
      .update({ drive_folder_url: folderUrl })
      .eq('business_name', customer.business_name)
      .is('drive_folder_url', null)

    return NextResponse.json({
      folder_id: created.id,
      folder_name: folderName,
      folder_url: folderUrl,
    })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Drive 폴더 생성 실패',
    }, { status: 500 })
  }
}
