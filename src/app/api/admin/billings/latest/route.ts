import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/admin/billings/latest
// 관리자 고객 리스트 미리보기용 배치 조회.
// 현재 연도(연간 계약용) 와 현재 월(월간 계약용) 의 청구를 한 번에 반환.
// 응답 구조: { latest: Record<customer_id, BillingRecord> }
//   - 정기딥케어(연간) 고객은 연도 record 우선
//   - 정기엔드케어(월간) 고객은 월 record 우선
// 클라이언트에서 customer.customer_type / billing_cycle 로 매칭 판별.

export async function GET() {
  const supabase = createServiceClient()

  const now = new Date()
  const currentYear = String(now.getFullYear())
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const { data, error } = await supabase
    .from('service_billings')
    .select('id, customer_id, billing_type, billing_period, amount, due_date, paid_date, status, tax_invoice_issued, tax_invoice_issued_date')
    .in('billing_period', [currentYear, currentMonth])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // customer_id 별로 대표 record 선택: 연간(annual) 우선, 없으면 월간(monthly).
  // 여러 record 가 있으면 due_date 가장 최근 것.
  const grouped = new Map<string, {
    id: string
    billing_type: 'monthly' | 'annual'
    billing_period: string
    amount: number
    due_date: string
    paid_date: string | null
    status: 'pending' | 'paid' | 'overdue'
    tax_invoice_issued: boolean | null
    tax_invoice_issued_date: string | null
  }>()

  for (const row of (data ?? [])) {
    const r = row as {
      id: string
      customer_id: string
      billing_type: 'monthly' | 'annual'
      billing_period: string
      amount: number
      due_date: string
      paid_date: string | null
      status: 'pending' | 'paid' | 'overdue'
      tax_invoice_issued: boolean | null
      tax_invoice_issued_date: string | null
    }
    const existing = grouped.get(r.customer_id)
    if (!existing) {
      grouped.set(r.customer_id, r)
    } else if (r.due_date > existing.due_date) {
      // 더 최근 due_date 로 교체
      grouped.set(r.customer_id, r)
    }
  }

  const latest: Record<string, unknown> = {}
  for (const [customerId, record] of grouped.entries()) {
    latest[customerId] = record
  }

  return NextResponse.json({ latest })
}
