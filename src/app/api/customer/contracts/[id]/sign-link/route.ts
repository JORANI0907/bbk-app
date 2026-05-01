import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://bbk-app.vercel.app'

type RouteParams = { params: { id: string } }

// GET /api/customer/contracts/[id]/sign-link — 서명 링크 조회 후 리다이렉트
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = getServerSession()
  if (!session) {
    return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // 고객 ID 확인
  const { data: user } = await supabase
    .from('users')
    .select('customer_id')
    .eq('id', session.userId)
    .single()

  if (!user?.customer_id) {
    return NextResponse.json({ success: false, error: '고객 정보가 없습니다.' }, { status: 403 })
  }

  // 계약서 조회 (본인 소유 확인)
  const { data: contract, error } = await supabase
    .from('contracts')
    .select('signing_token, signing_status')
    .eq('id', params.id)
    .eq('customer_id', user.customer_id as string)
    .single()

  if (error || !contract) {
    return NextResponse.json({ success: false, error: '계약서를 찾을 수 없습니다.' }, { status: 404 })
  }

  if (!contract.signing_token) {
    return NextResponse.json({ success: false, error: '서명 링크가 없습니다.' }, { status: 404 })
  }

  const signUrl = `${APP_URL}/sign/${contract.signing_token as string}`
  return NextResponse.redirect(signUrl)
}
