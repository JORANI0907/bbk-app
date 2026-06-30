// 급여정산 페이지 공통 유틸

export function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('ko-KR') + '원'
}

export function fmtDate(s: string | null): string {
  if (!s) return ''
  return s.slice(5).replace('-', '/')
}

export function currentYM(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function getPrevMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const date = new Date(y, m - 2, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
