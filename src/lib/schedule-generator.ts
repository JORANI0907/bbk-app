/**
 * BBK 방문 일정 생성 유틸리티 (전면 재작성)
 * visit_cycle_unit: day | week | month | quarter | year
 *
 * weekday 기준: 0=일, 1=월, 2=화, 3=수, 4=목, 5=금, 6=토 (JS Date.getDay())
 */

export type VisitCycleUnit = 'day' | 'week' | 'month' | 'quarter' | 'year'

export interface VisitCycleConfig {
  weekdays?:    number[]  // week: 방문 요일 배열 [0-6]
  dates?:       number[]  // month: 방문 날짜 배열 [1-31]
  month_offset?: number   // quarter: 분기 내 몇 번째 달 (0=첫달, 1=둘째, 2=셋째)
  date?:        number    // quarter/year: 방문 날짜
  month?:       number    // year: 방문 월 (1-12)
}

export interface VisitCycleInput {
  unit:          VisitCycleUnit
  value:         number           // N단위마다 (1=매번, 2=격주/격월, 3=분기 등)
  config:        VisitCycleConfig
  contractStart: string           // YYYY-MM-DD
  contractEnd:   string | null    // YYYY-MM-DD or null(진행중)
}

// ───────────────────────────────────────────────
// 메인 함수: 계약기간 내 전체 방문 예정일 생성
// ───────────────────────────────────────────────
export function generateVisitSchedule(input: VisitCycleInput): string[] {
  const start = new Date(input.contractStart)
  const end   = input.contractEnd
    ? new Date(input.contractEnd)
    : new Date(start.getFullYear() + 3, start.getMonth(), start.getDate()) // 미설정 시 3년 기본

  const dates: string[] = []
  const { unit, value, config } = input

  switch (unit) {
    case 'day':
      generateDay(start, end, value, dates)
      break
    case 'week':
      generateWeek(start, end, value, config.weekdays ?? [], dates)
      break
    case 'month':
      generateMonth(start, end, value, config.dates ?? [], input.contractStart, input.contractEnd, dates)
      break
    case 'quarter':
      generateQuarter(start, end, value, config.month_offset ?? 0, config.date ?? 1, input.contractStart, input.contractEnd, dates)
      break
    case 'year':
      generateYear(start, end, value, config.month ?? 1, config.date ?? 1, input.contractStart, input.contractEnd, dates)
      break
  }

  return dates.sort()
}

// ───────────────────────────────────────────────
// day: 매 N일마다 방문
// ───────────────────────────────────────────────
function generateDay(start: Date, end: Date, value: number, out: string[]) {
  const cursor = new Date(start)
  while (cursor <= end) {
    out.push(fmt(cursor))
    cursor.setDate(cursor.getDate() + value)
  }
}

// ───────────────────────────────────────────────
// week: 매 N주마다 지정 요일에 방문
// 격주(value=2): 계약 시작일이 속한 주를 기준으로 N주씩 블록 이동
// ───────────────────────────────────────────────
function generateWeek(start: Date, end: Date, value: number, weekdays: number[], out: string[]) {
  if (weekdays.length === 0) return

  // 계약 시작일이 속한 주의 일요일(기준점)
  const weekBase = new Date(start)
  weekBase.setDate(weekBase.getDate() - weekBase.getDay())

  const cursor = new Date(weekBase)
  while (cursor <= end) {
    for (const wd of weekdays) {
      const d = new Date(cursor)
      d.setDate(cursor.getDate() + wd)
      if (d >= start && d <= end) out.push(fmt(d))
    }
    cursor.setDate(cursor.getDate() + value * 7)
  }
}

// ───────────────────────────────────────────────
// month: 매 N개월마다 지정 날짜들에 방문
// ───────────────────────────────────────────────
function generateMonth(
  start: Date, end: Date, value: number, dates: number[],
  contractStart: string, contractEnd: string | null, out: string[],
) {
  if (dates.length === 0) return

  let y = start.getFullYear()
  let m = start.getMonth() + 1

  const endY = end.getFullYear()
  const endM = end.getMonth() + 1

  while (y < endY || (y === endY && m <= endM)) {
    const dim = daysIn(y, m)
    for (const d of dates) {
      if (d >= 1 && d <= dim) {
        const s = fmtYMD(y, m, d)
        if (s >= contractStart && (!contractEnd || s <= contractEnd)) {
          out.push(s)
        }
      }
    }
    m += value
    while (m > 12) { m -= 12; y++ }
  }
}

// ───────────────────────────────────────────────
// quarter: 분기마다 방문 (value=1이면 매분기, value=2이면 반기)
// month_offset: 분기 내 몇 번째 달 (0=첫달, 1=둘째, 2=셋째)
// ───────────────────────────────────────────────
function generateQuarter(
  start: Date, end: Date, value: number,
  monthOffset: number, date: number,
  contractStart: string, contractEnd: string | null, out: string[],
) {
  let y = start.getFullYear()
  let m = start.getMonth() + 1 + monthOffset
  while (m > 12) { m -= 12; y++ }

  const maxY = end.getFullYear() + 1
  while (y <= maxY) {
    const dim = daysIn(y, m)
    if (date >= 1 && date <= dim) {
      const s = fmtYMD(y, m, date)
      if (s >= contractStart && (!contractEnd || s <= contractEnd)) {
        out.push(s)
      }
      if (contractEnd && s > contractEnd) break
    }
    m += 3 * value
    while (m > 12) { m -= 12; y++ }
    if (y > maxY) break
  }
}

// ───────────────────────────────────────────────
// year: 매 N년마다 지정 월/일에 방문
// ───────────────────────────────────────────────
function generateYear(
  start: Date, end: Date, value: number,
  month: number, date: number,
  contractStart: string, contractEnd: string | null, out: string[],
) {
  for (let y = start.getFullYear(); y <= end.getFullYear() + 1; y += value) {
    const dim = daysIn(y, month)
    if (date >= 1 && date <= dim) {
      const s = fmtYMD(y, month, date)
      if (s >= contractStart && (!contractEnd || s <= contractEnd)) {
        out.push(s)
      }
    }
  }
}

// ───────────────────────────────────────────────
// 헬퍼
// ───────────────────────────────────────────────
function daysIn(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function fmtYMD(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function fmt(d: Date): string {
  return fmtYMD(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

// ───────────────────────────────────────────────
// 하위 호환: 기존 generateMonthlySchedule 래핑
// (generate-schedules API가 업데이트되기 전까지 유지)
// ───────────────────────────────────────────────
export type VisitScheduleType = 'weekday' | 'monthly_date'

export function generateMonthlySchedule(
  year: number,
  month: number,
  scheduleType: VisitScheduleType,
  weekdays: number[],
  monthlyDates: number[],
): string[] {
  const start = fmtYMD(year, month, 1)
  const end   = fmtYMD(year, month, daysIn(year, month))

  if (scheduleType === 'weekday') {
    return generateVisitSchedule({
      unit: 'week', value: 1,
      config: { weekdays },
      contractStart: start, contractEnd: end,
    })
  }
  return generateVisitSchedule({
    unit: 'month', value: 1,
    config: { dates: monthlyDates },
    contractStart: start, contractEnd: end,
  })
}

export function getNextMonth(): { year: number; month: number } {
  const now = new Date()
  const month = now.getMonth() + 2
  if (month > 12) return { year: now.getFullYear() + 1, month: 1 }
  return { year: now.getFullYear(), month }
}

export function weekdayLabel(weekday: number): string {
  return ['일', '월', '화', '수', '목', '금', '토'][weekday] ?? ''
}
