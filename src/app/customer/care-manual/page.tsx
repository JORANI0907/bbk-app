import { createServiceClient } from '@/lib/supabase/server'
import { getCustomerSession } from '@/lib/session'
import { getPortalCustomers } from '@/lib/customer-portal'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { normalizeCareManual } from '@/types/care-manual'
import type { CareCheck } from '@/lib/care-manual-status'
import { CareManualPortal } from '@/components/care-manual/CareManualPortal'

/**
 * 고객 포털 케어매뉴얼 (2026-11-03 구역 탭 구조로 개편 · 2026-11-08 공간 보기 추가)
 *   v1·v2 어느 형식이 저장돼 있어도 normalizeCareManual 로 v2 로 바꿔 보여준다.
 *   점검 기록(care_manual_checks)을 함께 내려 표시 색·상태 칩을 계산한다.
 */
const CHECKS_LIMIT = 1000
export default async function CustomerCareManualPage() {
  const session = getCustomerSession()
  if (!session || session.role !== 'customer') redirect('/login')

  const supabase = createServiceClient()

  const { primary } = await getPortalCustomers(supabase, session.userId)
  const customer = primary

  const isEligible =
    customer?.customer_type === '정기딥케어' ||
    customer?.customer_type === '정기엔드케어'

  if (!isEligible) redirect('/customer/mypage')

  // 자료함(도면·건축물대장)은 내부 자료 — 고객 브라우저로 내려보내지 않는다
  const { assets: _assets, ...manual } = normalizeCareManual(customer?.care_manual)
  void _assets

  let checks: CareCheck[] = []
  if (customer?.id) {
    const { data, error } = await supabase
      .from('care_manual_checks')
      .select('id, customer_id, item_id, zone_id, status, memo, photo_url, worker_name, checked_at')
      .eq('customer_id', customer.id)
      .order('checked_at', { ascending: false })
      .limit(CHECKS_LIMIT)
    if (error) console.error('[customer/care-manual] 점검 기록 조회 실패:', error.message)
    checks = (data ?? []) as CareCheck[]
  }

  return (
    <div className="px-4 py-5 flex flex-col gap-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link href="/customer/mypage" className="p-1.5 rounded-lg hover:bg-surface-sunken">
          <ChevronLeft size={20} className="text-text-secondary" />
        </Link>
        <div>
          <p className="text-xs text-text-tertiary">{customer?.business_name}</p>
          <h1 className="text-base font-bold text-text-primary">케어매뉴얼</h1>
        </div>
      </div>

      <CareManualPortal manual={manual} initialChecks={checks} />

      <p className="text-center text-xs text-text-tertiary pb-2 break-keep">
        케어매뉴얼 변경 문의: <span className="text-text-secondary font-medium">1522-9597</span>
      </p>
    </div>
  )
}
