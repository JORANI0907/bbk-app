import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getFranchiseSession, signSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  const session = getFranchiseSession()
  if (!session) {
    return NextResponse.json({ error: '본사 로그인이 필요합니다.' }, { status: 401 })
  }

  try {
    const { customerId } = await request.json()
    if (!customerId) {
      return NextResponse.json({ error: '지점 정보가 누락되었습니다.' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 본사 메타 확인
    const { data: hq } = await supabase
      .from('franchise_hq')
      .select('id')
      .eq('user_id', session.userId)
      .single()

    if (!hq) {
      return NextResponse.json({ error: '본사 정보가 없습니다.' }, { status: 404 })
    }

    // 매핑 검증 — 본인 본사에 매핑된 지점만 전환 허용
    const { data: mapping } = await supabase
      .from('franchise_branch_map')
      .select('customer_id')
      .eq('franchise_hq_id', hq.id)
      .eq('customer_id', customerId)
      .maybeSingle()

    if (!mapping) {
      return NextResponse.json({ error: '해당 지점에 접근 권한이 없습니다.' }, { status: 403 })
    }

    // 지점의 customer 사용자 정보 조회
    const { data: customer } = await supabase
      .from('customers')
      .select('id, business_name, user_id')
      .eq('id', customerId)
      .is('deleted_at', null)
      .single()

    if (!customer || !customer.user_id) {
      return NextResponse.json({ error: '지점 사용자 정보가 없습니다.' }, { status: 404 })
    }

    // preview 세션 발급 — customer 포털이 이 토큰을 통해 해당 지점으로 진입
    const previewToken = signSession({
      userId: customer.user_id,
      role: 'customer',
      name: customer.business_name,
      isPreview: 'true',
      originRole: 'franchise_hq',
      franchiseHqId: hq.id,
    })

    const response = NextResponse.json({ success: true })
    response.cookies.set('bbk_preview_session', previewToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 4, // 4시간 (긴 작업 가능)
      path: '/',
    })
    return response
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
