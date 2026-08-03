import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * 명세서 취소 (DRAFT 삭제 또는 CONFIRMED → CANCELLED)
 * DELETE /api/admin/payroll/payslips/[id]/cancel
 */
export async function DELETE(
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

    if (existing.status === 'DRAFT') {
      // DRAFT는 완전 삭제
      const { error } = await supabase.from('payroll_payslips').delete().eq('id', params.id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ success: true, action: 'deleted' })
    }

    if (existing.status === 'CONFIRMED') {
      // 확정본은 삭제 대신 CANCELLED로 표시 (이력 보존)
      const { data, error } = await supabase
        .from('payroll_payslips')
        .update({ status: 'CANCELLED' })
        .eq('id', params.id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ success: true, action: 'cancelled', payslip: data })
    }

    return NextResponse.json({ error: '취소할 수 없는 상태입니다.' }, { status: 400 })
  } catch (err) {
    console.error('[payslips/cancel] 실패:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '취소 실패' },
      { status: 500 },
    )
  }
}
