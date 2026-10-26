import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

interface SavedQuote {
  id: string
  label: string
  total_amount: number
  quote_no: string | null
  pdf_url: string | null
  sent_at: string | null
  created_at: string
  business_name?: string  // 견적 대상 업체(지점) — 비어있으면 신청서 값
}

interface FlatQuote extends SavedQuote {
  application_id: string
  owner_name: string
  business_name: string
  phone: string
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const page     = Math.max(1, parseInt(searchParams.get('page')  || '1'))
  const limit    = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '30')))
  const search   = searchParams.get('search')?.trim()   || ''
  const dateFrom = searchParams.get('dateFrom')?.trim() || ''
  const dateTo   = searchParams.get('dateTo')?.trim()   || ''

  const supabase = createServiceClient()

  let query = supabase
    .from('service_applications')
    .select('id, owner_name, business_name, phone, saved_quotes')
    .is('deleted_at', null)
    .not('saved_quotes', 'is', null)
    .not('saved_quotes', 'eq', '[]')

  if (search) {
    query = query.or(
      `owner_name.ilike.%${search}%,business_name.ilike.%${search}%,phone.ilike.%${search}%`
    )
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // JSONB 배열을 개별 아이템으로 펼치고 상위 신청서 정보 붙이기
  let all: FlatQuote[] = (data ?? []).flatMap(app => {
    const quotes = (app.saved_quotes ?? []) as SavedQuote[]
    return quotes.map(q => ({
      ...q,
      application_id: app.id,
      owner_name:    app.owner_name    || '',
      business_name: q.business_name || app.business_name || '',
      phone:         app.phone         || '',
    }))
  })

  // 날짜 필터 (ISO 문자열 prefix 비교)
  if (dateFrom) {
    all = all.filter(q => q.created_at >= dateFrom)
  }
  if (dateTo) {
    const end = dateTo + 'T23:59:59'
    all = all.filter(q => q.created_at <= end)
  }

  // 최신순 정렬
  all.sort((a, b) => b.created_at.localeCompare(a.created_at))

  const total  = all.length
  const offset = (page - 1) * limit
  const paged  = all.slice(offset, offset + limit)

  return NextResponse.json({ quotes: paged, total, page, limit })
}
