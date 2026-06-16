import { createServiceClient } from '@/lib/supabase/server'
import { getCustomerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { ChevronLeft, BookOpen } from 'lucide-react'
import Link from 'next/link'
import type { CareManualSection } from '@/types/care-manual'
import { ImageViewer } from './ImageViewer'

export default async function CustomerCareManualPage() {
  const session = getCustomerSession()
  if (!session || session.role !== 'customer') redirect('/login')

  const supabase = createServiceClient()

  const { data: customer } = await supabase
    .from('customers')
    .select('id, business_name, customer_type, care_manual')
    .eq('user_id', session.userId)
    .maybeSingle()

  const isEligible =
    customer?.customer_type === '정기딥케어' ||
    customer?.customer_type === '정기엔드케어'

  if (!isEligible) redirect('/customer/mypage')

  const sections: CareManualSection[] = Array.isArray(customer?.care_manual)
    ? (customer.care_manual as CareManualSection[])
    : []

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

      {/* 빈 상태 */}
      {sections.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center bg-surface rounded-2xl border border-border-subtle">
          <BookOpen size={36} className="text-text-tertiary" />
          <p className="text-sm font-semibold text-text-primary">케어매뉴얼이 아직 준비되지 않았습니다</p>
          <p className="text-xs text-text-tertiary">담당자에게 문의해주세요.</p>
        </div>
      )}

      {/* 섹션 목록 */}
      {sections.map((section, si) => (
        <section
          key={si}
          className="bg-surface rounded-2xl border border-border-subtle shadow-soft overflow-hidden"
        >
          <div className="px-5 py-3 border-b border-border-subtle bg-surface-sunken">
            <span className="text-sm font-bold text-text-primary">{section.section}</span>
          </div>

          {/* 섹션 사진 */}
          {section.image_url && (
            <div className="px-4 pt-3 pb-1">
              <ImageViewer src={section.image_url} alt={section.section} />
            </div>
          )}

          <div className="divide-y divide-border-subtle">
            {section.items.map((item, ii) => (
              <div key={ii} className="px-5 py-3 flex gap-3 items-start">
                <span className="text-sm font-medium text-text-primary w-28 shrink-0 break-keep">
                  {item.label}
                </span>
                <span className="text-sm text-text-secondary flex-1">{item.desc}</span>
              </div>
            ))}
          </div>
        </section>
      ))}

      <p className="text-center text-xs text-text-tertiary pb-2 break-keep">
        케어매뉴얼 변경 문의: <span className="text-text-secondary font-medium">031-759-4877</span>
      </p>
    </div>
  )
}
