import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('slug', params.slug)
    .single()

  if (error || !data) return NextResponse.json({ error: '이벤트를 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ event: data })
}

export async function PATCH(request: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = createServiceClient()
  const body = await request.json()

  const allowed = [
    'slug','title','subtitle','thumbnail_url','badge_text','badge_color',
    'start_date','end_date','status','description','benefits',
    'cta_label','cta_type','cta_value','accent_from','accent_to',
    'is_featured','sort_order',
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const { error } = await supabase.from('events').update(updates).eq('slug', params.slug)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = createServiceClient()
  const { error } = await supabase.from('events').delete().eq('slug', params.slug)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
