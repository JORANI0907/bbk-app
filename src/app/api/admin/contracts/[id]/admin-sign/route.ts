import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSMS } from '@/lib/solapi'
import { sendSlack } from '@/lib/slack'

type RouteParams = { params: { id: string } }

// POST /api/admin/contracts/[id]/admin-sign — 관리자 최종 확인
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const supabase = createServiceClient()

  const { data: contract, error: fetchError } = await supabase
    .from('contracts')
    .select('id, signing_status, customer_phone, service_plan, customers(business_name, contact_name)')
    .eq('id', params.id)
    .single()

  if (fetchError || !contract) {
    return NextResponse.json({ success: false, error: '계약서를 찾을 수 없습니다.' }, { status: 404 })
  }

  if (contract.signing_status !== 'customer_signed') {
    return NextResponse.json(
      { success: false, error: '고객 서명이 완료된 계약서만 최종 확인할 수 있습니다.' },
      { status: 400 },
    )
  }

  const now = new Date().toISOString()

  const { error: updateError } = await supabase
    .from('contracts')
    .update({
      signing_status: 'completed',
      admin_signed_at: now,
    })
    .eq('id', params.id)

  if (updateError) {
    return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
  }

  // 고객에게 완료 SMS 발송
  const phone = contract.customer_phone as string | null
  const customer = contract.customers as { business_name?: string; contact_name?: string } | null
  const businessName = customer?.business_name ?? '고객'

  if (phone) {
    try {
      await sendSMS(
        phone,
        `[BBK 공간케어] ${businessName}님, 계약서 서명이 최종 완료되었습니다.\n계약 내용은 앱에서 확인하실 수 있습니다.`,
      )
    } catch {
      // SMS 실패는 무시 (계약은 이미 완료)
    }
  }

  // Slack 알림
  await sendSlack(
    `✅ *계약서 최종 완료* | ${businessName} | ${contract.service_plan as string ?? ''}`,
  )

  return NextResponse.json({ success: true, message: '계약서가 최종 확인되었습니다.' })
}
