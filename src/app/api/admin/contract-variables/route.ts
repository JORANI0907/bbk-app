import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

// GET — 변수 카탈로그 전체 조회 (편집기·변수관리 탭에서 공용 사용)
export async function GET() {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ success: false, error: '권한이 없습니다.' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('contract_variables')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, data: data ?? [] })
}

// POST — 신규 커스텀 변수 생성 (관리자만)
export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ success: false, error: '권한이 없습니다.' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const rawName = String(body.name ?? '').trim()
  const label = String(body.label ?? '').trim()
  const description = String(body.description ?? '').trim()
  const mode = body.mode === 'auto' ? 'auto' : 'manual'
  const autoField = body.auto_field ? String(body.auto_field).trim() : null

  // 변수명 정규화: 대문자·영숫자·언더스코어만 허용
  const name = rawName.toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')

  if (!name) {
    return NextResponse.json({ success: false, error: '변수 이름을 입력해주세요.' }, { status: 400 })
  }
  if (!label) {
    return NextResponse.json({ success: false, error: '한글 라벨을 입력해주세요.' }, { status: 400 })
  }
  if (mode === 'auto' && !autoField) {
    return NextResponse.json({ success: false, error: '자동 변수는 매핑 필드를 선택해야 합니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('contract_variables')
    .insert({
      name,
      label,
      description,
      mode,
      auto_field: mode === 'auto' ? autoField : null,
      is_system: false,
      sort_order: 200,
    })
    .select()
    .single()

  if (error) {
    // 중복 name — UNIQUE 위반
    if (error.code === '23505') {
      return NextResponse.json({ success: false, error: `이미 존재하는 변수명입니다: ${name}` }, { status: 409 })
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, data })
}
