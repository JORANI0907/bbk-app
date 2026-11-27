/**
 * 계약 조건(금액·방문 주기·결제 방식) — 계약서 작성 모달에서 입력한 값을
 *   1) 양식의 「계약 내용」 변수({{계약기간}} {{회당총액}} …)에 채우고
 *   2) 서명 화면 "계약 정보" 요약에도 그대로 보여 주기 위한 순수 함수 모음.
 * 고객 마스터에서 기본값을 만들어 주는 함수도 여기 둔다 (DB·DOM 의존 없음).
 */

/** 모달에서 입력하는 계약 조건 (customer_info 에 함께 저장) */
export interface ContractTerms {
  /** 회당 공급가액 (원, 숫자만) */
  amount_supply?: string
  /** 회당 부가세 (원) */
  amount_vat?: string
  /** 회당 총액 (부가세 포함, 원) */
  amount_total?: string
  /** 방문 주기·요일·시간 — 자유 문장 ("6개월마다 1일 21:00") */
  visit_schedule?: string
  /** 결제 방식·기일 — 자유 문장 ("회차 후불 — 작업 완료 후 7일 이내 가상계좌") */
  payment_terms?: string
}

export const FILL_PLACEHOLDER = '(계약 체결 시 기재)'

/** "1,840,000" 같은 입력에서 숫자만 뽑는다. 비어 있거나 숫자가 없으면 null */
export function parseWon(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null
  const digits = String(input).replace(/[^\d]/g, '')
  if (!digits) return null
  return Number(digits)
}

export function formatWon(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return ''
  return `${n.toLocaleString('ko-KR')}원`
}

/** 공급가액에서 부가세(10%, 원 단위 절사)와 총액을 계산 */
export function amountsFromSupply(supply: number): { supply: number; vat: number; total: number } {
  const vat = Math.floor(supply * 0.1)
  return { supply, vat, total: supply + vat }
}

/** 총액(부가세 포함)에서 공급가액·부가세를 역산 (공급가액 = 총액/1.1 반올림) */
export function amountsFromTotal(total: number): { supply: number; vat: number; total: number } {
  const supply = Math.round(total / 1.1)
  return { supply, vat: total - supply, total }
}

/** "2,024,000원 (공급 1,840,000원 + 부가세 184,000원)" — 총액이 없으면 빈 문자열 */
export function describeAmount(t: ContractTerms): string {
  const total = parseWon(t.amount_total)
  if (total === null) return ''
  const supply = parseWon(t.amount_supply)
  const vat = parseWon(t.amount_vat)
  if (supply === null || vat === null) return formatWon(total)
  return `${formatWon(total)} (공급 ${formatWon(supply)} + 부가세 ${formatWon(vat)})`
}

export function describePeriod(start: string | null | undefined, end: string | null | undefined): string {
  if (!start && !end) return ''
  return `${start || '-'} ~ ${end || '-'}`
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']

/** 고객 마스터의 방문 주기 설정 → 사람이 읽는 한 줄. 알 수 없으면 빈 문자열 */
export function describeVisitSchedule(c: {
  visit_cycle_unit?: string | null
  visit_cycle_value?: number | null
  visit_cycle_config?: { weekdays?: number[]; dates?: number[]; month?: number; date?: number } | null
  construction_time?: string | null
}): string {
  const unit = c.visit_cycle_unit
  const n = c.visit_cycle_value ?? 1
  const cfg = c.visit_cycle_config ?? {}
  const time = c.construction_time ? ` ${c.construction_time.slice(0, 5)}` : ''
  if (unit === 'week') {
    const days = (cfg.weekdays ?? []).map((d) => WEEKDAY_KO[d]).filter(Boolean).join('·')
    const every = n === 1 ? '매주' : n === 2 ? '격주' : `${n}주마다`
    return days ? `${every} ${days}요일${time}` : `${every}${time}`
  }
  if (unit === 'month') {
    const dates = (cfg.dates ?? []).map((d) => `${d}일`).join('·')
    const every = n === 1 ? '매월' : `${n}개월마다`
    return dates ? `${every} ${dates}${time}` : `${every}${time}`
  }
  if (unit === 'quarter') return `분기마다 ${cfg.date ?? 1}일${time}`
  if (unit === 'year') return `매년 ${cfg.month ?? 1}월 ${cfg.date ?? 1}일${time}`
  if (unit === 'day') return n === 1 ? `매일${time}` : `${n}일마다${time}`
  return ''
}

/** 고객 마스터의 결제 설정 → 한 줄. 알 수 없으면 빈 문자열 */
export function describePaymentTerms(c: {
  billing_trigger?: string | null
  billing_timing?: string | null
  billing_cycle?: string | null
  payment_date?: number | null
  payment_method?: string | null
}): string {
  const method = c.payment_method === 'virtual_account' ? '가상계좌' : c.payment_method === 'card' ? '카드' : ''
  const via = method ? ` · ${method}` : ''
  if (c.billing_trigger === 'per_visit') return `회차 후불 — 작업 완료 후 청구${via}`
  if (c.billing_cycle === '연간') return `기간 선납 — 계약 체결 시 1년분 일괄${via}`
  if (c.billing_cycle) {
    const when = c.billing_timing === 'postpaid' ? '후납' : '선납'
    const day = c.payment_date ? ` 매 ${c.payment_date}일` : ''
    return `주기 ${when} — ${c.billing_cycle}${day}${via}`
  }
  return ''
}

/** 양식의 「계약 내용」 변수 치환. 값이 비면 "(계약 체결 시 기재)" 를 남겨 편집기에서 채우게 한다 */
export function applyContractTermVars(
  html: string,
  info: ContractTerms & { contract_start_date?: string; contract_end_date?: string; care_scope?: string; address?: string },
): string {
  const or = (v: string | null | undefined) => (v && v.trim() ? escapeHtml(v.trim()) : FILL_PLACEHOLDER)
  const supply = parseWon(info.amount_supply)
  const vat = parseWon(info.amount_vat)
  const total = parseWon(info.amount_total)
  return html
    .replace(/\{\{\s*계약기간\s*\}\}/g, or(describePeriod(info.contract_start_date, info.contract_end_date)))
    .replace(/\{\{\s*청소범위\s*\}\}/g, or(info.care_scope).replace(/\n/g, '<br>'))
    .replace(/\{\{\s*방문주기\s*\}\}/g, or(info.visit_schedule))
    .replace(/\{\{\s*회당공급가액\s*\}\}/g, supply === null ? FILL_PLACEHOLDER : formatWon(supply))
    .replace(/\{\{\s*회당부가세\s*\}\}/g, vat === null ? FILL_PLACEHOLDER : formatWon(vat))
    .replace(/\{\{\s*회당총액\s*\}\}/g, total === null ? FILL_PLACEHOLDER : formatWon(total))
    .replace(/\{\{\s*결제방식\s*\}\}/g, or(info.payment_terms))
    .replace(/\{\{\s*사업장\s*\}\}/g, or(info.address))
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
