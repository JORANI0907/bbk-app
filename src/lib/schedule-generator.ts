/**
 * 정기케어 방문 일정 생성 유틸리티
 * weekday: 0=일, 1=월, 2=화, 3=수, 4=목, 5=금, 6=토 (JS Date.getDay() 기준)
 * monthly_date: 1-31 (매월 특정 날짜)
 */

export type VisitScheduleType = 'weekday' | 'monthly_date'

/**
 * 지정한 연/월에 방문 일정을 생성합니다.
 * @param year 연도 (e.g. 2025)
 * @param month 월 1-12
 * @param scheduleType 'weekday' | 'monthly_date'
 * @param weekdays JS weekday 배열 [0-6] (0=일, 1=월, ... 6=토)
 * @param monthlyDates 날짜 배열 [1-31]
 * @returns 'YYYY-MM-DD' 형식의 날짜 배열 (오름차순)
 */
export function generateMonthlySchedule(
  year: number,
  month: number,
  scheduleType: VisitScheduleType,
  weekdays: number[],
  monthlyDates: number[],
): string[] {
  const daysInMonth = new Date(year, month, 0).getDate()
  const dates: string[] = []

  if (scheduleType === 'weekday' && weekdays.length > 0) {
    for (let day = 1; day <= daysInMonth; day++) {
      const weekday = new Date(year, month - 1, day).getDay()
      if (weekdays.includes(weekday)) {
        dates.push(formatDate(year, month, day))
      }
    }
  } else if (scheduleType === 'monthly_date' && monthlyDates.length > 0) {
    for (const d of monthlyDates) {
      if (d >= 1 && d <= daysInMonth) {
        dates.push(formatDate(year, month, d))
      }
    }
  }

  return dates.sort()
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * 현재 날짜 기준 다음 달의 연/월을 반환합니다.
 */
export function getNextMonth(): { year: number; month: number } {
  const now = new Date()
  const month = now.getMonth() + 2 // getMonth()는 0-indexed이고, 다음 달은 +2
  if (month > 12) {
    return { year: now.getFullYear() + 1, month: 1 }
  }
  return { year: now.getFullYear(), month }
}

/**
 * 요일 인덱스(0-6)를 한국어 레이블로 변환합니다.
 */
export function weekdayLabel(weekday: number): string {
  return ['일', '월', '화', '수', '목', '금', '토'][weekday] ?? ''
}
