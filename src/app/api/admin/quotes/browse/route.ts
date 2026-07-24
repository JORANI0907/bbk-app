import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

// 다른 신청서의 saved_quotes 를 참고·복사하기 위한 검색 endpoint
// GET /api/admin/quotes/browse?q=<검색어>&limit=20
// - q: 업체명·대표자·연락처 부분 검색 (없으면 최근 순)
// - saved_quotes가 있는 신청서만 반환
// - 응답에 saved_quotes 전체 포함 (복사에 필요한 모든 필드)

export async function GET(request: NextRequest) {
  const session = getServerSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20')))
  const excludeId = searchParams.get('exclude_id')?.trim() || null

  const supabase = createServiceClient()

  let query = supabase
    .from('service_applications')
    .select('id, business_name, owner_name, phone, service_type, care_scope, saved_quotes, created_at')
    .is('deleted_at', null)
    .not('saved_quotes', 'is', null)
    // jsonb 배열이 비어있지 않은 것만 (saved_quotes != '[]')
    .neq('saved_quotes', '[]')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (q) {
    query = query.or(`business_name.ilike.%${q}%,owner_name.ilike.%${q}%,phone.ilike.%${q}%`)
  }
  if (excludeId) {
    query = query.neq('id', excludeId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ applications: data ?? [] })
}
