/**
 * 메뉴 활성 판정 — 경로 구분자(/) 기준.
 *   '/admin/pricing' 은 '/admin/pricing' 과 '/admin/pricing/…' 에만 켜지고
 *   '/admin/pricing-calculator' 처럼 글자 앞부분만 같은 경로에는 켜지지 않는다 (2026-11-23).
 */
export function isPathActive(pathname: string, href: string): boolean {
  if (!href) return false
  if (pathname === href) return true
  return pathname.startsWith(href.endsWith('/') ? href : `${href}/`)
}
