import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

export async function GET(request: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'admin')
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') // YYYY-MM

  const supabase = createServiceClient()

  let query = supabase
    .from('invoice_logs')
    .select('*')
    .order('issued_at', { ascending: false })

  if (month) {
    const start = `${month}-01T00:00:00.000Z`
    const [year, mon] = month.split('-').map(Number)
    const nextYear = mon === 12 ? year + 1 : year
    const nextMon = mon === 12 ? 1 : mon + 1
    const end = `${nextYear}-${String(nextMon).padStart(2, '0')}-01T00:00:00.000Z`
    query = query.gte('issued_at', start).lt('issued_at', end)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoices: data ?? [] })
}

export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'admin')
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const { issued_at, count, file_url, notes, application_ids } = body

  if (!issued_at || count == null)
    return NextResponse.json({ error: '발행일과 건수는 필수입니다.' }, { status: 400 })

  if (typeof count !== 'number' || count < 1)
    return NextResponse.json({ error: '건수는 1 이상이어야 합니다.' }, { status: 400 })

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('invoice_logs')
    .insert({
      issued_at,
      count,
      file_url: file_url || null,
      notes: notes || null,
      application_ids: application_ids || [],
      issued_by: session.userId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoice: data })
}
