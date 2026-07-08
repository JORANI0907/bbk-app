import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// PATCH /api/admin/finance/bulk-group
// Body: { updates: [{ id, category, name, group_name }, ...] }
// - finance_records.group_name 을 각 id 별로 업데이트
// - 동시에 finance_type_mappings 에 (category, name) → group_name 을 upsert
//   → 다음부터 같은 이름이 들어오면 자동으로 이 group_name 이 세팅됨
export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()
  const updates = body?.updates as
    | Array<{ id: string; category: 'fixed' | 'variable'; name: string; group_name: string }>
    | undefined

  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: 'updates 배열이 필요합니다.' }, { status: 400 })
  }

  for (const u of updates) {
    if (!u.id || !u.category || !u.name || typeof u.group_name !== 'string') {
      return NextResponse.json({ error: '각 update 는 id, category, name, group_name 이 필요합니다.' }, { status: 400 })
    }
    if (u.category !== 'fixed' && u.category !== 'variable') {
      return NextResponse.json({ error: 'category 는 fixed | variable 이어야 합니다.' }, { status: 400 })
    }
  }

  const now = new Date().toISOString()

  // 1) finance_records.group_name 업데이트 (병렬)
  const recordUpdatePromises = updates.map(u =>
    supabase
      .from('finance_records')
      .update({ group_name: u.group_name, updated_at: now })
      .eq('id', u.id),
  )

  // 2) finance_type_mappings upsert (name 별로 중복 제거해서 한 번에)
  //    같은 요청에 (category, name) 이 중복되면 마지막 group_name 을 채택.
  const mappingByKey = new Map<string, { category: string; name: string; group_name: string }>()
  for (const u of updates) {
    mappingByKey.set(`${u.category}:${u.name}`, {
      category: u.category,
      name: u.name,
      group_name: u.group_name,
    })
  }
  const mappingRows = Array.from(mappingByKey.values()).map(m => ({
    ...m,
    updated_at: now,
  }))

  const [recordResults, mappingResult] = await Promise.all([
    Promise.all(recordUpdatePromises),
    supabase
      .from('finance_type_mappings')
      .upsert(mappingRows, { onConflict: 'category,name' }),
  ])

  const failed = recordResults.find(r => r.error)
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 })
  }
  if (mappingResult.error) {
    return NextResponse.json({ error: mappingResult.error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    updated_records: updates.length,
    upserted_mappings: mappingRows.length,
  })
}
