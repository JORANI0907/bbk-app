import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 고객 포털이 볼 수 있는 모든 customer row.
 * 같은 사업장이 정기딥/정기엔드를 동시에 이용할 때, 서브 계약을 메인 계정에 매핑해두면
 * 하나의 로그인으로 통합 뷰가 가능하도록 하기 위한 헬퍼.
 *
 * - `primary`: user_id 매칭 row (본인 계정) — 홈 히어로/사이드바 표시 기준
 * - `all`: 메인 + 서브 계약 통합 — 일정/요청 리스트 조회 기준
 */
export type PortalCustomerRow = {
  id: string
  user_id: string | null
  account_user_id: string | null
  business_name: string
  customer_type: string | null
  status: string | null
  next_visit_date: string | null
  billing_cycle: string | null
  billing_amount: number | null
  visit_count_per_month: number | null
  grade: string | null
  drive_folder_url: string | null
  care_manual: unknown
}

const SELECT_COLS =
  'id, user_id, account_user_id, business_name, customer_type, status, next_visit_date, billing_cycle, billing_amount, visit_count_per_month, grade, drive_folder_url, care_manual'

export async function getPortalCustomers(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  all: PortalCustomerRow[]
  primary: PortalCustomerRow | null
  ids: string[]
}> {
  const { data } = await supabase
    .from('customers')
    .select(SELECT_COLS)
    .or(`user_id.eq.${userId},account_user_id.eq.${userId}`)
    .is('deleted_at', null)

  const all = (data ?? []) as PortalCustomerRow[]
  const primary = all.find((r) => r.user_id === userId) ?? all[0] ?? null
  const ids = all.map((r) => r.id)
  return { all, primary, ids }
}
