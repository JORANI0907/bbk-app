import { describe, it, expect } from 'vitest'
import { computeItemStatus, worstStatus, latestByItem, computeManualStatuses, zoneStatus, type CareCheck } from '@/lib/care-manual-status'
import { normalizeCareManual, flattenManualItems } from '@/types/care-manual'

const NOW = new Date('2026-11-08T03:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()

const check = (item_id: string, status: 'ok' | 'issue', checked_at: string): CareCheck => ({
  id: `c-${item_id}-${checked_at}`, customer_id: 'cust', item_id, zone_id: null, status, memo: null, photo_url: null, worker_name: '홍작업', checked_at,
})

describe('computeItemStatus — 빈도 × 마지막 점검', () => {
  it('기록이 없고 빈도도 없으면 none', () => {
    expect(computeItemStatus(null, undefined, NOW)).toBe('none')
  })
  it('기록이 없는데 빈도가 있으면 점검 확인 필요(due)', () => {
    expect(computeItemStatus('weekly', undefined, NOW)).toBe('due')
  })
  it('특이사항 기록이면 날짜와 상관없이 issue', () => {
    expect(computeItemStatus('monthly', check('i', 'issue', daysAgo(0)), NOW)).toBe('issue')
  })
  it('주 1회 품목: 9일 안이면 ok, 넘으면 due', () => {
    expect(computeItemStatus('weekly', check('i', 'ok', daysAgo(9)), NOW)).toBe('ok')
    expect(computeItemStatus('weekly', check('i', 'ok', daysAgo(10)), NOW)).toBe('due')
  })
  it('월 1회 품목: 33일까지 ok', () => {
    expect(computeItemStatus('monthly', check('i', 'ok', daysAgo(33)), NOW)).toBe('ok')
    expect(computeItemStatus('monthly', check('i', 'ok', daysAgo(34)), NOW)).toBe('due')
  })
  it('빈도가 없어도 정상 기록이 있으면 ok', () => {
    expect(computeItemStatus(null, check('i', 'ok', daysAgo(200)), NOW)).toBe('ok')
  })
})

describe('worstStatus', () => {
  it('issue > due > ok > none 순으로 나쁜 것을 고른다', () => {
    expect(worstStatus(['ok', 'due', 'issue'])).toBe('issue')
    expect(worstStatus(['ok', 'due'])).toBe('due')
    expect(worstStatus(['ok', 'none'])).toBe('ok')
    expect(worstStatus(['none'])).toBe('none')
    expect(worstStatus([])).toBe('none')
  })
})

describe('latestByItem', () => {
  it('품목별로 가장 최근 기록만 남긴다', () => {
    const latest = latestByItem([check('a', 'issue', daysAgo(5)), check('a', 'ok', daysAgo(1)), check('b', 'ok', daysAgo(3))])
    expect(latest.a.status).toBe('ok')
    expect(latest.b.checked_at).toBe(daysAgo(3))
  })
})

describe('computeManualStatuses · zoneStatus', () => {
  const manual = normalizeCareManual({
    version: 2,
    zones: [
      { id: 'z1', name: '주방', color: 'sky', groups: [{ id: 'g1', title: '후드', items: [
        { id: 'i1', title: '필터', instructions: '', frequency: 'weekly', images: [] },
        { id: 'i2', title: '덕트', instructions: '', frequency: 'monthly', images: [] },
      ] }] },
      { id: 'z2', name: '홀', color: 'mint', groups: [{ id: 'g2', title: '바닥', items: [
        { id: 'i3', title: '바닥', instructions: '', images: [] },
      ] }] },
    ],
  })

  it('품목마다 상태를 계산하고 구역은 가장 나쁜 상태를 따른다', () => {
    const latest = latestByItem([check('i1', 'ok', daysAgo(2)), check('i2', 'issue', daysAgo(1))])
    const statuses = computeManualStatuses(manual, latest, NOW)
    expect(statuses).toEqual({ i1: 'ok', i2: 'issue', i3: 'none' })
    expect(zoneStatus('z1', manual, statuses)).toBe('issue')
    expect(zoneStatus('z2', manual, statuses)).toBe('none')
  })

  it('flattenManualItems 는 구역 안 번호를 1부터 매긴다', () => {
    expect(flattenManualItems(manual).map(f => `${f.zone.id}:${f.index}`)).toEqual(['z1:1', 'z1:2', 'z2:1'])
  })
})

describe('normalizeCareManual — 공간 보기 필드', () => {
  it('360 사진·표시·층 정보를 보존하고 잘못된 표시는 버린다', () => {
    const m = normalizeCareManual({
      version: 2,
      zones: [{
        id: 'z1', name: '사무실', color: 'sky', groups: [],
        space: { floor: 5.7, mesh_key: '5F-office' },
        panoramas: [{
          id: 'p1', title: '입구', image_url: '/demo/pano/office.jpg',
          markers: [
            { id: 'm1', item_id: 'i1', type: 'point', yaw: 0.5, pitch: -0.1 },
            { id: 'm2', item_id: 'i2', type: 'polygon', points: [[0, 0], [0.1, 0], [0.1, 0.1]] },
            { id: 'bad1', item_id: 'i3', type: 'point' },
            { id: 'bad2', item_id: 'i4', type: 'polygon', points: [[0, 0]] },
            { id: 'bad3', item_id: '', type: 'point', yaw: 0, pitch: 0 },
          ],
        }, { id: 'p2', title: '사진 없음', image_url: '', markers: [] }],
      }],
      space_model_url: 'https://x/model.glb',
    })
    const z = m.zones[0]
    expect(z.space).toEqual({ floor: 5, mesh_key: '5F-office' })
    expect(z.panoramas).toHaveLength(1)
    expect(z.panoramas?.[0].markers.map(x => x.id)).toEqual(['m1', 'm2'])
    expect(m.space_model_url).toBe('https://x/model.glb')
  })

  it('배열 안 null·타입이 틀린 값·모르는 빈도가 섞여도 깨지지 않는다', () => {
    const m = normalizeCareManual({
      version: 2,
      zones: [
        null,
        'oops',
        { id: 'z1', name: { ko: '주방' }, color: 7, groups: [null, { id: 'g1', title: 12, summary: null, items: [null, { id: 'i1', title: ['a'], instructions: 3, frequency: 'daily', caution: {}, images: ['u', 5, null] }] }] },
      ],
      updates: [null, { zone_id: 'z1', at: '2026-11-08T00:00:00Z', zone_name: 9 }],
      legacy_section_images: 'nope',
      space_model_url: 42,
    } as unknown)
    expect(m.zones).toHaveLength(1)
    const z = m.zones[0]
    expect(z.name).toBe('')
    expect(z.color).toBe('sky')
    expect(z.groups).toHaveLength(1)
    const i = z.groups[0].items[0]
    expect(i).toEqual({ id: 'i1', title: '', instructions: '', images: ['u'] })
    expect(m.updates?.[0].zone_name).toBe('')
    expect(m).not.toHaveProperty('legacy_section_images')
    expect(m).not.toHaveProperty('space_model_url')
  })

  it('id 가 없으면 위치 기반으로 고정 생성 — 두 번 불러도 같다', () => {
    const raw = { version: 2, zones: [{ name: 'a', color: 'sky', groups: [{ title: 'g', items: [{ title: 't', instructions: '', images: [] }] }] }] } as unknown
    const a = normalizeCareManual(raw)
    const b = normalizeCareManual(raw)
    expect(a.zones[0].groups[0].items[0].id).toBe(b.zones[0].groups[0].items[0].id)
    expect(a.zones[0].id).toBe('z0')
  })

  it('v1(레거시) 변환도 id 가 고정이다', () => {
    const raw = [{ section: '주방', items: [{ label: '후드', desc: '세척' }] }]
    expect(normalizeCareManual(raw).zones[0].groups[0].items[0].id).toBe('s0-i0')
    expect(normalizeCareManual(raw)).toEqual(normalizeCareManual(raw))
  })

  it('자료함은 url 없는 항목을 버리고 종류·크기를 정리한다', () => {
    const m = normalizeCareManual({
      version: 2, zones: [],
      assets: [
        { id: 'a1', kind: 'floorplan', title: '5층 평면도', url: 'https://x/a.pdf', mime: 'application/pdf', size: 1234, uploaded_at: '2026-11-08T00:00:00Z', zone_id: 'z1' },
        { id: 'a2', kind: 'weird', title: 7, url: 'https://x/b.jpg', size: 'big' },
        { id: 'bad', kind: 'photo', title: 'no url' },
        null,
      ],
    } as unknown)
    expect(m.assets?.map(a => a.id)).toEqual(['a1', 'a2'])
    expect(m.assets?.[0].zone_id).toBe('z1')
    expect(m.assets?.[1]).toMatchObject({ kind: 'other', title: '', size: 0, mime: 'application/octet-stream' })
  })

  it('평면 사진의 표시는 x·y 비율로, 360 은 yaw·pitch 로 받는다', () => {
    const m = normalizeCareManual({
      version: 2,
      zones: [{
        id: 'z', name: 'a', color: 'sky', groups: [],
        panoramas: [
          { id: 'flat', title: '', image_url: '/f.jpg', kind: 'flat', source_item_id: 'i9', markers: [
            { id: 'a', item_id: 'i1', type: 'point', x: 1.4, y: -0.2 },
            { id: 'b', item_id: 'i2', type: 'point', yaw: 0.1, pitch: 0.1 },
            { id: 'c', item_id: 'i3', type: 'polygon', points: [[0, 0], [2, 0], [1, 1]] },
          ] },
          { id: 'sphere', title: '', image_url: '/s.jpg', markers: [{ id: 'd', item_id: 'i4', type: 'point', yaw: 3, pitch: -1 }] },
        ],
      }],
    } as unknown)
    const [flat, sphere] = m.zones[0].panoramas!
    expect(flat.kind).toBe('flat')
    expect(flat.source_item_id).toBe('i9')
    expect(flat.markers.map(x => x.id)).toEqual(['a', 'c'])
    expect(flat.markers[0]).toMatchObject({ x: 1, y: 0 })
    expect(flat.markers[1].points).toEqual([[0, 0], [1, 0], [1, 1]])
    expect(sphere).not.toHaveProperty('kind')
    expect(sphere.markers[0]).toMatchObject({ yaw: 3, pitch: -1 })
  })

  it('공간 필드가 없으면 예전과 똑같은 모양', () => {
    const m = normalizeCareManual({ version: 2, zones: [{ id: 'z', name: 'a', color: 'sky', groups: [] }] })
    expect(m.zones[0]).not.toHaveProperty('panoramas')
    expect(m.zones[0]).not.toHaveProperty('space')
    expect(m).not.toHaveProperty('space_model_url')
  })
})
