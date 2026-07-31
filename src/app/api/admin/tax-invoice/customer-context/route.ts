import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

// GET /api/admin/tax-invoice/customer-context?customer_id=UUID&month=YYYY-MM
// 정기케어 고객의 계약 기준가 + 해당 월 일정 목록 반환
export async function GET(request: NextRequest) {
  const session = getServerSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const customer_id = searchParams.get('customer_id')
  const month = searchParams.get('month') // YYYY-MM

  if (!customer_id) {
    return NextResponse.json({ error: 'customer_id required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 최신 계약의 monthly_price 조회
  const { data: contractRow } = await supabase
    .from('contracts')
    .select('monthly_price, start_date')
    .eq('customer_id', customer_id)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  let contract: { monthly_price: number; supply_amount: number; vat: number } | null = null
  if (contractRow?.monthly_price) {
    const monthly_price = Number(contractRow.monthly_price)
    const supply_amount = Math.round(monthly_price / 1.1)
    const vat = monthly_price - supply_amount
    contract = { monthly_price, supply_amount, vat }
  }

  // 해당 월 service_schedules 조회
  let schedulesQ = supabase
    .from('service_schedules')
    .select('id, scheduled_date, payment_amount, status')
    .eq('customer_id', customer_id)
    .order('scheduled_date', { ascending: true })

  if (month) {
    const [y, mo] = month.split('-').map(Number)
    const lastDay = new Date(y, mo, 0).getDate()
    schedulesQ = schedulesQ
      .gte('scheduled_date', `${month}-01`)
      .lte('scheduled_date', `${month}-${String(lastDay).padStart(2, '0')}`)
  }

  const { data: schedules } = await schedulesQ

  return NextResponse.json({
    contract,
    schedules: (schedules ?? []).map(s => ({
      id: s.id as string,
      scheduled_date: s.scheduled_date as string,
      payment_amount: s.payment_amount != null ? Number(s.payment_amount) : null,
      status: s.status as string | null,
    })),
  })
}
