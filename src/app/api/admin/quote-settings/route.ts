import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const DEFAULTS = {
  company_name:        'BBK 공간케어',
  company_ceo:         '박범건',
  company_biz_no:      '298-78-00455',
  company_phone:       '031-759-4877',
  company_address:     '경기도 성남시',
  valid_days:          5,
  seal_image_url:      null as string | null,
  bank_name:           '' as string,
  bank_account_number: '' as string,
  bank_account_holder: '' as string,
}

export async function GET() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('quote_settings')
    .select('*')
    .eq('id', 'default')
    .single()

  return NextResponse.json(data ?? DEFAULTS)
}

export async function PUT(req: Request) {
  const body = await req.json()
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('quote_settings')
    .upsert({
      id:                  'default',
      company_name:        body.company_name        ?? DEFAULTS.company_name,
      company_ceo:         body.company_ceo         ?? DEFAULTS.company_ceo,
      company_biz_no:      body.company_biz_no      ?? DEFAULTS.company_biz_no,
      company_phone:       body.company_phone       ?? DEFAULTS.company_phone,
      company_address:     body.company_address     ?? DEFAULTS.company_address,
      valid_days:          body.valid_days          ?? DEFAULTS.valid_days,
      bank_name:           body.bank_name           ?? DEFAULTS.bank_name,
      bank_account_number: body.bank_account_number ?? DEFAULTS.bank_account_number,
      bank_account_holder: body.bank_account_holder ?? DEFAULTS.bank_account_holder,
      updated_at:          new Date().toISOString(),
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
