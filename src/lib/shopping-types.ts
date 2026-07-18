export type ShoppingStatus = 'pending' | 'purchased' | 'canceled'
export type ShoppingPriority = 'urgent' | 'normal' | 'later'

export interface ShoppingItem {
  id: string
  title: string
  category: string | null
  priority: ShoppingPriority
  qty: number
  expected_price: number | null
  where_to_buy: string | null
  url: string | null
  memo: string | null
  status: ShoppingStatus
  purchased_at: string | null
  sort_order: number
  service_date: string | null
  created_at: string
  updated_at: string
}

export const DEFAULT_CATEGORIES = ['식료품', '생활용품', '전자', '의류', '업무', '기타'] as const

export const PRIORITY_CONFIG: Record<ShoppingPriority, { label: string; color: string; bg: string }> = {
  urgent: { label: '긴급', color: '#dc2626', bg: '#fef2f2' },
  normal: { label: '보통', color: '#2563eb', bg: '#eff6ff' },
  later:  { label: '나중', color: '#6b7280', bg: '#f3f4f6' },
}

export const STATUS_CONFIG: Record<ShoppingStatus, { label: string; color: string }> = {
  pending:   { label: '구입 예정', color: '#3b82f6' },
  purchased: { label: '구입 완료', color: '#22c55e' },
  canceled:  { label: '취소',      color: '#9ca3af' },
}

export interface ShoppingSite {
  id: string
  name: string
  url: string
  sort_order: number
  created_at: string
}
