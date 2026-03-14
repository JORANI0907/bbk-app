import { NextRequest, NextResponse } from 'next/server'
import { sendOTP } from '@/lib/solapi'
import { createServiceClient } from '@/lib/supabase/server'

const fmtDate = (d: string | null) => d ? d.slice(0, 10).replace(/-/g, '.') : '-'
const fmt = (n: number | null) => n == null ? '0' : n.toLocaleString('ko-KR')

const TEMPLATES: Record<string, (d: Record<string, string>) => string> = {
  '정기결제알림': (d) =>
    `[BBK 공간케어] ${d.name}님, ${d.business}의 ${d.cycle} 정기케어 결제일(${d.next_billing})이 다가왔습니다.\n금액: ${d.amount}원\n계좌: ${d.account}\n문의: 031-759-4877`,
  '정기방문알림': (d) =>
    `[BBK 공간케어] ${d.name}님, ${d.business}의 정기케어 방문 예정일(${d.next_visit})이 다가왔습니다.\n준비사항을 확인해주세요.\n문의: 031-759-4877`,
  '계약갱신알림': (d) =>
    `[BBK 공간케어] ${d.name}님, ${d.business}의 정기케어 계약이 ${d.contract_end}에 만료됩니다.\n갱신 관련 문의: 031-759-4877`,
  '건당결제알림': (d) =>
    `[BBK 공간케어] ${d.name}님, ${d.business} 정기엔드케어 이용 청구 안내드립니다.\n건당 단가: ${d.unit_price}원\n계좌: ${d.account}\n문의: 031-759-4877`,
  '방문견적알림': (d) =>
    `[BBK 공간케어] ${d.name}님, 방문 견적 일정을 안내드립니다.\n일시: ${d.next_visit}\n문의: 031-759-4877`,
  '작업완료알림': (d) =>
    `[BBK 공간케어] ${d.name}님, ${d.business} 케어가 완료되었습니다.\n이용해 주셔서 감사합니다.\n문의: 031-759-4877`,
}

export async function POST(request: NextRequest) {
  try {
    const { customer_id, type } = await request.json()
    if (!customer_id || !type) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customer_id)
      .single()

    if (!customer) {
      return NextResponse.json({ error: '고객을 찾을 수 없습니다.' }, { status: 404 })
    }

    const templateFn = TEMPLATES[type]
    if (!templateFn) {
      return NextResponse.json({ error: '알 수 없는 알림 유형입니다.' }, { status: 400 })
    }

    const message = templateFn({
      name: customer.contact_name ?? '',
      business: customer.business_name ?? '',
      cycle: customer.billing_cycle ?? '',
      amount: fmt(customer.billing_amount),
      unit_price: fmt(customer.unit_price),
      account: customer.account_number ?? '계좌 미등록',
      next_billing: fmtDate(customer.billing_next_date),
      next_visit: fmtDate(customer.next_visit_date),
      contract_end: fmtDate(customer.contract_end_date),
    })

    const phone = (customer.contact_phone ?? '').replace(/-/g, '')
    if (!phone) {
      return NextResponse.json({ error: '연락처가 없습니다.' }, { status: 400 })
    }

    await sendOTP(phone, message)
    return NextResponse.json({ success: true, message })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
