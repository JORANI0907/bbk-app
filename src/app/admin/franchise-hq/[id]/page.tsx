import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { FranchiseHqDetail } from '@/components/admin/franchise-hq/FranchiseHqDetail'

export default async function FranchiseHqDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServiceClient()

  const { data: hq } = await supabase
    .from('franchise_hq')
    .select('id, brand_name, logo_url, user_id, users:users!franchise_hq_user_id_fkey(name, phone, is_active)')
    .eq('id', params.id)
    .single()

  if (!hq) notFound()

  const userRow = (Array.isArray(hq.users) ? hq.users[0] : hq.users) ?? null

  // 매핑된 지점
  const { data: mappings } = await supabase
    .from('franchise_branch_map')
    .select('customer_id, display_order')
    .eq('franchise_hq_id', params.id)
    .order('display_order', { ascending: true })

  const mappedIds = (mappings ?? []).map((m) => m.customer_id)

  const { data: mappedCustomers } = mappedIds.length
    ? await supabase
        .from('customers')
        .select('id, business_name, address')
        .in('id', mappedIds)
        .is('deleted_at', null)
    : { data: [] as { id: string; business_name: string; address: string }[] }

  // 매핑되지 않은 customer 후보 (이름 검색용)
  const { data: allCustomers } = await supabase
    .from('customers')
    .select('id, business_name, address')
    .is('deleted_at', null)
    .order('business_name', { ascending: true })
    .limit(500)

  const mappedSet = new Set(mappedIds)
  const candidates = (allCustomers ?? []).filter((c) => !mappedSet.has(c.id))

  // mappedIds 순서대로 정렬된 customer 목록 생성
  const customerMap = new Map((mappedCustomers ?? []).map((c) => [c.id, c]))
  const orderedMapped = mappedIds
    .map((id) => customerMap.get(id))
    .filter((c): c is { id: string; business_name: string; address: string } => !!c)

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        href="/admin/franchise-hq"
        className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary mb-4"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        본사 목록으로
      </Link>

      <FranchiseHqDetail
        hq={{
          id: hq.id,
          brand_name: hq.brand_name,
          logo_url: hq.logo_url,
          manager_name: userRow?.name ?? '',
          manager_phone: userRow?.phone ?? '',
          is_active: userRow?.is_active ?? true,
        }}
        mappedBranches={orderedMapped}
        candidates={candidates}
      />
    </div>
  )
}
