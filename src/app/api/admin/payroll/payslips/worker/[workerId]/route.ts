import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: { workerId: string } }
) {
  try {
    const { searchParams } = new URL(_req.url)
    const yearMonth = searchParams.get('year_month')
    const supabase = createServiceClient()

    let query = supabase
      .from('payroll_payslips')
      .select(
        'id, year_month, person_name, pay_date, gross_amount, deduction_amount, net_amount, status, confirmed_at, employment_type, created_at'
      )
      .eq('person_id', params.workerId)
      .not('status', 'is', null)
      .order('created_at', { ascending: false })

    if (yearMonth) query = query.eq('year_month', yearMonth)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    return NextResponse.json({ payslips: data ?? [] })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '조회 실패' },
      { status: 500 }
    )
  }
}
