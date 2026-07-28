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
