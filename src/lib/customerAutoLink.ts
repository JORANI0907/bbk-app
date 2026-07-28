import type { createServiceClient } from '@/lib/supabase/server'

/**
 * Phase 27-X/Y: 신청서 접수 시점에 기존 customer 자동 연결.
 *
 * 매칭 규칙 (엄격):
 * - phone(정규화 후 8~11자리) OR business_number(정규화 후 10자리)가 일치하는 활성 고객 조회
 * - archived_at·deleted_at 이 null 인 것만 대상
 * - 정확히 1건일 때만 customer_id 반환. 0건(신규) 또는 2건+(모호)는 null → pending 유지
 *
 * false positive(오매칭) 리스크가 pending 남는 것보다 훨씬 큼 (알림·청구가 남의 계정으로 흘러감).
 * 그래서 "유일하게 일치할 때만" 원칙을 지킨다. 여러 후보가 나오면 관리자가 수동으로 결정.
 *
 * 사용처:
 * - /api/webhooks/application (bbk-care 정적 폼 + /quote 견적 폼)
 * - /api/apply (/apply/deepcare + /apply/endcare 정기케어 폼)
 */
export async function findAutoLinkCustomerId(
  supabase: ReturnType<typeof createServiceClient>,
  phone: string | undefined | null,
  businessNumber: string | undefined | null,
): Promise<string | null> {
  try {
    const phoneNorm = (phone ?? '').replace(/[^0-9]/g, '')
    const bizNumNorm = (businessNumber ?? '').replace(/[^0-9]/g, '')
    const validPhone = phoneNorm.length >= 8 && phoneNorm.length <= 11
    const validBizNum = bizNumNorm.length === 10

    if (!validPhone && !validBizNum) return null

    // 정규화 값과 원본 값 두 형식 모두 매칭 (DB 저장 시 대시 유무가 섞여 있어도 대응)
    const conditions: string[] = []
    if (validPhone) {
      conditions.push(`contact_phone.eq.${phoneNorm}`)
      if (phone && phone !== phoneNorm) conditions.push(`contact_phone.eq.${phone}`)
    }
    if (validBizNum) {
      conditions.push(`business_number.eq.${bizNumNorm}`)
      if (businessNumber && businessNumber !== bizNumNorm) conditions.push(`business_number.eq.${businessNumber}`)
    }

    const { data, error } = await supabase
      .from('customers')
      .select('id')
      .or(conditions.join(','))
      .is('archived_at', null)
      .is('deleted_at', null)
      .limit(2)   // 유일성 판정에는 2건만 조회하면 충분

    if (error) {
      console.warn('[auto-link] 쿼리 실패:', error.message)
      return null
    }
    if (data && data.length === 1) return data[0].id
    return null
  } catch (e) {
    console.warn('[auto-link] 처리 중 오류 (non-critical):', e)
    return null
  }
}

/**
 * Phase 27-AD: 신청서 접수 시 customer 자동 승격 (pending 개념 제거).
 *
 * 동작 순서:
 * 1) findAutoLinkCustomerId 로 기존 customer 매칭 시도
 * 2) 매칭되면 그 id 반환 (created=false)
 * 3) 매칭 실패 시 상호명(business_name) 정확 일치 customer 재조회 (INSERT unique 대비)
 * 4) 여전히 없으면 customer INSERT (created=true)
 * 5) INSERT 실패 시(예: unique violation) 상호명으로 재조회 후 그 id 반환
 *
 * 실패해도 null 반환하고 흐름은 이어지도록 방어(pending 상태로 fallback).
 * 포털 계정 자동 생성은 여기서 하지 않음 — 관리자가 명시적으로 트리거하도록 유지 (스팸 방지).
 */
export interface AutoCreateInput {
  business_name: string
  owner_name?: string | null
  phone?: string | null
  phone_2?: string | null
  email?: string | null
  address?: string | null
  business_number?: string | null
  account_number?: string | null
  platform_nickname?: string | null
  business_hours_start?: string | null
  business_hours_end?: string | null
  elevator?: string | null
  building_access?: string | null
  access_method?: string | null
  parking?: string | null
  payment_method?: string | null
  care_scope?: string | null
  request_notes?: string | null
  service_type?: string | null
}

export async function findOrCreateCustomer(
  supabase: ReturnType<typeof createServiceClient>,
  input: AutoCreateInput,
): Promise<{ customerId: string | null; created: boolean }> {
  // Phase 27-AF: 1회성·일반일정은 어미-자식 관계 없음 → 매 건 독립 customer 생성.
  // 정기딥/엔드만 어미(customer 마스터) + 자식(회차 apps) 관계이므로 매칭 시도.
  const isRecurring = input.service_type === '정기딥케어' || input.service_type === '정기엔드케어'

  const bizName = (input.business_name ?? '').trim()
  if (!bizName) return { customerId: null, created: false }

  if (isRecurring) {
    // 1) 정기: 기존 customer 매칭 우선 (재신청은 같은 customer 아래 새 회차)
    const matched = await findAutoLinkCustomerId(supabase, input.phone ?? null, input.business_number ?? null)
    if (matched) return { customerId: matched, created: false }

    // 2) 상호명 정확 일치 재조회 (INSERT unique constraint 대비)
    const { data: existingByName } = await supabase
      .from('customers')
      .select('id')
      .eq('business_name', bizName)
      .is('deleted_at', null)
      .maybeSingle()
    if (existingByName?.id) return { customerId: existingByName.id, created: false }
  }
  // 1회성/일반일정 또는 정기지만 매칭 실패 시 → 아래에서 신규 생성

  // 3) 자동 생성
  try {
    const { data: created, error } = await supabase
      .from('customers')
      .insert({
        business_name: bizName,
        contact_name: input.owner_name || null,
        contact_phone: input.phone || null,
        contact_phone_2: input.phone_2 || null,
        email: input.email || null,
        address: input.address || null,
        business_number: input.business_number || null,
        account_number: input.account_number || null,
        platform_nickname: input.platform_nickname || null,
        business_hours_start: input.business_hours_start || null,
        business_hours_end: input.business_hours_end || null,
        elevator: input.elevator || null,
        building_access: input.building_access || null,
        access_method: input.access_method || null,
        parking_info: input.parking || null,           // parking → parking_info (컬럼명 차이)
        payment_method: input.payment_method || null,
        care_scope: input.care_scope || null,
        special_notes: input.request_notes || null,    // request_notes → special_notes (컬럼명 차이)
        customer_type: input.service_type || '1회성케어',
        status: 'active',
        pipeline_status: 'inquiry',
      })
      .select('id')
      .single()

    if (error) {
      // unique violation 등 → 상호명 재조회로 fallback
      console.warn('[auto-create] customer INSERT 실패, 상호명 재조회 시도:', error.message)
      const { data: retryExisting } = await supabase
        .from('customers')
        .select('id')
        .eq('business_name', bizName)
        .is('deleted_at', null)
        .maybeSingle()
      if (retryExisting?.id) return { customerId: retryExisting.id, created: false }
      return { customerId: null, created: false }
    }

    return { customerId: created.id, created: true }
  } catch (e) {
    console.warn('[auto-create] 처리 중 오류 (non-critical):', e)
    return { customerId: null, created: false }
  }
}
