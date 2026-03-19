import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('notices')
    .select('*')
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notices: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'admin')
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await req.json()
  const { title, content, type, priority, pinned, event_date } = body

  if (!title?.trim() || !content?.trim())
    return NextResponse.json({ error: '제목과 내용을 입력하세요.' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('notices')
    .insert({
      title: title.trim(),
      content: content.trim(),
      type: type ?? 'notice',
      priority: priority ?? 'normal',
      pinned: pinned ?? false,
      event_date: event_date || null,
      author_id: session.userId,
      author_name: session.name,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notice: data })
}

export async function PATCH(req: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'admin')
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('notices')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notice: data })
}

export async function DELETE(req: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'admin')
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('notices').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
