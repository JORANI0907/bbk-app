import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) return NextResponse.json({ event: null }, { status: 404 })
    return NextResponse.json({ event: data })
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
