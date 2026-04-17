/**
 * 배정관리(admin)와 동일한 "오늘" 정의.
 * 낮 12시를 하루의 시작으로 취급:
 *   - 12:00 이후 ~ 익일 11:59 → 오늘 날짜의 일정이 "오늘"
 *   - 00:00 ~ 11:59 → 전날 날짜의 일정이 "오늘" (전날 밤 시작한 작업 반영)
 *
 * 클라이언트(브라우저) 로컬 시각 기준. 서버에서 호출하면 UTC 기준이 되어
 * 의도와 달라지므로 반드시 'use client' 컴포넌트에서만 호출.
 */
export function getScheduleToday(): string {
  const now = new Date()
  if (now.getHours() < 12) {
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    return yesterday.toISOString().slice(0, 10)
  }
  return now.toISOString().slice(0, 10)
}
