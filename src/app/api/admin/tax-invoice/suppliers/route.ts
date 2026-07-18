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

// GET /api/admin/tax-invoice/suppliers — 전체 목록
export async function GET() {
  if (!requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('tax_invoice_suppliers')
    .select('*')
    .order('is_default', { ascending: false })
    .order('label', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ suppliers: data ?? [] })
}

// POST /api/admin/tax-invoice/suppliers — 신규 생성
export async function POST(request: NextRequest) {
  if (!requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  for (const f of ALLOWED_FIELDS) {
    if (f in body) patch[f] = body[f]
  }

  // 필수 검증
  if (!patch.label || !patch.registration_number || !patch.company_name || !patch.representative) {
    return NextResponse.json(
      { error: '별명·사업자번호·상호·대표자는 필수입니다.' },
      { status: 400 },
    )
  }

  const supabase = createServiceClient()

  // is_default=true 로 만들면 기존 default 해제
  if (patch.is_default === true) {
    await supabase.from('tax_invoice_suppliers').update({ is_default: false }).eq('is_default', true)
  }

  const { data, error } = await supabase
    .from('tax_invoice_suppliers')
    .insert(patch)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ supplier: data })
}
