import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { verifySession } from '@/lib/session'

export async function POST(request: NextRequest) {
  const cookieStore = cookies()
  const token = cookieStore.get('bbk_session')?.value
  const session = token ? verifySession(token) : null

  if (!session) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  }

  if (session.role !== 'worker' && session.role !== 'admin') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const body = await request.json()
  const { inventory_id, change_type, quantity, note, photo_url } = body

  if (!inventory_id || !change_type || quantity == null) {
    return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
  }

  const validTypes = ['receive', 'return', 'use', 'adjust']
  if (!validTypes.includes(change_type)) {
    return NextResponse.json({ error: '잘못된 change_type' }, { status: 400 })
  }

  const qty = Number(quantity)
  if (isNaN(qty) || qty < 0) {
    return NextResponse.json({ error: '수량은 0 이상의 숫자여야 합니다 (0.1 단위)' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Fetch current item
  const { data: item, error: itemError } = await supabase
    .from('inventory')
    .select('id, current_qty')
    .eq('id', inventory_id)
    .single()

  if (itemError || !item) {
    return NextResponse.json({ error: '재고 아이템을 찾을 수 없습니다' }, { status: 404 })
  }

  // Calculate new quantity
  let newQty: number
  if (change_type === 'receive') {
    newQty = item.current_qty + qty
  } else if (change_type === 'return') {
    newQty = item.current_qty + qty
  } else if (change_type === 'use') {
    newQty = item.current_qty - qty
  } else {
    // adjust: set absolute value
    newQty = qty
  }

  if (newQty < 0) {
    return NextResponse.json({ error: `재고가 부족합니다 (현재: ${item.current_qty})` }, { status: 400 })
  }

  const now = new Date().toISOString()

  // Update inventory quantity
  const { error: updateError } = await supabase
    .from('inventory')
    .update({ current_qty: newQty, last_updated: now })
    .eq('id', inventory_id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Build log record - try with optional columns, fall back to JSON note
  const workerName = session.name ?? ''
  const workerId = session.userId ?? null

  // Try inserting with photo_url and worker_name columns
  const logDataFull: Record<string, unknown> = {
    inventory_id,
    worker_id: workerId,
    change_type,
    quantity: qty,
    created_at: now,
    photo_url: photo_url ?? null,
    worker_name: workerName,
  }

  // Build a combined note (JSON if photo or worker info, plain text otherwise)
  if (photo_url || workerName) {
    const noteObj: Record<string, string> = {}
    if (note) noteObj.text = note
    if (photo_url) noteObj.photo = photo_url
    if (workerName) noteObj.worker = workerName
    logDataFull.note = JSON.stringify(noteObj)
  } else {
    logDataFull.note = note ?? null
  }

  const { data: log, error: logError } = await supabase
    .from('inventory_logs')
    .insert(logDataFull)
    .select()
    .single()

  if (logError) {
    // Columns may not exist yet — fallback without photo_url and worker_name
    if (logError.message?.includes('column') || logError.code === '42703') {
      const noteObj: Record<string, string> = {}
      if (note) noteObj.text = note
      if (photo_url) noteObj.photo = photo_url
      if (workerName) noteObj.worker = workerName

      const noteStr = Object.keys(noteObj).length > 0 ? JSON.stringify(noteObj) : (note ?? null)

      const fallbackLog = {
        inventory_id,
        worker_id: workerId,
        change_type,
        quantity: qty,
        note: noteStr,
        created_at: now,
      }

      const { data: log2, error: logError2 } = await supabase
        .from('inventory_logs')
        .insert(fallbackLog)
        .select()
        .single()

      if (logError2) return NextResponse.json({ error: logError2.message }, { status: 500 })
      return NextResponse.json({ log: log2, new_qty: newQty })
    }

    return NextResponse.json({ error: logError.message }, { status: 500 })
  }

  return NextResponse.json({ log, new_qty: newQty })
}
