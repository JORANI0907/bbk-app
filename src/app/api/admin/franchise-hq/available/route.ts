import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

/**
 * 회원관리 등록 폼용 — 계정 미발급 본사 목록 조회.
 * 검색 가능 (브랜드명).
 */
export async function GET() {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('franchise_hq')
      .select('id, brand_name, manager_name, manager_phone, logo_url')
      .is('user_id', null)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ franchises: data ?? [] })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
