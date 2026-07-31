/**
 * customer → service_applications 필드 동기화 매핑 (Phase 27-AY)
 *
 * 배경:
 *   customers = 마스터 데이터, service_applications = 회차별 스냅샷.
 *   `generate-schedules` 로 service_applications 생성 시 customer 값을 복사해 저장.
 *   이후 customer 를 편집해도 기존 service_applications 는 옛 값 유지 → 배정관리 등에서 옛 값 노출.
 *
 * 이 파일의 역할:
 *   customer 편집 시 관련된 service_applications 의 필드를 동시에 갱신하기 위한
 *   단일 진실의 매핑 정의. 새 필드를 스냅샷 대상에 추가할 땐 여기 한 줄만 추가.
 *
 * 사용처:
 *   - api/admin/customers/route.ts PATCH
 *   - 앞으로 다른 customer 편집 진입점(별도 API, 봇 등)에서도 재사용
 *
 * 주의:
 *   반대 방향(app → customer) 은 별도 로직. 이 파일은 단방향만 담당.
 */

/**
 * key: customers 컬럼명
 * value: service_applications 컬럼명 (다른 경우 반드시 매핑)
 *
 * 새 필드 sync 추가 시 이 표에만 한 줄 추가하면 자동 반영됨.
 */
export const CUSTOMER_TO_APP_FIELD_MAP: Record<string, string> = {
  contact_phone:         'phone',
  contact_name:          'owner_name',
  address:               'address',
  care_scope:            'care_scope',
  business_hours_start:  'business_hours_start',
  business_hours_end:    'business_hours_end',
  payment_method:        'payment_method',
  elevator:              'elevator',
  building_access:       'building_access',
  access_method:         'access_method',
  parking_info:          'parking',              // 이름 다름
  special_notes:         'request_notes',        // 이름 다름 (신청서에선 "고객 요청사항")
  admin_notes:           'admin_request_notes',  // 이름 다름 (신청서에선 "관리자 요청")
  construction_time:     'construction_time',
  business_name:         'business_name',
  email:                 'email',
  business_number:       'business_number',
  account_number:        'account_number',
  platform_nickname:     'platform_nickname',
  customer_type:         'service_type',         // 고객 유형 변경 시 배정관리에 즉시 반영
}

/**
 * customer PATCH body 에서 sync 대상 필드만 추출해 service_applications 업데이트 object 생성.
 *
 * 반환값이 빈 객체면 sync 불필요 → 호출측이 UPDATE 자체를 skip 하면 됨.
 *
 * 예:
 *   input:  { contact_phone: '01011112222', notes: '메모' }
 *   output: { phone: '01011112222' }   // notes 는 스냅샷 아님
 */
export function buildAppUpdatesFromCustomerPatch(
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const appUpdates: Record<string, unknown> = {}
  for (const [customerKey, appKey] of Object.entries(CUSTOMER_TO_APP_FIELD_MAP)) {
    if (customerKey in patch) {
      let value = patch[customerKey]
      // phone 은 하이픈 제거 (기존 로직 유지)
      if (customerKey === 'contact_phone' && typeof value === 'string') {
        value = value.replace(/-/g, '')
      }
      appUpdates[appKey] = value
    }
  }
  return appUpdates
}
