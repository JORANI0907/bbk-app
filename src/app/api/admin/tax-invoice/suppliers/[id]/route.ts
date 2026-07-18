import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

function requireAdmin() {
  const session = getServerSession()
  return session?.role === 'admin'
}

const ALLOWED_FIELDS = [
  'label', 'registration_number', 'company_name', 'representative',
  'address', 'business_type', 'business_item', 'email', 'is_default',
] as const

interface RouteParams { params: Promise<{ id: string }> }

// PATCH — 부분 수정
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  for (const f of ALLOWED_FIELDS) {
    if (f in body) patch[f] = body[f]
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '수정할 필드가 없습니다.' }, { status: 400 })
  }
  patch.updated_at = new Date().toISOString()

  const supabase = createServiceClient()

  // is_default=true → 기존 default 해제
  if (patch.is_default === true) {
    await supabase.from('tax_invoice_suppliers').update({ is_default: false }).neq('id', id).eq('is_default', true)
  }

  const { data, error } = await supabase
    .from('tax_invoice_suppliers')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ supplier: data })
}

// DELETE
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  if (!requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createServiceClient()

  const { error } = await supabase.from('tax_invoice_suppliers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
