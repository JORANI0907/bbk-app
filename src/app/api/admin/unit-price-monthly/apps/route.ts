import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/admin/unit-price-monthly/apps?month=YYYY-MM
 *
 * 급여정산 단가설정 전용 조회 라우트.
 * 기존 /api/admin/applications GET은 limit·filter 조건이 다른 화면에 특화되어
 * 정기 계약이 누락되는 문제가 있어 전용 엔드포인트로 분리.
 *
 * 반환:
 *  - applications: 활성 정기딥/정기엔드 계약 전체 (archived 제외, deleted 제외)
 *  - prices: 해당 월의 unit_price_monthly 레코드
 */
export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month 파라미터가 필요합니다. (YYYY-MM)' }, { status: 400 })
  }

  const [appsRes, pricesRes] = await Promise.all([
    supabase
      .from('service_applications')
      .select('id, business_name, service_type')
      .is('deleted_at', null)
      .is('archived_at', null)
      .in('service_type', ['정기딥케어', '정기엔드케어'])
      .order('business_name', { ascending: true }),
    supabase
      .from('unit_price_monthly')
      .select('id, application_id, year_month, unit_price')
      .eq('year_month', month),
  ])

  if (appsRes.error) return NextResponse.json({ error: appsRes.error.message }, { status: 500 })
  if (pricesRes.error) return NextResponse.json({ error: pricesRes.error.message }, { status: 500 })

  return NextResponse.json({
    applications: appsRes.data ?? [],
    prices: pricesRes.data ?? [],
  })
}
