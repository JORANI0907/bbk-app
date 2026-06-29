import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import type { CareManualSection } from '@/types/care-manual'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// 브라우저 HTTP cache 완전 차단을 위한 공통 헤더 — force-dynamic만으론 부족
const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
} as const

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('customers')
      .select('care_manual, business_name, customer_type')
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { sections: [], business_name: '', customer_type: '' },
        { headers: NO_CACHE_HEADERS }
      )
    }
    return NextResponse.json(
      {
        sections: data.care_manual ?? [],
        business_name: data.business_name ?? '',
        customer_type: data.customer_type ?? '',
      },
      { headers: NO_CACHE_HEADERS }
    )
  } catch {
    return NextResponse.json({ error: '조회 실패' }, { status: 500, headers: NO_CACHE_HEADERS })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getServerSession()
    if (!session) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    }
    if (session.role !== 'admin') {
      return NextResponse.json(
        { error: `권한 부족 (현재 권한: ${session.role}, 필요: admin)` },
        { status: 403 }
      )
    }

    const { id } = await params
    const { sections } = await req.json() as { sections: CareManualSection[] }
    if (!Array.isArray(sections)) {
      return NextResponse.json({ error: '잘못된 데이터 형식' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: updated, error } = await supabase
      .from('customers')
      .update({ care_manual: sections })
      .eq('id', id)
      .select('id, business_name, care_manual')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!updated || updated.length === 0) {
      return NextResponse.json(
        { error: `customer not found (id=${id})` },
        { status: 404 }
      )
    }
    const savedSections = updated[0]?.care_manual ?? sections
    return NextResponse.json({
      success: true,
      customer_id: updated[0]?.id,
      business_name: updated[0]?.business_name,
      sections: savedSections,
      sections_count: Array.isArray(savedSections) ? savedSections.length : 0,
    }, { headers: NO_CACHE_HEADERS })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '저장 실패' },
      { status: 500, headers: NO_CACHE_HEADERS }
    )
  }
}
