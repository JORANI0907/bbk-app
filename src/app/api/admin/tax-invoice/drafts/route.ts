import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

function requireAdmin() {
  return getServerSession()?.role === 'admin'
}

const ALLOWED_FIELDS = [
  'supplier_id',
  'receiver_business_number', 'receiver_business_name', 'receiver_owner_name',
  'receiver_address', 'receiver_email', 'receiver_business_type', 'receiver_business_item',
  'items', 'invoice_kind', 'bill_receipt_type', 'written_date', 'notes',
] as const

// GET ?source=&source_id=  단건 조회
// GET (파라미터 없음)       전체 조회
export async function GET(request: NextRequest) {
  if (!requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const source = searchParams.get('source')
  const sourceId = searchParams.get('source_id')

  const supabase = createServiceClient()

  if (source && sourceId) {
    const { data, error } = await supabase
      .from('tax_invoice_drafts')
      .select('*')
      .eq('source', source)
      .eq('source_id', sourceId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ draft: data })
  }

  const { data, error } = await supabase.from('tax_invoice_drafts').select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ drafts: data ?? [] })
}

// POST — upsert (source+source_id unique)
export async function POST(request: NextRequest) {
  if (!requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const source = body.source as 'application' | 'billing' | undefined
  const sourceId = body.source_id as string | undefined
  if (!source || !sourceId) {
    return NextResponse.json({ error: 'source, source_id 필수' }, { status: 400 })
  }

  const patch: Record<string, unknown> = { source, source_id: sourceId }
  for (const f of ALLOWED_FIELDS) {
    if (f in body) patch[f] = body[f]
  }
  patch.updated_at = new Date().toISOString()

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('tax_invoice_drafts')
    .upsert(patch, { onConflict: 'source,source_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ draft: data })
}

// DELETE ?source=&source_id=  단건 삭제 (원본 복원)
export async function DELETE(request: NextRequest) {
  if (!requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const source = searchParams.get('source')
  const sourceId = searchParams.get('source_id')
  if (!source || !sourceId) {
    return NextResponse.json({ error: 'source, source_id 필수' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('tax_invoice_drafts')
    .delete()
    .eq('source', source)
    .eq('source_id', sourceId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
