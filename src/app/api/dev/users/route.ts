import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { cookies } from 'next/headers'

// GET /api/dev/users?role=admin|worker|customer|franchise_hq
// Owner 만 접근 가능. 각 role 의 로그인 후보 계정 리스트를 반환.
// 반환 형식: { users: [{ id, name, phone, subtitle }] }
export async function GET(request: NextRequest) {
  // Owner gate — dev/session-swap 과 동일 로직
  const session = getServerSession()
  const ownerId = process.env.DEV_OWNER_ID
  if (!ownerId) return NextResponse.json({ error: 'Not available' }, { status: 404 })

  const cookieStore = cookies()
  const devOwnerCookie = cookieStore.get('bbk_dev_owner')
  const isOwner = session?.userId === ownerId || devOwnerCookie?.value === ownerId
  if (!isOwner) return NextResponse.json({ error: 'Not available' }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const role = searchParams.get('role')
  if (!role || !['admin', 'worker', 'customer', 'franchise_hq'].includes(role)) {
    return NextResponse.json({ error: 'role invalid' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: baseUsers, error } = await supabase
    .from('users')
    .select('id, name, phone')
    .eq('role', role)
    .eq('is_active', true)
    .not('phone', 'is', null)
    .order('name', { ascending: true })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const users = baseUsers ?? []
  const userIds = users.map(u => u.id)

  // role 별 subtitle 조회
  const subtitleMap = new Map<string, string>()

  if (role === 'customer' && userIds.length > 0) {
    const { data: rows } = await supabase
      .from('customers')
      .select('user_id, business_name')
      .in('user_id', userIds)
      .is('deleted_at', null)
    for (const r of rows ?? []) {
      if (r.user_id && !subtitleMap.has(r.user_id)) {
        subtitleMap.set(r.user_id, r.business_name ?? '')
      }
    }
  }

  if (role === 'franchise_hq' && userIds.length > 0) {
    const { data: rows } = await supabase
      .from('franchise_hq')
      .select('user_id, brand_name')
      .in('user_id', userIds)
    for (const r of rows ?? []) {
      if (r.user_id && !subtitleMap.has(r.user_id)) {
        subtitleMap.set(r.user_id, r.brand_name ?? '')
      }
    }
  }

  const result = users.map(u => ({
    id: u.id,
    name: u.name,
    phone: u.phone,
    subtitle: subtitleMap.get(u.id) ?? null,
  }))

  return NextResponse.json({ users: result })
}
