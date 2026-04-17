// Vercel 서버는 UTC로 돌아가므로 new Date() 기반 date-fns format()은
// KST 사용자 관점에서 최대 9시간 어긋남. 아래 헬퍼로 KST 기준 날짜/라벨을 얻는다.

/** KST 기준 오늘 날짜 'YYYY-MM-DD' (DB 쿼리용) */
export function todayKstString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/**
 * date-fns format()에 넘기면 KST 벽시계 기준 결과를 얻는 Date.
 * (내부적으로 UTC 시간을 +9h 시프트해 로컬 getters가 KST 값을 돌려주도록 만든 대체 Date)
 */
export function kstNow(): Date {
  const now = new Date()
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000
  return new Date(utcMs + 9 * 60 * 60_000)
}
