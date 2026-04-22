import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

interface CustomerRow {
  id: string
  customer_type: string | null
  billing_cycle: string | null
  billing_amount: number | null
  payment_date: number | null
  contract_start_date: string | null
  contract_end_date: string | null
}

interface BillingPeriod {
  billing_type: 'monthly' | 'annual'
  billing_period: string
  due_date: string
  amount: number
}

function calcAllPeriods(customer: CustomerRow): BillingPeriod[] {
  const { customer_type, billing_cycle, billing_amount, payment_date, contract_start_date, contract_end_date } = customer
  if (!contract_start_date || !billing_amount) return []

  const start = new Date(contract_start_date)
  const end = contract_end_date ? new Date(contract_end_date) : new Date()
  const day = payment_date ?? 25
  const results: BillingPeriod[] = []

  if (customer_type === '정기딥케어' && billing_cycle === '연간') {
    const startYear = start.getFullYear()
    const endYear = end.getFullYear()
    for (let y = startYear; y <= endYear; y++) {
      const dueDate = (y === endYear && contract_end_date)
        ? contract_end_date.slice(0, 10)
        : `${y}-12-31`
      results.push({ billing_type: 'annual', billing_period: String(y), due_date: dueDate, amount: billing_amount })
    }
  } else if (customer_type === '정기엔드케어') {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
    const endCursor = new Date(end.getFullYear(), end.getMonth(), 1)
    while (cursor <= endCursor) {
      const y = cursor.getFullYear()
      const m = cursor.getMonth() + 1
      const period = `${y}-${String(m).padStart(2, '0')}`
      const lastDay = new Date(y, m, 0).getDate()
      const dueDay = Math.min(day, lastDay)
      const dueDate = `${y}-${String(m).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`
      results.push({ billing_type: 'monthly', billing_period: period, due_date: dueDate, amount: billing_amount })
      cursor.setMonth(cursor.getMonth() + 1)
    }
  }

  return results
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { customer_ids }: { customer_ids: string[] } = body

  if (!Array.isArray(customer_ids) || customer_ids.length === 0) {
    return NextResponse.json({ error: 'customer_ids가 필요합니다.' }, { status: 400 })
  }

  const { data: customersData, error: fetchError } = await supabase
    .from('customers')
    .select('id, customer_type, billing_cycle, billing_amount, payment_date, contract_start_date, contract_end_date')
    .in('id', customer_ids)
    .is('deleted_at', null)

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })

  const customers = (customersData ?? []) as CustomerRow[]
  const results: Array<{ customer_id: string; inserted: number; skipped: number }> = []
  let totalInserted = 0

  for (const customer of customers) {
    const eligible =
      (customer.customer_type === '정기딥케어' && customer.billing_cycle === '연간') ||
      customer.customer_type === '정기엔드케어'

    if (!eligible || !customer.contract_start_date || !customer.billing_amount) {
      results.push({ customer_id: customer.id, inserted: 0, skipped: 0 })
      continue
    }

    const allPeriods = calcAllPeriods(customer)
    if (allPeriods.length === 0) {
      results.push({ customer_id: customer.id, inserted: 0, skipped: 0 })
      continue
    }

    // 이미 존재하는 기간 조회
    const { data: existingRows } = await supabase
      .from('service_billings')
      .select('billing_period')
      .eq('customer_id', customer.id)

    const existingPeriods = new Set((existingRows ?? []).map((r: { billing_period: string }) => r.billing_period))
    const toInsert = allPeriods.filter(p => !existingPeriods.has(p.billing_period))
    const skipped = allPeriods.length - toInsert.length

    if (toInsert.length === 0) {
      results.push({ customer_id: customer.id, inserted: 0, skipped })
      continue
    }

    const rows = toInsert.map(p => ({
      customer_id: customer.id,
      billing_type: p.billing_type,
      billing_period: p.billing_period,
      amount: p.amount,
      due_date: p.due_date,
      status: 'pending',
    }))

    const { data: inserted, error: insertError } = await supabase
      .from('service_billings')
      .insert(rows)
      .select('id')

    if (insertError) {
      results.push({ customer_id: customer.id, inserted: 0, skipped })
      continue
    }

    const insertedCount = (inserted ?? []).length
    totalInserted += insertedCount
    results.push({ customer_id: customer.id, inserted: insertedCount, skipped })
  }

  return NextResponse.json({ results, totalInserted })
}
