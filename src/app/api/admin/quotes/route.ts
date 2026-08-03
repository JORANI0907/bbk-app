import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

const APPLICATION_SELECT =
  'id, owner_name, business_name, phone, phone_2, phone_notify_1, phone_notify_2, email, address, construction_date, care_scope, last_quote_no, last_quote_pdf_url, quote_items, quote_log, quote_notes, saved_quotes, created_at, status, notification_log, source'

/**
 * 견적관리 검색 fallback:
 *  customers 에는 있는데 service_applications 에 아직 대응 레코드가 없는 고객을
 *  검색 시점에 lazy backfill 한다.
 *  - 성수/연남 케이스처럼 노션 마이그레이션·수기 등록 고객이 견적관리에서 누락되던 문제 방지
 *  - source='customer_lazy_backfill' 로 표시하여 이후 필터/집계에서 구분 가능
 */
async function backfillMissingApplications(
  supabase: SupabaseClient,
  search: string
): Promise<number> {
  if (!search) return 0
  const like = `%${search}%`

  const { data: matched } = await supabase
    .from('customers')
    .select('id, business_name, contact_name, contact_phone, contact_phone_2, email, address, business_hours_start, business_hours_end, next_visit_date, construction_time, care_scope, customer_type, payment_method, assigned_user_id, created_at')
    .is('deleted_at', null)
    .is('archived_at', null)
    .or(`business_name.ilike.${like},contact_name.ilike.${like},contact_phone.ilike.${like}`)
    .limit(50)

  if (!matched || matched.length === 0) return 0

  const customerIds = matched.map(c => c.id)
  const { data: existing } = await supabase
    .from('service_applications')
    .select('customer_id')
    .in('customer_id', customerIds)
    .is('deleted_at', null)

  const linkedIds = new Set((existing ?? []).map(a => a.customer_id))
  const missing = matched.filter(c => !linkedIds.has(c.id))
  if (missing.length === 0) return 0

  const rows = missing.map(c => ({
    customer_id: c.id,
    business_name: c.business_name,
    owner_name: c.contact_name,
    phone: c.contact_phone,
    phone_2: c.contact_phone_2,
    email: c.email,
    address: c.address,
    business_hours_start: c.business_hours_start,
    business_hours_end: c.business_hours_end,
    construction_date: c.next_visit_date,
    construction_time: c.construction_time,
    care_scope: c.care_scope,
    service_type: c.customer_type,
    payment_method: c.payment_method,
    assigned_to: c.assigned_user_id,
    source: 'customer_lazy_backfill',
    status: '기존고객',
    saved_quotes: [] as unknown[],
    created_at: c.created_at,
  }))

  const { error } = await supabase.from('service_applications').insert(rows)
  if (error) {
    console.error('lazy backfill 실패:', error.message)
    return 0
  }
  return rows.length
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const page   = Math.max(1, parseInt(searchParams.get('page')  || '1'))
  const limit  = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')))
  const search = searchParams.get('search')?.trim() || ''
  const appId  = searchParams.get('appId')?.trim() || ''
  // Phase 27-Q: mode=quotes → 견적서(saved_quotes)가 있는 신청서만, 최근 수정/발송 순으로
  const mode   = searchParams.get('mode')?.trim() || ''
  const offset = (page - 1) * limit

  const supabase = createServiceClient()

  const sortByRecentQuote = mode === 'quotes'

  // 검색어가 있으면 먼저 customers 에서 미매칭 항목을 lazy backfill 한 뒤 조회.
  //   이력 모드(mode=quotes)에서는 last_quote_no 가 있는 신청서만 원하므로 backfill 대상 아님.
  if (search && !appId && !sortByRecentQuote) {
    await backfillMissingApplications(supabase, search)
  }

  let query = supabase
    .from('service_applications')
    .select(APPLICATION_SELECT, { count: 'exact' })
    .is('deleted_at', null)
    // Phase 27-V fix: service_applications 에 updated_at 컬럼 없음 → mode=quotes 도 created_at 으로 정렬
    .order('created_at', { ascending: false })

  if (appId) {
    query = query.eq('id', appId)
  } else {
    if (search) {
      query = query.or(
        `owner_name.ilike.%${search}%,business_name.ilike.%${search}%,phone.ilike.%${search}%,address.ilike.%${search}%,care_scope.ilike.%${search}%,email.ilike.%${search}%`
      )
    }
    // Phase 27-Q: 견적 이력 모드 — last_quote_no 있는 신청서만 (견적서 저장·발송 이력)
    if (sortByRecentQuote) {
      query = query.not('last_quote_no', 'is', null)
    }
    query = query.range(offset, offset + limit - 1)
  }

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ applications: data, total: count ?? 0, page, limit })
}
