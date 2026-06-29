import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { CreateFranchiseHqButton } from '@/components/admin/franchise-hq/CreateFranchiseHqButton'

export const dynamic = 'force-dynamic'

interface HqRow {
  id: string
  brand_name: string
  logo_url: string | null
  created_at: string
  user_id: string
  users: { name: string; phone: string; is_active: boolean } | null
  branch_count: number
}

export default async function FranchiseHqListPage() {
  const supabase = createServiceClient()

  const { data: hqs } = await supabase
    .from('franchise_hq')
    .select('id, brand_name, logo_url, created_at, user_id, users:users!franchise_hq_user_id_fkey(name, phone, is_active)')
    .order('created_at', { ascending: false })

  // 본사별 지점 수 집계
  const hqIds = (hqs ?? []).map((h) => h.id)
  const { data: counts } = hqIds.length
    ? await supabase
        .from('franchise_branch_map')
        .select('franchise_hq_id')
        .in('franchise_hq_id', hqIds)
    : { data: [] as { franchise_hq_id: string }[] }

  const countMap = new Map<string, number>()
  for (const row of counts ?? []) {
    countMap.set(row.franchise_hq_id, (countMap.get(row.franchise_hq_id) ?? 0) + 1)
  }

  const rows: HqRow[] = (hqs ?? []).map((h) => ({
    id: h.id,
    brand_name: h.brand_name,
    logo_url: h.logo_url,
    created_at: h.created_at,
    user_id: h.user_id,
    users: (Array.isArray(h.users) ? h.users[0] : h.users) ?? null,
    branch_count: countMap.get(h.id) ?? 0,
  }))

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-text-primary">프렌차이즈 본사</h1>
          <p className="text-sm text-text-tertiary mt-1">본사 계정 발급 및 지점 매핑 관리</p>
        </div>
        <CreateFranchiseHqButton />
      </div>

      {rows.length === 0 ? (
        <div className="bg-surface border border-border-subtle rounded-2xl p-10 text-center">
          <p className="text-sm font-semibold text-text-primary">등록된 본사가 없습니다</p>
          <p className="text-xs text-text-tertiary mt-1.5">우측 상단의 본사 등록 버튼을 눌러주세요.</p>
        </div>
      ) : (
        <div className="bg-surface border border-border-subtle rounded-2xl shadow-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken text-text-tertiary text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">브랜드</th>
                <th className="text-left px-4 py-3 font-semibold hidden sm:table-cell">담당자</th>
                <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">연락처</th>
                <th className="text-right px-4 py-3 font-semibold">지점</th>
                <th className="text-right px-4 py-3 font-semibold">상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((hq) => (
                <tr key={hq.id} className="border-t border-border-subtle hover:bg-surface-sunken/40">
                  <td className="px-4 py-3">
                    <Link href={`/admin/franchise-hq/${hq.id}`} className="flex items-center gap-3 group">
                      {hq.logo_url ? (
                        <img src={hq.logo_url} alt={hq.brand_name} className="w-8 h-8 rounded-lg object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center font-bold text-xs">
                          {hq.brand_name.slice(0, 1)}
                        </div>
                      )}
                      <span className="font-bold text-text-primary group-hover:text-brand-600 transition-colors">
                        {hq.brand_name}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-text-secondary hidden sm:table-cell">
                    {hq.users?.name ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-text-tertiary hidden md:table-cell">
                    {hq.users?.phone ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-600">
                      {hq.branch_count}개
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        hq.users?.is_active
                          ? 'bg-state-success-bg text-state-success border-emerald-200'
                          : 'bg-surface-sunken text-text-tertiary border-border'
                      }`}
                    >
                      {hq.users?.is_active ? '활성' : '비활성'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
