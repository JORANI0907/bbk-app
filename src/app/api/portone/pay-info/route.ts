import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const appId = searchParams.get('appId')
    if (!appId) return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })

    const supabase = createServiceClient()
    const { data: app } = await supabase
      .from('service_applications')
      .select(`
        owner_name, business_name, phone, email,
        deposit, supply_amount, vat, payment_method,
        virtual_account_number, virtual_account_bank, virtual_account_expired_at,
        deposit_paid_at, balance_paid_at
      `)
      .eq('id', appId)
      .is('deleted_at', null)
      .single()

    if (!app) return NextResponse.json({ error: '결제 정보를 찾을 수 없습니다.' }, { status: 404 })

    return NextResponse.json({ app })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
