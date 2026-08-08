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

// 고용형태 enum 값을 한글 라벨로 변환 (DB에 FULL_TIME 등 영문으로 저장됨)
const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: '정규직',
  CONTRACT: '계약직',
  PART_TIME: '파트타임',
  DAILY: '일용직',
  FREELANCER: '프리랜서',
  SUBCONTRACT: '도급',
  ULTRA_SHORT: '초단시간',
}

export function fmtEmploymentType(raw: string | null | undefined): string {
  if (!raw) return '기타'
  return EMPLOYMENT_TYPE_LABELS[raw] ?? raw
}
