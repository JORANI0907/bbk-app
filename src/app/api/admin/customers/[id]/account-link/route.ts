import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

// 이 계약의 account_user_id 를 세팅/해제
// - body.account_user_id === null  ⇒ 해제
// - body.account_user_id: string   ⇒ 세팅 (해당 user_id로 로그인 시 이 계약도 통합 뷰에 노출)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as { account_user_id?: string | null } | null
  if (!body || (body.account_user_id !== null && typeof body.account_user_id !== 'string')) {
    return NextResponse.json({ error: 'account_user_id 는 문자열 또는 null 이어야 합니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: target } = await supabase
    .from('customers')
    .select('id, user_id')
    .eq('id', params.id)
    .maybeSingle()

  if (!target) {
    return NextResponse.json({ error: '고객을 찾을 수 없습니다.' }, { status: 404 })
  }

  // 자기 자신을 서브로 매핑 금지 (DB check constraint 도 걸어놓았지만 UX 위해 사전 검증)
  if (body.account_user_id !== null && body.account_user_id === target.user_id) {
    return NextResponse.json({ error: '자기 자신의 계정에는 통합할 수 없습니다.' }, { status: 400 })
  }

  // 세팅하려는 account_user_id 가 실제 users 테이블에 존재하는지 확인
  if (body.account_user_id !== null) {
    const { data: userExists } = await supabase
      .from('users')
      .select('id')
      .eq('id', body.account_user_id)
      .maybeSingle()
    if (!userExists) {
      return NextResponse.json({ error: '연결하려는 계정을 찾을 수 없습니다.' }, { status: 404 })
    }
  }

  const { error } = await supabase
    .from('customers')
    .update({ account_user_id: body.account_user_id })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, account_user_id: body.account_user_id })
}

// 이 계약과 통합 가능한 후보 리스트
// 우선순위: (1) 같은 사업자번호 (2) 같은 연락처 를 가진 다른 정기 고객 중 user_id 보유
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data: me } = await supabase
    .from('customers')
    .select('id, business_number, contact_phone')
    .eq('id', params.id)
    .maybeSingle()

  if (!me) return NextResponse.json({ candidates: [] })

  const orParts: string[] = []
  if (me.business_number) orParts.push(`business_number.eq.${me.business_number}`)
  if (me.contact_phone) orParts.push(`contact_phone.eq.${me.contact_phone}`)
  if (orParts.length === 0) return NextResponse.json({ candidates: [] })

  const { data: candidates } = await supabase
    .from('customers')
    .select('id, business_name, customer_type, user_id, business_number, contact_phone')
    .or(orParts.join(','))
    .neq('id', params.id)
    .not('user_id', 'is', null)
    .is('deleted_at', null)
    .in('customer_type', ['정기딥케어', '정기엔드케어'])

  return NextResponse.json({ candidates: candidates ?? [] })
}
