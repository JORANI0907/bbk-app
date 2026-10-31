import { describe, it, expect } from 'vitest'
import {
  computeNotifyStartDate,
  decideSend,
  planSendDates,
  isoToKstDate,
  addDaysIso,
  diffDaysIso,
  triggerLabel,
} from '../billing-notify-policy'

describe('날짜 유틸', () => {
  it('addDaysIso 는 월말을 넘겨도 정확하다', () => {
    expect(addDaysIso('2026-10-30', 3)).toBe('2026-11-02')
    expect(addDaysIso('2026-03-01', -3)).toBe('2026-02-26')
  })

  it('diffDaysIso 는 b - a 일수', () => {
    expect(diffDaysIso('2026-11-01', '2026-11-08')).toBe(7)
    expect(diffDaysIso('2026-11-08', '2026-11-01')).toBe(-7)
  })

  it('isoToKstDate: UTC 저녁 → 한국 다음날', () => {
    // 2026-10-31 21:00 UTC = 2026-11-01 06:00 KST
    expect(isoToKstDate('2026-10-31T21:00:00.000Z')).toBe('2026-11-01')
    // 한국 시각 문자열(+09:00)도 그대로 한국 날짜
    expect(isoToKstDate('2026-11-01T06:00:00+09:00')).toBe('2026-11-01')
    expect(isoToKstDate(null)).toBeNull()
    expect(isoToKstDate('garbage')).toBeNull()
  })
})

describe('computeNotifyStartDate', () => {
  it('건별 후불: 작업완료 당일', () => {
    expect(computeNotifyStartDate({
      trigger: 'per_visit', timing: 'postpaid', dueDate: null, workCompletedDate: '2026-11-05',
    })).toBe('2026-11-05')
  })

  it('건별 선불: 시공일 당일', () => {
    expect(computeNotifyStartDate({
      trigger: 'per_visit', timing: 'prepaid', dueDate: null, constructionDate: '2026-11-10',
    })).toBe('2026-11-10')
  })

  it('건별인데 날짜 정보가 없으면 null (아직 발송 안 함)', () => {
    expect(computeNotifyStartDate({ trigger: 'per_visit', timing: 'postpaid', dueDate: '2026-11-30' })).toBeNull()
  })

  it('결제주기 선납: 결제일자 당일 (선납·후납 안내 시점 동일)', () => {
    expect(computeNotifyStartDate({ trigger: 'monthly_date', timing: 'prepaid', dueDate: '2026-11-16' })).toBe('2026-11-16')
  })

  it('결제주기 후납: 결제일자 당일', () => {
    expect(computeNotifyStartDate({ trigger: 'monthly_date', timing: 'postpaid', dueDate: '2026-11-16' })).toBe('2026-11-16')
  })

  it('결제 기준 미지정(레거시)은 결제주기 규칙으로 처리', () => {
    expect(computeNotifyStartDate({ trigger: null, timing: 'prepaid', dueDate: '2026-11-20' })).toBe('2026-11-20')
  })

  it('연 1회는 고객 발송 없음', () => {
    expect(computeNotifyStartDate({ trigger: 'yearly', timing: 'prepaid', dueDate: '2027-08-30' })).toBeNull()
  })
})

describe('decideSend: 당일·3일·7일 최대 3회', () => {
  const base = { notifyStartDate: '2026-11-01', lastNotifiedAt: null }

  it('시작일 전에는 보내지 않는다', () => {
    expect(decideSend({ ...base, todayIso: '2026-10-31', sendAttempts: 0 })).toEqual({ send: false, reason: 'not_due' })
  })

  it('시작일 당일 1차 발송', () => {
    expect(decideSend({ ...base, todayIso: '2026-11-01', sendAttempts: 0 })).toEqual({ send: true, attemptNo: 1 })
  })

  it('1차 보낸 다음날은 아직 2차 아님', () => {
    expect(decideSend({ ...base, todayIso: '2026-11-02', sendAttempts: 1, lastNotifiedAt: '2026-11-01T00:00:00Z' }))
      .toEqual({ send: false, reason: 'not_due' })
  })

  it('3일 뒤 2차, 7일 뒤 3차', () => {
    expect(decideSend({ ...base, todayIso: '2026-11-04', sendAttempts: 1 })).toEqual({ send: true, attemptNo: 2 })
    expect(decideSend({ ...base, todayIso: '2026-11-08', sendAttempts: 2 })).toEqual({ send: true, attemptNo: 3 })
  })

  it('3회 다 보냈으면 종료', () => {
    expect(decideSend({ ...base, todayIso: '2026-11-20', sendAttempts: 3 })).toEqual({ send: false, reason: 'max_reached' })
  })

  it('같은 날 두 번 호출돼도 한 번만 (아침 6시 UTC 기록 → 오후 2시 재호출)', () => {
    // 2026-11-01 06:00 KST = 2026-10-31 21:00 UTC 로 저장됨
    expect(decideSend({ ...base, todayIso: '2026-11-01', sendAttempts: 1, lastNotifiedAt: '2026-10-31T21:00:28.000Z' }))
      .toEqual({ send: false, reason: 'already_today' })
  })

  it('시작일이 한참 지났으면 밀린 회차를 하루 1회씩 따라잡는다', () => {
    expect(decideSend({ ...base, todayIso: '2026-11-20', sendAttempts: 0 })).toEqual({ send: true, attemptNo: 1 })
    expect(decideSend({ ...base, todayIso: '2026-11-21', sendAttempts: 1, lastNotifiedAt: '2026-11-20T00:00:00Z' }))
      .toEqual({ send: true, attemptNo: 2 })
  })

  it('알림 시작일이 없으면(건별 미활성) 보내지 않는다', () => {
    expect(decideSend({ todayIso: '2026-11-01', notifyStartDate: null, sendAttempts: 0, lastNotifiedAt: null }))
      .toEqual({ send: false, reason: 'not_started' })
  })
})

describe('planSendDates / triggerLabel', () => {
  it('3회 예정일', () => {
    expect(planSendDates('2026-11-01').map(p => p.date)).toEqual(['2026-11-01', '2026-11-04', '2026-11-08'])
  })

  it('라벨', () => {
    expect(triggerLabel('per_visit')).toBe('시공 1건마다')
    expect(triggerLabel('monthly_date', 16)).toBe('매월 16일')
    expect(triggerLabel(null, 5)).toBe('매월 5일')
    expect(triggerLabel(null)).toBe('결제 기준 미설정')
  })
})
