import { describe, it, expect } from 'vitest'
import { rectFromDrag, isAxisRect, translatePoly, dragVertex, snap, nextRoomName, GRID, MIN_SIZE } from '@/components/care-manual/space/plan-edit-utils'

describe('평면 그리기 계산', () => {
  it('snap 은 격자에 맞추고 0~1 을 벗어나지 않는다', () => {
    expect(snap(0.031)).toBeCloseTo(0.04)
    expect(snap(-0.3)).toBe(0)
    expect(snap(1.7)).toBe(1)
  })
  it('끌어서 네모 — 어느 방향으로 끌어도 시계 방향 네모, 너무 작으면 null', () => {
    const r = rectFromDrag([0.5, 0.5], [0.1, 0.2])
    expect(r).toEqual([[0.1, 0.2], [0.5, 0.2], [0.5, 0.5], [0.1, 0.5]])
    expect(rectFromDrag([0.5, 0.5], [0.5 + MIN_SIZE / 2, 0.5 + GRID])).toBeNull()
  })
  it('isAxisRect 는 축에 나란한 네모만 참', () => {
    expect(isAxisRect([[0, 0], [1, 0], [1, 1], [0, 1]])).toBe(true)
    expect(isAxisRect([[0, 0], [1, 0.1], [1, 1], [0, 1]])).toBe(false)
    expect(isAxisRect([[0, 0], [1, 0], [1, 1]])).toBe(false)
  })
  it('translatePoly 는 경계를 넘지 않게 옮긴다', () => {
    const sq: [number, number][] = [[0.8, 0.8], [1, 0.8], [1, 1], [0.8, 1]]
    expect(translatePoly(sq, 0.5, 0.5)).toEqual(sq)
    expect(translatePoly(sq, -0.2, -0.2)).toEqual([[0.6, 0.6], [0.8, 0.6], [0.8, 0.8], [0.6, 0.8]])
  })
  it('dragVertex — 네모는 마주보는 꼭짓점을 고정한 채 크기 조절, 다각형은 그 점만 이동', () => {
    const rect: [number, number][] = [[0.2, 0.2], [0.6, 0.2], [0.6, 0.6], [0.2, 0.6]]
    expect(dragVertex(rect, 2, [0.8, 0.9])).toEqual([[0.2, 0.2], [0.8, 0.2], [0.8, 0.9], [0.2, 0.9]])
    expect(dragVertex(rect, 2, [0.21, 0.21])).toEqual(rect) // 너무 작아지면 그대로
    const tri: [number, number][] = [[0, 0], [1, 0], [0.5, 1]]
    expect(dragVertex(tri, 2, [0.4, 0.8])).toEqual([[0, 0], [1, 0], [0.4, 0.8]])
  })
  it('nextRoomName 은 겹치지 않는 번호를 준다', () => {
    const r = (name: string) => ({ id: name, name, kind: 'room' as const, polygon: [[0, 0], [1, 0], [1, 1]] as [number, number][] })
    expect(nextRoomName([])).toBe('방 1')
    expect(nextRoomName([r('방 1'), r('방 2')])).toBe('방 3')
    expect(nextRoomName([r('a'), r('방 2')])).toBe('방 3')
  })
})
