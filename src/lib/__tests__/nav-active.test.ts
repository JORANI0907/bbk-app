import { describe, it, expect } from 'vitest'
import { isPathActive } from '@/lib/nav-active'

describe('isPathActive', () => {
  it('같은 경로와 하위 경로에만 켜진다', () => {
    expect(isPathActive('/admin/pricing', '/admin/pricing')).toBe(true)
    expect(isPathActive('/admin/pricing/history', '/admin/pricing')).toBe(true)
    expect(isPathActive('/admin/regulations/abc', '/admin/regulations')).toBe(true)
  })

  it('글자 앞부분만 같은 다른 메뉴에는 켜지지 않는다', () => {
    expect(isPathActive('/admin/pricing-calculator', '/admin/pricing')).toBe(false)
    expect(isPathActive('/admin/customers-history', '/admin/customers')).toBe(false)
  })

  it('빈 href 는 항상 꺼진다', () => {
    expect(isPathActive('/admin', '')).toBe(false)
  })
})
