import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'

/**
 * POST /api/marketing/generate-thumbnail
 *
 * VPS 또는 관리자 UI에서 호출 → VPS가 scripts/marketing/generate_thumbnail.py 실행
 * 디자인 스펙: scripts/marketing/THUMBNAIL.md 참조
 */
export interface ThumbnailRequest {
  title: string        // 메인 타이틀 (필수)
  sub?: string         // 서브 텍스트
  region?: string      // 지역 태그
  item?: string        // 서비스 품목 태그
  bg_url?: string      // 배경 이미지 URL (VPS가 다운로드)
  type?: 'blog' | 'insta' | 'both'
  color?: 'yellow' | 'red' | 'pink' | 'white' | 'cyan'
  trigger_type?: 'manual' | 'auto'  // 호출 출처
}

export async function POST(request: NextRequest) {
  // 내부 VPS 호출은 Bearer 토큰으로 인증, 관리자 UI는 세션으로 인증
  const authHeader = request.headers.get('authorization')
  const isVpsCall = authHeader === `Bearer ${process.env.MARKETING_VPS_TOKEN}`

  if (!isVpsCall) {
    const session = getServerSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const vpsUrl = process.env.MARKETING_VPS_URL
  const vpsToken = process.env.MARKETING_VPS_TOKEN

  if (!vpsUrl || !vpsToken) {
    return NextResponse.json(
      { error: 'VPS not configured', message: 'MARKETING_VPS_URL 환경변수를 설정해주세요' },
      { status: 503 }
    )
  }

  let body: ThumbnailRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.title) {
    return NextResponse.json({ error: 'title 필드가 필요합니다' }, { status: 400 })
  }

  try {
    // VPS에 썸네일 생성 요청 전달
    // VPS는 scripts/marketing/generate_thumbnail.py 실행 후 결과 URL 반환
    const res = await fetch(`${vpsUrl}/composite`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vpsToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...body,
        trigger_type: body.trigger_type ?? 'manual',
      }),
      signal: AbortSignal.timeout(60000), // 썸네일 생성은 최대 60초
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return NextResponse.json(
        { error: 'VPS error', status: res.status, detail: errText },
        { status: 502 }
      )
    }

    const data = await res.json()
    return NextResponse.json({ ok: true, ...data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'VPS unreachable', detail: msg }, { status: 503 })
  }
}
