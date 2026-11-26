import { describe, it, expect } from 'vitest'
import {
  isOneShotSyncableStatus,
  pickOneShotSyncTarget,
  describeSkipReason,
  ONE_SHOT_SYNC_EXCLUDED_STATUSES,
} from '../one-shot-sync'

const app = (over: Partial<{ id: string; status: string | null; construction_date: string | null; business_name: string | null }> = {}) => ({
  id: 'a1',
  status: '예약확정',
  construction_date: '2026-11-25',
  business_name: '팝성형외과의원',
  ...over,
})

describe('isOneShotSyncableStatus — 취소·환급만 제외, 나머지는 전부 동기화', () => {
  it.each([
    '신규', '신규접수', '예약확정', '예약당일', '기존고객', '예약금 입금',
    '작업완료', '작업완료(엔드)', '결제', '결제완료', '카드결제 완료', '계산서발행완료', '비과세',
    '방문견적', 'A/S방문', '앞으로 생길 새 상태',
  ])('"%s" 는 동기화 대상', (status) => {
    expect(isOneShotSyncableStatus(status)).toBe(true)
  })

  it.each(ONE_SHOT_SYNC_EXCLUDED_STATUSES)('"%s" 는 제외', (status) => {
    expect(isOneShotSyncableStatus(status)).toBe(false)
    expect(isOneShotSyncableStatus(`  ${status}  `)).toBe(false)
  })

  it('상태가 비어 있어도 동기화 대상', () => {
    expect(isOneShotSyncableStatus(null)).toBe(true)
    expect(isOneShotSyncableStatus(undefined)).toBe(true)
    expect(isOneShotSyncableStatus('')).toBe(true)
  })
})

describe('pickOneShotSyncTarget', () => {
  it('결제완료 상태 신청서도 고른다 (팝성형외과 11/25 회귀)', () => {
    expect(pickOneShotSyncTarget([app({ status: '결제완료' })])?.id).toBe('a1')
  })

  it('최신 건이 취소면 그 다음 살아 있는 건을 고른다', () => {
    const picked = pickOneShotSyncTarget([
      app({ id: 'new', status: '예약취소' }),
      app({ id: 'old', status: '작업완료' }),
    ])
    expect(picked?.id).toBe('old')
  })

  it('시공일자나 업체명이 비면 건너뛴다', () => {
    const picked = pickOneShotSyncTarget([
      app({ id: 'no-date', construction_date: null }),
      app({ id: 'no-name', business_name: '' }),
      app({ id: 'ok' }),
    ])
    expect(picked?.id).toBe('ok')
  })

  it('고를 게 없으면 null', () => {
    expect(pickOneShotSyncTarget([])).toBeNull()
    expect(pickOneShotSyncTarget([app({ status: '예약금환급완료' })])).toBeNull()
  })
})

describe('describeSkipReason', () => {
  it('신청서 자체가 없을 때', () => {
    expect(describeSkipReason([])).toContain('연결된 일정(신청서)이 없어')
  })
  it('전부 취소·환급일 때', () => {
    expect(describeSkipReason([app({ status: '예약취소' })])).toContain('취소·환급 상태')
  })
  it('날짜·업체명이 빈 경우', () => {
    expect(describeSkipReason([app({ construction_date: null })])).toContain('시공일자 또는 업체명이 비어')
  })
})
