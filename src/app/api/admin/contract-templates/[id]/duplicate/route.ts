import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

interface RouteParams {
  params: { id: string }
}

// POST /api/admin/contract-templates/[id]/duplicate — 템플릿 복제
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const supabase = createServiceClient()

  const { data: original, error: fetchError } = await supabase
    .from('contract_templates')
    .select('name, description, html_body, is_active, custom_vars, var_config')
    .eq('id', params.id)
    .single()

  if (fetchError) {
    const status = fetchError.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ success: false, error: fetchError.message }, { status })
  }

  const { data: created, error: insertError } = await supabase
    .from('contract_templates')
    .insert({
      ...original,
      name: `복사본 - ${original.name}`,
      is_active: false,
    })
    .select('id, name')
    .single()

  if (insertError) {
    return NextResponse.json({ success: false, error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: created })
}
