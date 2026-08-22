import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'


// GET /api/admin/contract-templates — 템플릿 목록 조회
// ?party_type=customer|worker 로 대상 유형 필터. 없으면 전체.
export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const partyType = searchParams.get('party_type')

  let query = supabase
    .from('contract_templates')
    .select('id, name, description, is_active, party_type, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (partyType === 'customer' || partyType === 'worker') {
    query = query.eq('party_type', partyType)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}

// POST /api/admin/contract-templates — 새 템플릿 생성
export async function POST(request: NextRequest) {
  const supabase = createServiceClient()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const { name, description, html_body, is_active, party_type } = body

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ success: false, error: 'name은 필수입니다.' }, { status: 400 })
  }

  if (html_body !== undefined && typeof html_body !== 'string') {
    return NextResponse.json({ success: false, error: 'html_body는 문자열이어야 합니다.' }, { status: 400 })
  }

  const partyTypeFinal = (party_type === 'worker' || party_type === 'customer') ? party_type : 'customer'

  const { data, error } = await supabase
    .from('contract_templates')
    .insert({
      name: name.trim(),
      description: typeof description === 'string' ? description.trim() : '',
      html_body: typeof html_body === 'string' ? html_body : '',
      is_active: typeof is_active === 'boolean' ? is_active : true,
      party_type: partyTypeFinal,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data }, { status: 201 })
}
