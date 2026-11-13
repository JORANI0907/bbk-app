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

    // 지점 customer 정보 조회 (지점 계정이 없어도 열람 가능 — customer_id 기준)
    const { data: customer } = await supabase
      .from('customers')
      .select('id, business_name, user_id')
      .eq('id', customerId)
      .is('deleted_at', null)
      .single()

    if (!customer) {
      return NextResponse.json({ error: '지점 정보를 찾을 수 없습니다.' }, { status: 404 })
    }

    // preview 세션 발급 — 지점 로그인 계정(user_id) 유무와 무관하게 previewCustomerId(지점 customer.id)로 진입.
    // 본사 로그인 + franchise_branch_map 매핑으로 이미 접근 권한이 검증됐으므로 지점 계정은 불필요하다.
    const previewToken = signSession({
      userId: customer.user_id ?? '',
      previewCustomerId: customer.id,
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
