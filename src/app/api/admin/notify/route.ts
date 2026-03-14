import { NextRequest, NextResponse } from 'next/server'
import { sendOTP } from '@/lib/solapi'
import { createServiceClient } from '@/lib/supabase/server'

const TEMPLATES: Record<string, (data: Record<string, string>) => string> = {
  '예약확정알림':    (d) => `[BBK 공간케어] ${d.name}님, ${d.business_name} 예약이 확정되었습니다.\n방문일시: ${d.date} ${d.time}\n문의: 031-759-4877`,
  '예약1일전알림':  (d) => `[BBK 공간케어] ${d.name}님, 내일 ${d.time}에 ${d.business_name} 방문 예정입니다.\n문의: 031-759-4877`,
  '예약당일알림':   (d) => `[BBK 공간케어] ${d.name}님, 오늘 ${d.time}에 방문 예정입니다.\n준비사항을 확인해주세요. 문의: 031-759-4877`,
  '작업완료알림':   (d) => `[BBK 공간케어] ${d.name}님, ${d.business_name} 케어가 완료되었습니다.\n이용해주셔서 감사합니다. 문의: 031-759-4877`,
  '결제알림':       (d) => `[BBK 공간케어] ${d.name}님, 잔금 ${d.balance}원 결제를 요청드립니다.\n계좌: ${d.account} 문의: 031-759-4877`,
  '결제완료알림':   (d) => `[BBK 공간케어] ${d.name}님, 결제가 완료되었습니다. 감사합니다.\n문의: 031-759-4877`,
  '계산서발행완료알림': (d) => `[BBK 공간케어] ${d.name}님, 세금계산서가 발행되었습니다.\n확인 후 문의사항은 031-759-4877로 연락주세요.`,
  '예약금환급완료알림': (d) => `[BBK 공간케어] ${d.name}님, 예약금 환급이 완료되었습니다.\n문의: 031-759-4877`,
  '예약취소알림':   (d) => `[BBK 공간케어] ${d.name}님, ${d.business_name} 예약이 취소되었습니다.\n문의: 031-759-4877`,
  'A/S방문알림':    (d) => `[BBK 공간케어] ${d.name}님, A/S 방문일시: ${d.date} ${d.time}\n문의: 031-759-4877`,
  '방문견적알림':   (d) => `[BBK 공간케어] ${d.name}님, 방문견적 일시: ${d.date} ${d.time}\n문의: 031-759-4877`,
}

export async function POST(request: NextRequest) {
  try {
    const { application_id, type } = await request.json()
    if (!application_id || !type) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: app } = await supabase
      .from('service_applications')
      .select('*')
      .eq('id', application_id)
      .single()

    if (!app) return NextResponse.json({ error: '신청서를 찾을 수 없습니다.' }, { status: 404 })

    const templateFn = TEMPLATES[type]
    if (!templateFn) return NextResponse.json({ error: '알 수 없는 알림 유형입니다.' }, { status: 400 })

    const message = templateFn({
      name: app.owner_name ?? '',
      business_name: app.business_name ?? '',
      date: app.submitted_at?.slice(0, 10) ?? '',
      time: app.business_hours_start ?? '',
      balance: String(app.balance ?? 0),
      account: app.account_number ?? '',
    })

    const phone = app.phone?.replace(/-/g, '') ?? ''
    if (!phone) return NextResponse.json({ error: '전화번호가 없습니다.' }, { status: 400 })

    await sendOTP(phone, message)

    return NextResponse.json({ success: true, message })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
