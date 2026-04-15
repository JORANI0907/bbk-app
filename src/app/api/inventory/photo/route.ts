// 재고 사진 업로드 API
// Google Service Account를 사용하여 Drive에 업로드 (클라이언트 OAuth 불필요)
// 출퇴근 사진(/api/admin/attendance/photo)과 동일한 방식

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase/server'

const SETTING_KEY = 'inventory_drive_folder'

interface ServiceAccountKey {
  client_email: string
  private_key: string
  token_uri: string
}

async function getServiceAccountToken(key: ServiceAccountKey): Promise<string> {
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
    throw new Error(`서비스 계정 토큰 발급 실패: ${err}`)
  }

  const data = await tokenRes.json() as { access_token: string }
  return data.access_token
}

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('photo') as File | null
  const itemName = (formData.get('item_name') as string | null) ?? '재고'
  const txType = (formData.get('tx_type') as string | null) ?? ''

  if (!file) {
    return NextResponse.json({ error: 'photo 파일이 필요합니다.' }, { status: 400 })
  }

  const keyBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64
  if (!keyBase64) {
    return NextResponse.json(
      { error: 'GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 미설정 — 관리자에게 문의해주세요.' },
      { status: 500 }
    )
  }

  // DB에서 재고 사진 저장 폴더 조회
  const supabase = createServiceClient()
  const { data: settingRow } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SETTING_KEY)
    .maybeSingle()

  const folder = settingRow?.value
    ? (JSON.parse(settingRow.value) as { id: string; name: string })
    : null

  if (!folder?.id) {
    return NextResponse.json(
      { error: '재고 사진 저장 위치가 설정되지 않았습니다. 관리자에게 문의하세요.' },
      { status: 400 }
    )
  }

  try {
    const keyJson = Buffer.from(keyBase64, 'base64').toString('utf-8')
    const key = JSON.parse(keyJson) as ServiceAccountKey
    if (!key.token_uri) key.token_uri = 'https://oauth2.googleapis.com/token'

    const accessToken = await getServiceAccountToken(key)

    const TX_LABEL: Record<string, string> = { use: '수령', return: '반납', receive: '입고', adjust: '조정' }
    const typeLabel = TX_LABEL[txType] ?? txType
    const workerName = session.name ?? '직원'
    const ext = file.name.split('.').pop() ?? 'jpg'
    const fileName = `재고_${typeLabel}_${itemName}_${workerName}_${Date.now()}.${ext}`

    const metadata = { name: fileName, parents: [folder.id] }
    const fileBuffer = await file.arrayBuffer()
    const boundary = 'bbk_inventory_boundary'

    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\n\r\n`),
      Buffer.from(JSON.stringify(metadata)),
      Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${file.type || 'image/jpeg'}\r\n\r\n`),
      Buffer.from(fileBuffer),
      Buffer.from(`\r\n--${boundary}--`),
    ])

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true',
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

    // 공개 읽기 권한 부여 (실패해도 무시)
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${uploaded.id}/permissions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      }
    ).catch(() => {})

    const viewUrl = `https://drive.google.com/file/d/${uploaded.id}/view`
    return NextResponse.json({ url: viewUrl, file_id: uploaded.id })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '업로드 실패' },
      { status: 500 }
    )
  }
}
