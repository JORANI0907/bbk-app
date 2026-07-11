import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * 급여명세서 발행 이력 CRUD
 * GET    ?year_month=YYYY-MM        → 월별 전체 발행 이력
 * POST   { year_month, person_type, person_id, ... }  → 발행 저장
 * PATCH  { id, is_sent, sent_channel }                → 발송 상태 업데이트
 * DELETE ?id=xxx                                       → 발행 이력 삭제 (재발행 정리용)
 */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const yearMonth = searchParams.get('year_month')

    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json({ error: 'year_month (YYYY-MM)가 필요합니다.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('payroll_payslips')
      .select('*')
      .eq('year_month', yearMonth)
      .order('issued_at', { ascending: false })

    if (error) throw new Error(error.message)

    return NextResponse.json({ payslips: data ?? [] })
  } catch (err) {
    console.error('payslips 조회 실패:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '조회 실패' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      year_month,
      person_type,
      person_id,
      person_name,
      pay_date,
      file_url,
      file_name,
      gross_amount,
      deduction_amount,
      net_amount,
      tax_type,
    } = body

    if (!year_month || !/^\d{4}-\d{2}$/.test(year_month)) {
      return NextResponse.json({ error: 'year_month (YYYY-MM)가 필요합니다.' }, { status: 400 })
    }
    if (person_type !== 'user' && person_type !== 'worker') {
      return NextResponse.json({ error: 'person_type은 user 또는 worker 여야 합니다.' }, { status: 400 })
    }
    if (!person_id || !person_name) {
      return NextResponse.json({ error: 'person_id와 person_name이 필요합니다.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('payroll_payslips')
      .insert({
        year_month,
        person_type,
        person_id,
        person_name,
        pay_date: pay_date ?? null,
        file_url: file_url ?? null,
        file_name: file_name ?? null,
        gross_amount: gross_amount ?? 0,
        deduction_amount: deduction_amount ?? 0,
        net_amount: net_amount ?? 0,
        tax_type: tax_type ?? null,
      })
      .select()
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json({ payslip: data }, { status: 201 })
  } catch (err) {
    console.error('payslip 생성 실패:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '저장 실패' },
      { status: 500 },
    )
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, is_sent, sent_channel } = body

    if (!id) {
      return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (typeof is_sent === 'boolean') {
      updates.is_sent = is_sent
      updates.sent_at = is_sent ? new Date().toISOString() : null
    }
    if (sent_channel !== undefined) {
      updates.sent_channel = sent_channel
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '업데이트할 필드가 없습니다.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('payroll_payslips')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json({ payslip: data })
  } catch (err) {
    console.error('payslip 업데이트 실패:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '업데이트 실패' },
      { status: 500 },
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { error } = await supabase
      .from('payroll_payslips')
      .delete()
      .eq('id', id)

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('payslip 삭제 실패:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '삭제 실패' },
      { status: 500 },
    )
  }
}
