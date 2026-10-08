/**
 * 결제 수단 중앙 상수 (2026-10-06 재설계)
 *
 * 설계 원칙:
 * - 신청서(service_applications) + 고객 마스터(customers) 모두 이 enum을 쓴다
 * - 기존 한글 enum 값('카드(온라인 간편결제)' 등)과의 호환성은 normalizePaymentMethod()로 처리
 * - 결제 수단별 메타데이터(라벨/부가세/PG 매핑)는 PAYMENT_METHOD_META에 모아둠
 * - UI 노출 범위는 CUSTOMER_FACING_METHODS / ADMIN_METHODS로 구분
 *
 * DB 마이그레이션:
 * - 신청서 enum 값 확장 완료 후, 기존 레코드를 UPDATE SQL로 신규 값으로 매핑
 * - 마이그레이션 완료되면 normalizePaymentMethod()의 레거시 분기만 제거
 */

export type PaymentMethod =
  // 신청서(/bbk-care) 노출 4종
  | 'credit_card'      // 신용/체크카드
  | 'corporate_card'   // 법인카드
  | 'bank_transfer'    // 계좌이체 (실시간 출금)
  | 'virtual_account'  // 무통장입금(가상계좌)
  // Admin 전용 (운영팀만 선택 가능)
  | 'cash_untaxed'     // 비과세 현금
  | 'platform'         // 플랫폼 결제 (레거시 — 신규 입력 금지, 기존 데이터 호환용)

export type PortOnePayMethod = 'CARD' | 'TRANSFER' | 'VIRTUAL_ACCOUNT'

interface PaymentMethodMeta {
  label: string            // Admin UI 표시 라벨
  customerLabel: string    // 고객 UI 표시 라벨
  description: string      // 고객 UI 설명 (한 줄)
  hasVat: boolean          // 부가세 포함 여부 (false면 청구 금액 = supply_amount)
  pgMethod: PortOnePayMethod | null  // 포트원 결제 요청 시 payMethod 값 (null = PG 미사용)
  requiresPortOne: boolean // 포트원 결제 플로우 필요 여부
}

export const PAYMENT_METHOD_META: Record<PaymentMethod, PaymentMethodMeta> = {
  credit_card: {
    label: '신용/체크카드',
    customerLabel: '신용/체크카드',
    description: '카드로 즉시 결제',
    hasVat: true,
    pgMethod: 'CARD',
    requiresPortOne: true,
  },
  corporate_card: {
    label: '법인카드',
    customerLabel: '법인카드',
    description: '법인/사업자 명의 카드로 결제',
    hasVat: true,
    pgMethod: 'CARD',
    requiresPortOne: true,
  },
  bank_transfer: {
    label: '계좌이체',
    customerLabel: '계좌이체',
    description: '오픈뱅킹으로 즉시 이체',
    hasVat: true,
    pgMethod: 'TRANSFER',
    requiresPortOne: true,
  },
  virtual_account: {
    label: '무통장입금(가상계좌)',
    customerLabel: '무통장입금',
    description: '가상계좌로 입금 (은행 선택)',
    hasVat: true,
    pgMethod: 'VIRTUAL_ACCOUNT',
    requiresPortOne: true,
  },
  cash_untaxed: {
    label: '비과세 현금',
    customerLabel: '비과세 현금',
    description: '세금계산서 미발행',
    hasVat: false,
    pgMethod: null,
    requiresPortOne: false,
  },
  platform: {
    label: '플랫폼 (레거시)',
    customerLabel: '플랫폼',
    description: '숨고/카카오비즈 등 외부 플랫폼 결제 (신규 입력 금지)',
    hasVat: false,
    pgMethod: null,
    requiresPortOne: false,
  },
}

/**
 * 신청서(/bbk-care)에서 고객에게 노출할 결제 수단
 */
export const CUSTOMER_FACING_METHODS: readonly PaymentMethod[] = [
  'credit_card',
  'corporate_card',
  'bank_transfer',
  'virtual_account',
] as const

/**
 * Admin이 선택할 수 있는 결제 수단 (platform 제외 — 신규 입력 금지)
 */
export const ADMIN_METHODS: readonly PaymentMethod[] = [
  'credit_card',
  'corporate_card',
  'bank_transfer',
  'virtual_account',
  'cash_untaxed',
] as const

/**
 * 부가세 비포함 결제 수단
 * - billing-generator.ts: 청구 금액 계산 시 vat 제외
 * - tax-invoice/candidates: 매출 금액 계산 시 vat 제외
 */
export const NO_VAT_METHODS: ReadonlySet<PaymentMethod> = new Set<PaymentMethod>([
  'cash_untaxed',
  'platform',
])

/**
 * 세금계산서 발행 불필요 결제 수단
 * - 카드결제: 매출전표가 세금계산서를 대체 (사업자 고객이 명시적 요청 시에만 별도 발행 필요)
 * - 비과세/플랫폼: 애초에 세금계산서 대상 아님
 */
