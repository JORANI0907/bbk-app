// 결제(PortOne) 요청용 고객 이메일 보정 — 클라이언트·서버 공용 (2026-10-26)
//
// PortOne 은 customer.email 이 형식에 안 맞으면 결제를 거절함
//   ("customer.email 파라미터가 email 형식이 아닙니다").
// 고객이 신청서에 '@' 두 번, 'ㅋ' 같은 값을 적은 경우가 실제로 있어서,
// 형식이 틀리면 비어있을 때와 같은 대체 주소로 결제를 진행한다.
// (KG이니시스 가상계좌는 email 필수라 아예 빼는 대신 대체 주소 사용)

const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidPaymentEmail(email: string | null | undefined): boolean {
  return !!email && SIMPLE_EMAIL.test(email.trim())
}

/** 유효하면 정리된 이메일, 아니면 seed(신청서/고객 id) 기반 대체 주소 */
export function resolvePaymentEmail(email: string | null | undefined, seed: string): string {
  if (isValidPaymentEmail(email)) return email!.trim()
  return `noemail-${seed.replace(/-/g, '').slice(0, 8)}@bbkorea.co.kr`
}
