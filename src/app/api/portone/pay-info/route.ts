import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const appId  = searchParams.get('appId')
    const custId = searchParams.get('custId')

    if (!appId && !custId) {
      return NextResponse.json({ error: '필수 항목 누락 (appId 또는 custId)' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // ── custId 모드: customers 테이블 조회 ───────────────────────────
    if (custId) {
      const { data: customer } = await supabase
        .from('customers')
        .select(`
          id, contact_name, business_name, business_number,
          contact_phone, email, address,
          service_type, care_scope, space_size,
          access_method, building_access, elevator, parking,
          business_hours_start, business_hours_end,
          construction_date, construction_time, meeting_time,
          request_notes, customer_memo,
          deposit, supply_amount, vat,
          payment_method, payment_status_detail,
          deposit_paid_at, balance_paid_at
        `)
        .eq('id', custId)
        .is('deleted_at', null)
        .single()

      if (!customer) {
        return NextResponse.json({ error: '고객 정보를 찾을 수 없습니다.' }, { status: 404 })
      }

      // pay 페이지 AppInfo 타입에 맞게 필드 정규화
      const app = {
        ...customer,
        id: customer.id,
        owner_name:     customer.contact_name,
        phone:          customer.contact_phone,
        payment_status: customer.payment_status_detail ?? null,
        // 가상계좌 정보는 customers 테이블에 없음 — undefined로 전달
        virtual_account_number:    undefined,
        virtual_account_bank:      undefined,
        virtual_account_expired_at: undefined,
      }

      return NextResponse.json({ app })
    }

    // ── appId 모드: service_applications 테이블 조회 ──────────────────
    const { data: app } = await supabase
      .from('service_applications')
      .select(`
        id, owner_name, business_name, business_number, phone, phone_2, email,
        address, service_type, care_scope, space_size,
        access_method, building_access, elevator, parking,
        business_hours_start, business_hours_end,
        construction_date, construction_time, meeting_time,
        request_notes, customer_memo,
        deposit, supply_amount, vat, payment_method, payment_status,
        virtual_account_number, virtual_account_bank, virtual_account_expired_at,
        deposit_paid_at, balance_paid_at
      `)
      .eq('id', appId!)
      .is('deleted_at', null)
      .single()

    if (!app) return NextResponse.json({ error: '결제 정보를 찾을 수 없습니다.' }, { status: 404 })

    return NextResponse.json({ app })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
