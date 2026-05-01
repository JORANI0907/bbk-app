import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

interface InsertItem {
  category: 'fixed' | 'variable'
  name: string
  amount: number
  note: string | null
}

// POST /api/admin/finance/bulk-insert
export async function POST(request: NextRequest) {
  const supabase = createServiceClient()

  try {
    const body = await request.json()
    const { month, items }: { month: string; items: InsertItem[] } = body

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'month 파라미터가 필요합니다. (YYYY-MM)' }, { status: 400 })
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: '저장할 항목이 없습니다.' }, { status: 400 })
    }

    const records = items.map(item => ({
      year_month: month,
      category: item.category,
      name: item.name,
      amount: item.amount,
      note: item.note ?? null,
    }))

    const { data, error } = await supabase
      .from('finance_records')
      .insert(records)
      .select()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ inserted: data.length }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '저장 실패' }, { status: 500 })
  }
}
