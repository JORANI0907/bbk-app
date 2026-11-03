import { createServiceClient } from '@/lib/supabase/server'
import { getCustomerSession } from '@/lib/session'
import { getPortalCustomers } from '@/lib/customer-portal'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { normalizeCareManual } from '@/types/care-manual'
import { CareManualViewer } from '@/components/care-manual/CareManualViewer'

/**
 * 고객 포털 케어매뉴얼 (2026-11-03 구역 탭 구조로 개편)
 *   v1·v2 어느 형식이 저장돼 있어도 normalizeCareManual 로 v2 로 바꿔 보여준다.
 */
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

  const manual = normalizeCareManual(customer?.care_manual)

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

      <CareManualViewer manual={manual} />

      <p className="text-center text-xs text-text-tertiary pb-2 break-keep">
        케어매뉴얼 변경 문의: <span className="text-text-secondary font-medium">1522-9597</span>
      </p>
    </div>
  )
}
