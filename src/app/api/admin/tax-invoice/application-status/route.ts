import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

// PATCH /api/admin/tax-invoice/application-status
// 1회성케어 service_applications 결제완료/계산서발행완료 상태 수동 업데이트
export async function PATCH(request: NextRequest) {
  const session = getServerSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { application_id, payment_complete, tax_invoice_issued } = body as {
    application_id: string
    payment_complete?: boolean
    tax_invoice_issued?: boolean
  }

  if (!application_id) {
    return NextResponse.json({ error: 'application_id required' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}

  if (payment_complete !== undefined) {
    patch.status = payment_complete ? '결제완료' : '계약완료'
  }
  if (tax_invoice_issued !== undefined) {
    patch.tax_invoice_issued = tax_invoice_issued
    patch.tax_invoice_issued_at = tax_invoice_issued ? new Date().toISOString() : null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('service_applications')
    .update(patch)
    .eq('id', application_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