export const NO_INVOICE_METHODS: ReadonlySet<PaymentMethod> = new Set<PaymentMethod>([
  'credit_card',
  'corporate_card',
  'cash_untaxed',
  'platform',
])

/**
 * 포트원 PG 연동이 필요한 결제 수단
 */
export const PORTONE_METHODS: ReadonlySet<PaymentMethod> = new Set<PaymentMethod>([
  'credit_card',
  'corporate_card',
  'bank_transfer',
  'virtual_account',
])

/**
 * 레거시 한글 enum → 신규 영문 enum 매핑
 *
 * DB 마이그레이션 전 레거시 레코드와 호환하기 위한 변환 함수.
 * 모든 payment_method 비교 로직은 이 함수를 거친 뒤 사용해야 한다.
 *
 * @example
 * const normalized = normalizePaymentMethod(app.payment_method)
 * if (normalized === 'credit_card' || normalized === 'corporate_card') { ... }
 *
 * DB 마이그레이션 완료 후: 레거시 case 블록만 제거하면 됨.
 */
export function normalizePaymentMethod(raw: string | null | undefined): PaymentMethod | null {
  if (!raw) return null
  switch (raw) {
    // ── 레거시 한글 enum ──
    case '카드(온라인 간편결제)':
      return 'credit_card'
    case '계좌이체':
      return 'bank_transfer'
    case '가상계좌':
      return 'virtual_account'
    case '현금(계산서 희망)':
      // "가상계좌 + 세금계산서 발행 요청" 의미. is_tax_invoice_required 플래그로 분리됨.
      return 'virtual_account'
    case '현금(비과세)':
      return 'cash_untaxed'
    case '플랫폼':
      return 'platform'
    // ── 신규 영문 enum (passthrough) ──
    case 'credit_card':
    case 'corporate_card':
    case 'bank_transfer':
    case 'virtual_account':
    case 'cash_untaxed':
    case 'platform':
      return raw as PaymentMethod
    default:
      // 알 수 없는 값 — null 반환 (호출부에서 체크 필수)
      return null
  }
}

/**
 * 세금계산서 발행 요청 여부 판별
 *
 * 신규 레코드: tax_invoice_required 컬럼을 직접 읽음.
 * 레거시 레코드: payment_method가 '현금(계산서 희망)'이면 true.
 *
 * @param rawPaymentMethod DB의 raw payment_method 값
 * @param taxInvoiceRequiredColumn service_applications.tax_invoice_required 컬럼 값
 */
export function isTaxInvoiceRequired(
  rawPaymentMethod: string | null | undefined,
  taxInvoiceRequiredColumn: boolean | null | undefined,
): boolean {
  if (taxInvoiceRequiredColumn === true) return true
  if (rawPaymentMethod === '현금(계산서 희망)') return true
  return false
}

/**
 * 포트원 결제 요청용 payMethod 값으로 변환
 *
 * @throws requiresPortOne: false 인 수단 전달 시 예외 (cash_untaxed, platform)
 */
export function toPortOnePayMethod(method: PaymentMethod): PortOnePayMethod {
  const pg = PAYMENT_METHOD_META[method].pgMethod
  if (!pg) {
    throw new Error(`결제 수단 '${method}'은(는) 포트원 PG 연동 대상이 아닙니다.`)
  }
  return pg
}

/**
 * UI 표시 라벨 (고객용)
 */
export function getCustomerFacingLabel(method: PaymentMethod): string {
  return PAYMENT_METHOD_META[method].customerLabel
}

/**
 * UI 표시 라벨 (admin용)
 */
export function getAdminLabel(method: PaymentMethod): string {
  return PAYMENT_METHOD_META[method].label
}

/**
 * normalizePaymentMethod() 결과를 쓸 때 레거시 값까지 체크하는 헬퍼
 *
 * @example
 * if (isAnyCardPayment(app.payment_method)) { ... }
 */
export function isAnyCardPayment(raw: string | null | undefined): boolean {
  const m = normalizePaymentMethod(raw)
  return m === 'credit_card' || m === 'corporate_card'
}

/**
 * 포트원 결제 플로우 대상 여부
 */
export function requiresPortOnePayment(raw: string | null | undefined): boolean {
  const m = normalizePaymentMethod(raw)
  if (!m) return false
  return PORTONE_METHODS.has(m)
}

/**
 * 부가세 포함 여부
 */
export function hasVat(raw: string | null | undefined): boolean {
  const m = normalizePaymentMethod(raw)
  if (!m) return true // 알 수 없으면 안전하게 부가세 포함으로
  return !NO_VAT_METHODS.has(m)
}

/**
 * 세금계산서 발행 대상 여부
 * (NO_INVOICE_METHODS에 포함되지 않으면 발행 대상)
 */
export function isTaxInvoiceEligible(raw: string | null | undefined): boolean {
  const m = normalizePaymentMethod(raw)
  if (!m) return false
  return !NO_INVOICE_METHODS.has(m)
}
