// 매입 유형(finance_records.group_name) 드롭다운 목록.
// 청소업 법인 통상 계정 기준. 카테고리별로 분리.
// v1 은 고정 목록 — 목록에 없는 유형이 필요해지면 이 파일에 추가.

export const UNCLASSIFIED = '미분류' as const

export const FIXED_EXPENSE_TYPES = [
  UNCLASSIFIED,
  '사무실 임대료',
  '사무실 관리비',
  '통신비',
  '4대보험료',
  '리스/할부금',
  '대출이자',
  '세무·회계 기장료',
  'SW 구독료',
  '광고 정기 노출료',
] as const

export const VARIABLE_EXPENSE_TYPES = [
  UNCLASSIFIED,
  '청소용품/약품/세제',
  '자재비',
  '소모품',
  '유류비',
  '차량유지비',
  '통행료·주차비',
  '식대·회의비',
  '광고 스팟 집행',
  '지급수수료',
  '교육훈련비',
  '수선비',
  '소모기기',
  '배송비',
  '접대비',
  '기타',
] as const

export type FinanceCategory = 'fixed' | 'variable'
export type FixedExpenseType = typeof FIXED_EXPENSE_TYPES[number]
export type VariableExpenseType = typeof VARIABLE_EXPENSE_TYPES[number]
export type ExpenseType = FixedExpenseType | VariableExpenseType

export function getExpenseTypes(category: FinanceCategory): readonly string[] {
  return category === 'fixed' ? FIXED_EXPENSE_TYPES : VARIABLE_EXPENSE_TYPES
}

// 유형별 색상 — StackedComposition 에서 group_name 기준으로 색을 안정적으로 배정하기 위함.
// 목록에 없는 값이 오면 팔레트에서 해시로 대체.
export const EXPENSE_TYPE_COLORS: Record<string, string> = {
  [UNCLASSIFIED]: '#94a3b8',
  '사무실 임대료':   '#6366f1',
  '사무실 관리비':   '#8b5cf6',
  '통신비':          '#0ea5e9',
  '4대보험료':       '#06b6d4',
  '리스/할부금':     '#14b8a6',
  '대출이자':        '#ef4444',
  '세무·회계 기장료': '#f59e0b',
  'SW 구독료':       '#a855f7',
  '광고 정기 노출료': '#ec4899',
  '청소용품/약품/세제': '#22c55e',
  '자재비':          '#84cc16',
  '소모품':          '#eab308',
  '유류비':          '#f97316',
  '차량유지비':      '#f43f5e',
  '통행료·주차비':   '#3b82f6',
  '식대·회의비':     '#10b981',
  '광고 스팟 집행':  '#d946ef',
  '지급수수료':      '#64748b',
  '교육훈련비':      '#0891b2',
  '수선비':          '#7c3aed',
  '소모기기':        '#c026d3',
  '배송비':          '#0d9488',
  '접대비':          '#dc2626',
  '기타':            '#78716c',
}
