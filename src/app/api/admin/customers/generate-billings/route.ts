import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  generateBillingSchedule,
  computeBillingAmountFromCustomer,
} from '@/lib/billing-generator'

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { customer_ids, regenerate = false }: { customer_ids: string[]; regenerate?: boolean } = body

  if (!Array.isArray(customer_ids) || customer_ids.length === 0) {
    return NextResponse.json({ error: 'customer_ids가 필요합니다.' }, { status: 400 })
  }

  const { data: customersData, error: fetchError } = await supabase
    .from('customers')
    .select('id, customer_type, billing_cycle, billing_timing, supply_amount, vat, billing_amount, payment_method, payment_date, contract_start_date, contract_end_date, status')
    .in('id', customer_ids)
    .is('deleted_at', null)

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })

  const customers = (customersData ?? []) as Array<{
    id: string
    customer_type: string | null
    billing_cycle: string | null
    billing_timing: 'prepaid' | 'postpaid' | null
    supply_amount: number | null
    vat: number | null
    billing_amount: number | null
    payment_method: string | null
    payment_date: number | null
    contract_start_date: string | null
    contract_end_date: string | null
    status: string | null
  }>

  const results: Array<{ customer_id: string; inserted: number; skipped: number }> = []
  let totalInserted = 0

  for (const customer of customers) {
    if (customer.status === 'paused') {
      results.push({ customer_id: customer.id, inserted: 0, skipped: 0 })
      continue
    }

    const amount = computeBillingAmountFromCustomer(customer)
    const timing = customer.billing_timing ?? 'prepaid'
    const schedule = generateBillingSchedule({
      serviceType:       customer.customer_type,
      billingCycle:      customer.billing_cycle,
      contractStartDate: customer.contract_start_date,
      contractEndDate:   customer.contract_end_date,
      paymentDay:        customer.payment_date,
      billingAmount:     amount,
      billingTiming:     timing,
    })

    if (schedule.length === 0) {
      results.push({ customer_id: customer.id, inserted: 0, skipped: 0 })
      continue
    }

    // regenerate=true 면 pending 레코드 먼저 삭제 후 전체 재생성
    if (regenerate) {
      await supabase
        .from('service_billings')
        .delete()
        .eq('customer_id', customer.id)
        .eq('status', 'pending')
    }

    const { data: existingRows } = await supabase
      .from('service_billings')
      .select('billing_period')
      .eq('customer_id', customer.id)

    const existingPeriods = new Set(
      (existingRows ?? []).map((r: { billing_period: string }) => r.billing_period)
    )
    const toInsert = schedule.filter(p => !existingPeriods.has(p.billing_period))
    const skipped  = schedule.length - toInsert.length

    if (toInsert.length === 0) {
      results.push({ customer_id: customer.id, inserted: 0, skipped })
      continue
    }

    const rows = toInsert.map(p => ({
      customer_id:    customer.id,
      billing_type:   p.billing_type,
      billing_period: p.billing_period,
      amount:         p.amount,
      due_date:       p.due_date,
      status:         'pending',
      service_type:   customer.customer_type,
      billing_timing: timing,
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
