import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// 고객 세부창 전용 조회 — 리스트 슬림 필드로는 부족한 전체 필드를 반환.
// 리스트(GET /api/admin/customers?page=1) 는 25개 필드만 내려주므로,
// 세부창 진입 시 이 라우트로 전체 필드를 다시 fetch 한다.
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const supabase = createServiceClient()

  const { data: customer, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!customer) {
    return NextResponse.json({ error: '고객을 찾을 수 없습니다.' }, { status: 404 })
  }

  // 다중 작업자 병합 (리스트 API 와 동일 로직)
  const customerType = customer.customer_type
  const assignedWorkerIds: string[] = []
  if (customerType === '1회성케어' || customerType === '일반일정') {
    const { data: apps } = await supabase
      .from('service_applications')
      .select('id')
      .eq('customer_id', id)
      .is('deleted_at', null)
      .is('archived_at', null)
    const appIds = (apps ?? []).map(a => a.id).filter(Boolean) as string[]
    if (appIds.length > 0) {
      const { data: assignments } = await supabase
        .from('work_assignments')
        .select('worker_id')
        .in('application_id', appIds)
        .order('id', { ascending: true })
      for (const wa of assignments ?? []) {
        if (wa.worker_id && !assignedWorkerIds.includes(wa.worker_id)) {
          assignedWorkerIds.push(wa.worker_id)
        }
      }
    }
  } else if (customer.assigned_worker_id) {
    assignedWorkerIds.push(customer.assigned_worker_id)
  }

  return NextResponse.json({
    customer: {
      ...customer,
      assigned_worker_ids: assignedWorkerIds,
      assigned_worker_id: assignedWorkerIds[0] ?? customer.assigned_worker_id ?? null,
    },
  })
}
