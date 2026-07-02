import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

const HQ_ALLOWED = ['brand_name', 'logo_url', 'manager_name', 'manager_phone', 'business_number'] as const
const USER_ALLOWED = ['name', 'phone', 'is_active'] as const

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const supabase = createServiceClient()

    const { data: hq } = await supabase
      .from('franchise_hq')
      .select('id, user_id')
      .eq('id', params.id)
      .single()
    if (!hq) {
      return NextResponse.json({ error: '본사를 찾을 수 없습니다.' }, { status: 404 })
    }

    const hqPatch: Record<string, unknown> = {}
    for (const key of HQ_ALLOWED) {
      if (body[key] !== undefined) hqPatch[key] = body[key]
    }
    if (Object.keys(hqPatch).length > 0) {
      const { error } = await supabase.from('franchise_hq').update(hqPatch).eq('id', params.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 계정 발급된 본사만 users 업데이트 (계정 미발급 본사는 user_id가 null)
    if (hq.user_id) {
      const userPatch: Record<string, unknown> = {}
      for (const key of USER_ALLOWED) {
        if (body[key] !== undefined) userPatch[key] = body[key]
      }
      if (Object.keys(userPatch).length > 0) {
        const { error } = await supabase.from('users').update(userPatch).eq('id', hq.user_id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  try {
    const supabase = createServiceClient()
    const { data: hq } = await supabase
      .from('franchise_hq')
      .select('user_id')
      .eq('id', params.id)
      .single()
    if (!hq) {
      return NextResponse.json({ error: '본사를 찾을 수 없습니다.' }, { status: 404 })
    }

    // 계정 발급된 본사: users 삭제 → franchise_hq + branch_map은 CASCADE로 자동 정리
    // 계정 미발급 본사: franchise_hq 직접 삭제 → branch_map은 CASCADE로 자동 정리
    if (hq.user_id) {
      const { error } = await supabase.from('users').delete().eq('id', hq.user_id)
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } else {
      const { error } = await supabase.from('franchise_hq').delete().eq('id', params.id)
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
