import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import type { CareManualSection } from '@/types/care-manual'

export const dynamic = 'force-dynamic'

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

    if (error || !data) return NextResponse.json({ sections: [], business_name: '', customer_type: '' })
    return NextResponse.json({
      sections: data.care_manual ?? [],
      business_name: data.business_name ?? '',
      customer_type: data.customer_type ?? '',
    })
  } catch {
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
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
      .select('care_manual')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      success: true,
      sections: updated?.care_manual ?? sections,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '저장 실패' },
      { status: 500 }
    )
  }
}
