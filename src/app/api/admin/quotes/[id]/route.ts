import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

interface QuoteItem {
  name: string
  qty: number
  unit_price: number
  subtotal: number
}

interface QuoteDraftBody {
  quote_items?: QuoteItem[]
  quote_notes?: string
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body: QuoteDraftBody = await req.json()

  try {
    const supabase = createServiceClient()
    const patch: Record<string, unknown> = {}
    if (body.quote_items !== undefined) patch.quote_items = body.quote_items
    if (body.quote_notes !== undefined) patch.quote_notes = body.quote_notes

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: true })
    }

    const { error } = await supabase
      .from('service_applications')
      .update(patch)
      .eq('id', id)

    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '저장 실패' }, { status: 500 })
  }
}
