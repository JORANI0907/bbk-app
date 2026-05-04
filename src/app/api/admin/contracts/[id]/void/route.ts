import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'
import { sendSMS } from '@/lib/solapi'

type RouteParams = { params: { id: string } }

// POST /api/admin/contracts/[id]/void — 계약서 파기
export async function POST(request: NextRequest, { params }: RouteParams) {
  const supabase = createServiceClient()

  const { data: contract, error: fetchError } = await supabase
    .from('contracts')
    .select('id, signing_status, subscription_plan, customer_phone, customers(business_name)')
    .eq('id', params.id)
    .single()

  if (fetchError || !contract) {
    return NextResponse.json({ success: false, error: '계약서를 찾을 수 없습니다.' }, { status: 404 })
  }

  if (contract.signing_status === 'voided') {
    return NextResponse.json({ success: false, error: '이미 파기된 계약서입니다.' }, { status: 409 })
  }

  let body: { reason?: string }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const reason = body.reason?.trim() ?? ''
  if (!reason) {
    return NextResponse.json({ success: false, error: '파기 사유를 입력해주세요.' }, { status: 400 })
  }

  const { error: updateError } = await supabase
    .from('contracts')
    .update({
      signing_status: 'voided',
      voided_at: new Date().toISOString(),
      void_reason: reason,
    })
    .eq('id', params.id)

  if (updateError) {
    return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
  }

  const customer = contract.customers as { business_name?: string } | null
  const businessName = customer?.business_name ?? '고객'
  const phone = contract.customer_phone as string | null

  if (phone) {
    try {
      await sendSMS(
        phone,
        `[BBK 공간케어] ${businessName}님, 계약서가 파기되었습니다.\n사유: ${reason}\n문의: 031-759-4877`,
      )
    } catch {
      // SMS 실패는 무시
    }
  }

  await sendSlack(`🚫 *계약서 파기* | ${businessName} | 사유: ${reason}`)

  return NextResponse.json({ success: true, message: '계약서가 파기되었습니다.' })
}
