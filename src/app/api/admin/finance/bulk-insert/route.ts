import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { UNCLASSIFIED } from '@/lib/finance-types'

interface InsertItem {
  category: 'fixed' | 'variable'
  name: string
  amount: number
  note: string | null
  group_name?: string | null
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

    // 매핑 테이블 조회 → items 에 group_name 이 비어있으면 자동 세팅
    const { data: mappings } = await supabase
      .from('finance_type_mappings')
      .select('category, name, group_name')
    const mappingMap = new Map<string, string>()
    for (const m of mappings ?? []) {
      mappingMap.set(`${m.category}::${m.name}`, m.group_name)
    }
    const resolveGroup = (category: string, name: string, provided?: string | null) => {
      if (provided && provided.trim()) return provided
      return mappingMap.get(`${category}::${name}`) ?? UNCLASSIFIED
    }

    const records = items.map(item => ({
      year_month: month,
      category: item.category,
      name: item.name,
      amount: item.amount,
      note: item.note ?? null,
      group_name: resolveGroup(item.category, item.name, item.group_name),
    }))

    const { data, error } = await supabase
      .from('finance_records')
      .insert(records)
      .select()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // 사용자가 직접 지정한 group_name (미분류가 아님)은 매핑 학습에도 반영
    const mappingRows = items
      .filter(i => !!i.group_name && i.group_name !== UNCLASSIFIED)
      .map(i => ({
        category: i.category,
        name: i.name,
        group_name: i.group_name as string,
        updated_at: new Date().toISOString(),
      }))
    if (mappingRows.length > 0) {
      await supabase.from('finance_type_mappings').upsert(mappingRows, { onConflict: 'category,name' })
    }

    return NextResponse.json({ inserted: data.length }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '저장 실패' }, { status: 500 })
  }
}
