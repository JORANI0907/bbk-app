import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * 고객별 향후 방문/결제 요약 (2026-10-19)
 *
 * 리스트 뷰의 "방문일정" / "결제상태요약" 열에서 호출:
 *   - 다음 방문 2건 (service_applications 중 오늘 이후, construction_date 오름차순)
 *   - 다음 결제 2건 (service_billings pending 중 due_date 오름차순)
 *   - 빌링키 활성 여부 (billing_key_status === 'active')
 */

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)

  const [visitsRes, billingsRes, custRes] = await Promise.all([
    supabase.from('service_applications')
      .select('id, construction_date, progress_status, work_status')
      .eq('customer_id', id)
      .gte('construction_date', today)
      .is('deleted_at', null)
      .order('construction_date', { ascending: true })
      .limit(3),
    supabase.from('service_billings')
      .select('id, due_date, amount, billing_period, status')
      .eq('customer_id', id)
      .eq('status', 'pending')
      .order('due_date', { ascending: true })
      .limit(3),
    supabase.from('customers')
      .select('billing_key_status, customer_type, payment_method')
      .eq('id', id)
      .maybeSingle(),
  ])

  return NextResponse.json({
    visits: visitsRes.data ?? [],
    billings: billingsRes.data ?? [],
    billing_key_active: custRes.data?.billing_key_status === 'active',
    customer_type: custRes.data?.customer_type ?? null,
    payment_method: custRes.data?.payment_method ?? null,
  })
}
