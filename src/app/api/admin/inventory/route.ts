import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { verifySession } from '@/lib/session'

function getAdminSession() {
  const cookieStore = cookies()
  const token = cookieStore.get('bbk_session')?.value
  const session = token ? verifySession(token) : null
  if (!session || session.role !== 'admin') return null
  return session
}

export async function GET() {
  const cookieStore = cookies()
  const token = cookieStore.get('bbk_session')?.value
  const session = token ? verifySession(token) : null
  if (!session) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .order('category')
    .order('item_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data })
}

export async function POST(request: NextRequest) {
  const session = getAdminSession()
  if (!session) {
    return NextResponse.json({ error: '관리자 권한 필요' }, { status: 403 })
  }

  const body = await request.json()
  const { category, item_name, current_qty, unit, min_qty, description, storage_location, notes } = body

  if (!category || !item_name || current_qty == null || !unit || min_qty == null) {
    return NextResponse.json({ error: '필수 항목을 입력해주세요' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Try with optional columns first, fall back without
  const insertData: Record<string, unknown> = {
    category,
    item_name,
    current_qty: Number(current_qty),
    unit,
    min_qty: Number(min_qty),
    last_updated: new Date().toISOString(),
  }

  try {
    insertData.description = description ?? null
    insertData.storage_location = storage_location ?? null
    insertData.notes = notes ?? null
    insertData.created_at = new Date().toISOString()

    const { data, error } = await supabase.from('inventory').insert(insertData).select().single()
    if (error) {
      // Column might not exist yet - try without optional columns
      if (error.message?.includes('column') || error.code === '42703') {
        const fallbackData = {
          category,
          item_name,
          current_qty: Number(current_qty),
          unit,
          min_qty: Number(min_qty),
          last_updated: new Date().toISOString(),
        }
        const { data: d2, error: e2 } = await supabase.from('inventory').insert(fallbackData).select().single()
        if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
        return NextResponse.json({ item: d2 }, { status: 201 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ item: data }, { status: 201 })
  } catch {
    return NextResponse.json({ error: '아이템 생성 실패' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = getAdminSession()
  if (!session) {
    return NextResponse.json({ error: '관리자 권한 필요' }, { status: 403 })
  }

  const body = await request.json()
  const { id, item_name, category, unit, min_qty, description, storage_location, notes } = body

  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  const supabase = createServiceClient()

  const updateData: Record<string, unknown> = {
    last_updated: new Date().toISOString(),
  }
  if (item_name !== undefined) updateData.item_name = item_name
  if (category !== undefined) updateData.category = category
  if (unit !== undefined) updateData.unit = unit
  if (min_qty !== undefined) updateData.min_qty = Number(min_qty)

  // Try with optional columns
  try {
    if (description !== undefined) updateData.description = description
    if (storage_location !== undefined) updateData.storage_location = storage_location
    if (notes !== undefined) updateData.notes = notes

    const { data, error } = await supabase.from('inventory').update(updateData).eq('id', id).select().single()
    if (error) {
      if (error.message?.includes('column') || error.code === '42703') {
        // Remove optional columns and retry
        const fallback = { ...updateData }
        delete fallback.description
        delete fallback.storage_location
        delete fallback.notes
        const { data: d2, error: e2 } = await supabase.from('inventory').update(fallback).eq('id', id).select().single()
        if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
        return NextResponse.json({ item: d2 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ item: data })
  } catch {
    return NextResponse.json({ error: '업데이트 실패' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const session = getAdminSession()
  if (!session) {
    return NextResponse.json({ error: '관리자 권한 필요' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('inventory').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
