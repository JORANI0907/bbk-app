import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { validateNavLayout, type NavLayout } from '@/lib/nav-layout'

export const dynamic = 'force-dynamic'

// GET: 현재 저장된 레이아웃 반환 (없으면 null).
// worker도 조회는 가능 (자기 뷰에는 영향 없지만 통일된 API 응답).
export async function GET() {
  const session = getServerSession()
  if (!session) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('admin_nav_layout')
    .select('layout, updated_at, updated_by')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    layout: (data?.layout as NavLayout | undefined) ?? null,
    updatedAt: data?.updated_at ?? null,
    updatedBy: data?.updated_by ?? null,
  })
}

// PUT: 관리자만 저장 가능. 회사 전체 공용 레이아웃 갱신.
export async function PUT(request: NextRequest) {
  const session = getServerSession()
  if (!session) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ error: '관리자만 편집할 수 있습니다.' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 JSON' }, { status: 400 })
  }

  const layout = validateNavLayout((body as { layout?: unknown } | null)?.layout)
  if (!layout) {
    return NextResponse.json({ error: '레이아웃 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('admin_nav_layout')
    .upsert(
      {
        id: 1,
        layout,
        updated_at: new Date().toISOString(),
        updated_by: session.userId,
      },
      { onConflict: 'id' },
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, layout })
}

// DELETE: 기본값으로 초기화 (관리자만).
export async function DELETE() {
  const session = getServerSession()
  if (!session) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ error: '관리자만 초기화할 수 있습니다.' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase.from('admin_nav_layout').delete().eq('id', 1)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
