import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * DRAFT → CONFIRMED 전환
 * PATCH /api/admin/payroll/payslips/[id]/confirm
 * 확정 후에는 수정 불가 (취소 후 재생성)
 */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createServiceClient()

    const { data: existing, error: fetchErr } = await supabase
      .from('payroll_payslips')
      .select('id, status')
      .eq('id', params.id)
      .single()

    if (fetchErr || !existing) {
      return NextResponse.json({ error: '명세서를 찾을 수 없습니다.' }, { status: 404 })
    }
    if (existing.status === 'CONFIRMED') {
      return NextResponse.json({ error: '이미 확정된 명세서입니다.' }, { status: 409 })
    }
    if (existing.status !== 'DRAFT') {
      return NextResponse.json({ error: 'DRAFT 상태의 명세서만 확정할 수 있습니다.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('payroll_payslips')
      .update({ status: 'CONFIRMED', confirmed_at: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true, payslip: data })
  } catch (err) {
    console.error('[payslips/confirm] 실패:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '확정 실패' },
      { status: 500 },
    )
  }
}
