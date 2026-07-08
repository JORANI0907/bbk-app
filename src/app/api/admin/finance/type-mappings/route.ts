import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/admin/finance/type-mappings
// 저장된 (category, name) → group_name 매핑 전체 조회.
// 카드내역 임포트/직접 추가 시 자동 매칭에 사용.
export async function GET() {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('finance_type_mappings')
    .select('category, name, group_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ mappings: data ?? [] })
}
