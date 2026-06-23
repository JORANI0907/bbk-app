import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'


export async function GET() {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('notification_rules')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data ?? [] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

const ALLOWED_FIELDS = [
  'channel_alimtalk',
  'channel_sms',
  'channel_push',
  'channel_in_app',
  'notify_admin',
  'notify_customer',
  'notify_worker',
  'is_active',
] as const

type AllowedField = typeof ALLOWED_FIELDS[number]

interface PatchBody {
  id: string
  field: string
  value: boolean
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as PatchBody
    const { id, field, value } = body

    if (!id || !field) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    if (!ALLOWED_FIELDS.includes(field as AllowedField)) {
      return NextResponse.json({ error: '허용되지 않은 필드입니다.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { error } = await supabase
      .from('notification_rules')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
