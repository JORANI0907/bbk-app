import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'
import { findAutoLinkCustomerId } from '@/lib/customerAutoLink'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { owner_name, business_name, phone, phone_2, address, service_type, care_scope, request_notes, email, business_number } = body

    if (!owner_name || !phone || !address || !service_type) {
      return NextResponse.json({ error: '이름, 연락처, 주소, 서비스 유형은 필수입니다.' }, { status: 400 })
    }

    // 업체명이 폼에서 넘어오면 우선 사용, 없으면 owner_name으로 fallback (NOT NULL 제약)
    const resolvedBusinessName = typeof business_name === 'string' && business_name.trim()
      ? business_name.trim()
      : owner_name

    const supabase = createServiceClient()

    // Phase 27-Y: /apply/deepcare + /apply/endcare 폼에도 자동 매칭 적용.
    // 웹훅 라우트와 달리 business_number 는 폼에서 옵션 필드 — 있으면 함께 매칭, 없으면 phone 만으로.
    const autoLinkedCustomerId = await findAutoLinkCustomerId(supabase, phone, business_number)
    if (autoLinkedCustomerId) {
      console.log(`[apply] auto-link 성공: application → customer(${autoLinkedCustomerId})`)
    }

    const { data, error } = await supabase
      .from('service_applications')
      .insert({
        owner_name,
        business_name: resolvedBusinessName,
        phone,
        phone_2: (typeof phone_2 === 'string' && phone_2.trim()) ? phone_2.trim() : null,
        address,
        email: email || null,
        business_number: business_number || null,
        service_type,
        care_scope: care_scope || null,
        request_notes: request_notes || null,
        status: '신규',
        progress_status: '신청서작성', // Phase 8-C
        customer_id: autoLinkedCustomerId, // Phase 27-Y: 자동 매칭된 경우만 세팅
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const kstTime = new Date().toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
    sendSlack(
      `📋 *온라인 신청서 접수*\n` +
      `• 서비스: ${service_type}\n` +
      `• 이름: ${owner_name}\n` +
      `• 연락처: ${phone}\n` +
      `• 주소: ${address}\n` +
      (email ? `• 이메일: ${email}\n` : '') +
      (care_scope ? `• 내용: ${care_scope}\n` : '') +
      `• 접수시각: ${kstTime}\n` +
      (autoLinkedCustomerId ? `• 🔗 기존 고객 자동 연결 완료` : `• 🆕 신규 고객 (pending 검수 대상)`)
    ).catch(() => {})

    return NextResponse.json({ success: true, id: data.id }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
