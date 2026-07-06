import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let query = supabase
    .from('events')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()

  const allowed = [
    'slug','title','subtitle','thumbnail_url','badge_text','badge_color',
    'start_date','end_date','status','description','benefits',
    'cta_label','cta_type','cta_value','accent_from','accent_to',
    'is_featured','sort_order',
  ]
  const insert: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) insert[key] = body[key]
  }

  if (!insert.title || !insert.slug) {
    return NextResponse.json({ error: '제목과 슬러그는 필수입니다.' }, { status: 400 })
  }

  const { data, error } = await supabase.from('events').insert(insert).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data }, { status: 201 })
}
