import { createServiceClient } from '@/lib/supabase/server'
import { MapView } from './MapView'

export const dynamic = 'force-dynamic'

export interface CustomerMapPoint {
  id: string
  business_name: string
  address: string | null
  latitude: number
  longitude: number
  customer_type: string | null
  status: string
  assigned_user_id: string | null
}

export interface ManagerLite {
  id: string
  name: string
}

export default async function AdminMapPage() {
  const supabase = createServiceClient()

  // 1. 좌표 있는 활성 정기 고객사만 (1회성·샘플 제외)
  const { data: customerRows, error: customerErr } = await supabase
    .from('customers')
    .select('id, business_name, address, latitude, longitude, customer_type, status, assigned_user_id')
    .eq('status', 'active')
    .in('customer_type', ['정기딥케어', '정기엔드케어'])
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)

  if (customerErr) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-text-primary">지도 대시보드</h1>
        <p className="mt-4 text-state-danger">데이터 조회 실패: {customerErr.message}</p>
      </div>
    )
  }

  const points = (customerRows ?? []) as CustomerMapPoint[]

  // 2. 실제 담당자로 등장한 user_id만 골라 users에서 이름 조회
  const managerIds = Array.from(
    new Set(points.map((p) => p.assigned_user_id).filter((v): v is string => !!v)),
  )

  let managers: ManagerLite[] = []
  if (managerIds.length > 0) {
    const { data: userRows } = await supabase
      .from('users')
      .select('id, name')
      .in('id', managerIds)
      .not('name', 'is', null)

    managers = (userRows ?? []) as ManagerLite[]
  }

  return <MapView points={points} managers={managers} />
}
