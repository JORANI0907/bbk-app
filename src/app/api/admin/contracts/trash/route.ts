import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/admin/contracts/trash — 휴지통에 있는 계약서 목록
export async function GET() {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('contracts')
    .select('id, signing_status, subscription_plan, customer_phone, deleted_at, created_at, customers(business_name, contact_name)')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, contracts: data })
}
