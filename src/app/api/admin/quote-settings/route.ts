import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const DEFAULTS = {
  company_name:    'BBK 공간케어',
  company_ceo:     '박범건',
  company_biz_no:  '298-78-00455',
  company_phone:   '031-759-4877',
  company_address: '경기도 성남시',
  valid_days:      5,
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
      id:              'default',
      company_name:    body.company_name    ?? DEFAULTS.company_name,
      company_ceo:     body.company_ceo     ?? DEFAULTS.company_ceo,
      company_biz_no:  body.company_biz_no  ?? DEFAULTS.company_biz_no,
      company_phone:   body.company_phone   ?? DEFAULTS.company_phone,
      company_address: body.company_address ?? DEFAULTS.company_address,
      valid_days:      body.valid_days      ?? DEFAULTS.valid_days,
      updated_at:      new Date().toISOString(),
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
