/**
 * 배정관리(admin)와 동일한 "오늘" 정의.
 * 낮 12시를 하루의 시작으로 취급:
 *   - 12:00 이후 ~ 익일 11:59 → 오늘 날짜의 일정이 "오늘"
 *   - 00:00 ~ 11:59 → 전날 날짜의 일정이 "오늘" (전날 밤 시작한 작업 반영)
 *
 * 클라이언트(브라우저) 로컬 시각 기준. 서버에서 호출하면 UTC 기준이 되어
 * 의도와 달라지므로 반드시 'use client' 컴포넌트에서만 호출.
 */
function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getScheduleToday(): string {
  const now = new Date()
  const target = new Date(now)
  if (now.getHours() < 12) {
    target.setDate(target.getDate() - 1)
  }
  return formatLocalDate(target)
}
