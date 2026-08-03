import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { DEFAULT_INSURANCE_RATES, type InsuranceRates } from '@/app/admin/payroll/types'

export async function GET() {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('payroll_settings')
      .select('insurance_rates')
      .eq('id', 'default')
      .single()

    if (error || !data) {
      return NextResponse.json({ rates: DEFAULT_INSURANCE_RATES })
    }
    return NextResponse.json({ rates: { ...DEFAULT_INSURANCE_RATES, ...(data.insurance_rates as Partial<InsuranceRates>) } })
  } catch {
    return NextResponse.json({ rates: DEFAULT_INSURANCE_RATES })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const rates: Partial<InsuranceRates> = {}

    const fields: (keyof InsuranceRates)[] = [
      'nationalPension', 'healthInsurance', 'longtermCare', 'employmentInsurance', 'residentTax',
    ]
    for (const f of fields) {
      if (typeof body[f] === 'number' && body[f] >= 0 && body[f] <= 1) {
        rates[f] = body[f]
      }
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('payroll_settings')
      .upsert({ id: 'default', insurance_rates: rates, updated_at: new Date().toISOString() })
      .select('insurance_rates')
      .single()

    if (error) throw error
    return NextResponse.json({ rates: { ...DEFAULT_INSURANCE_RATES, ...(data.insurance_rates as Partial<InsuranceRates>) } })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '저장 실패' }, { status: 500 })
  }
}
