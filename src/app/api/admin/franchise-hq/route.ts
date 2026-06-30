import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'

/**
 * GET: 전체 본사 목록 (회원관리에서 user_id → brand_name 매핑용)
 */
export async function GET() {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('franchise_hq')
      .select('id, brand_name, logo_url, user_id, manager_name, manager_phone')
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ franchises: data ?? [] })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST: 본사 등록 (DB 메타정보만 생성 — 계정은 회원관리에서 별도 등록)
 */
export async function POST(request: NextRequest) {
  const session = getServerSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { brandName, logoUrl, managerName, managerPhone } = body as {
      brandName: string
      logoUrl?: string | null
      managerName?: string
      managerPhone?: string
    }

    if (!brandName?.trim()) {
      return NextResponse.json({ error: '브랜드명은 필수입니다.' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const normalizedPhone = managerPhone?.replace(/-/g, '').trim() || null

    const { data: newHq, error: hqError } = await supabase
      .from('franchise_hq')
      .insert({
        brand_name: brandName.trim(),
        logo_url: logoUrl?.trim() || null,
        manager_name: managerName?.trim() || null,
        manager_phone: normalizedPhone,
        user_id: null,
      })
      .select('id, brand_name, logo_url, manager_name, manager_phone')
      .single()

    if (hqError || !newHq) {
      return NextResponse.json({ error: hqError?.message ?? '본사 등록 실패' }, { status: 500 })
    }

    return NextResponse.json({ success: true, hq: newHq })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
