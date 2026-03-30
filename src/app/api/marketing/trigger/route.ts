import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'

export async function POST() {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const vpsUrl = process.env.MARKETING_VPS_URL
  const vpsToken = process.env.MARKETING_VPS_TOKEN

  if (!vpsUrl || !vpsToken) {
    // VPS 미연결 시 — 설정 안내 반환
    return NextResponse.json({ error: 'VPS not configured', message: 'MARKETING_VPS_URL 환경변수를 설정해주세요' }, { status: 503 })
  }

  try {
    const res = await fetch(`${vpsUrl}/api/run`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vpsToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trigger_type: 'manual' }),
      signal: AbortSignal.timeout(10000), // 10초 타임아웃
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'VPS error', status: res.status }, { status: 502 })
    }

    const data = await res.json()
    return NextResponse.json({ ok: true, ...data })
  } catch {
    return NextResponse.json({ error: 'VPS unreachable' }, { status: 503 })
  }
}
