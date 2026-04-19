import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'

// Make 웹훅 URL — 세금계산서 수동 발행
const MAKE_WEBHOOK_URL = 'https://hook.eu2.make.com/qn2j6o799ybwv88ln14g506nb5mbj7v0'

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const raw = body.application_ids
  const ids: string[] = Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === 'string' && v.length > 0)
    : []

  if (ids.length === 0) {
    return NextResponse.json({ error: '선택된 신청서가 없습니다.' }, { status: 400 })
  }

  try {
    const res = await fetch(MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_ids: ids }),
    })
    const text = await res.text()
    if (!res.ok) {
      return NextResponse.json({ error: `Make 웹훅 오류 (${res.status}): ${text}` }, { status: 502 })
    }
    return NextResponse.json({ ok: true, count: ids.length, webhook_response: text })
  } catch (err) {
    return NextResponse.json({ error: `웹훅 호출 실패: ${(err as Error).message}` }, { status: 500 })
  }
}
