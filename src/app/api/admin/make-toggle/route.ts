import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'

const MAKE_API_KEY = process.env.MAKE_API_KEY ?? ''
const MAKE_BASE_URL = 'https://eu1.make.com/api/v2'

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: '관리자 전용' }, { status: 403 })
  }

  if (!MAKE_API_KEY) {
    // API Key 미설정 시 UI 상태만 업데이트
    return NextResponse.json({ success: true, note: 'Make API key not configured' })
  }

  const body = await request.json() as { scenarioId?: number | null; active?: boolean }
  const { scenarioId, active } = body

  if (scenarioId == null) {
    // scenarioId 없으면 UI 상태만 업데이트 (Make 미연동 시나리오)
    return NextResponse.json({ success: true, note: 'No scenarioId provided' })
  }

  const action = active ? 'activate' : 'deactivate'

  try {
    const res = await fetch(`${MAKE_BASE_URL}/scenarios/${scenarioId}/${action}`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${MAKE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      const err = await res.text()
      // Make API 오류는 무시하고 UI 상태만 업데이트
      return NextResponse.json({ success: true, note: `Make API error: ${err}` })
    }

    return NextResponse.json({ success: true })
  } catch {
    // 네트워크 오류도 graceful 처리
    return NextResponse.json({ success: true, note: 'Make API unreachable' })
  }
}
