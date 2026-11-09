import { describe, expect, it } from 'vitest'
import { fitLabel, polyExtent } from '../plan-geometry'

const rect = (x1: number, y1: number, x2: number, y2: number): [number, number][] => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]

describe('fitLabel — 방 크기에 맞는 글자', () => {
  it('큰 방은 긴 이름이 그대로 들어간다', () => {
    const r = fitLabel('공유주방', rect(0.1, 0.1, 0.5, 0.5), 1000, 600)
    expect(r?.text).toBe('공유주방')
    expect(r!.fontSize).toBeGreaterThanOrEqual(11)
    expect(r!.fontSize).toBeLessThanOrEqual(32)
  })
  it('작은 호실은 "호실 " 접두어를 떼고 번호만 남긴다', () => {
    const r = fitLabel('호실 2-01', rect(0.1, 0.1, 0.16, 0.2), 1000, 600)
    expect(r?.text).toBe('2-01')
  })
  it('너무 작은 방은 이름을 그리지 않는다', () => {
    expect(fitLabel('호실 2-01', rect(0.1, 0.1, 0.12, 0.12), 1000, 600)).toBeNull()
  })
  it('빈 이름은 null', () => {
    expect(fitLabel('  ', rect(0, 0, 1, 1), 1000, 600)).toBeNull()
  })
  it('polyExtent 는 가로·세로 길이', () => {
    const { w, h } = polyExtent(rect(0.2, 0.1, 0.5, 0.4))
    expect(w).toBeCloseTo(0.3)
    expect(h).toBeCloseTo(0.3)
  })
})
