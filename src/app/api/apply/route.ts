import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'
import { findOrCreateCustomer } from '@/lib/customerAutoLink'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { owner_name, business_name, phone, phone_2, address, service_type, care_scope, request_notes, email, business_number, acquisition_source } = body

    if (!owner_name || !phone || !address || !service_type) {
      return NextResponse.json({ error: '이름, 연락처, 주소, 서비스 유형은 필수입니다.' }, { status: 400 })
    }

    // 유입 채널 화이트리스트 검증 (알 수 없는 값은 null 저장, 오염 방지)
    const ACQ_SOURCES = ['soomgo', 'naver', 'kakao', 'instagram', 'danggeun', 'offline', 'direct', 'etc']
    const normalizedSource = typeof acquisition_source === 'string' && ACQ_SOURCES.includes(acquisition_source)
      ? acquisition_source
      : null

    // 업체명이 폼에서 넘어오면 우선 사용, 없으면 owner_name으로 fallback (NOT NULL 제약)
    const resolvedBusinessName = typeof business_name === 'string' && business_name.trim()
      ? business_name.trim()
      : owner_name

    const supabase = createServiceClient()

    // Phase 27-AD: 자동 매칭 + 자동 승격 (pending 개념 제거).
    // 매칭 성공 시 연결 · 실패 시 customer 자동 생성. 두 경우 모두 customer_id 채워짐.
    const { customerId: autoLinkedCustomerId, created: autoCreated } = await findOrCreateCustomer(supabase, {
      business_name: resolvedBusinessName,
      owner_name,
      phone,
      phone_2: (typeof phone_2 === 'string' && phone_2.trim()) ? phone_2.trim() : null,
      email,
      address,
      business_number,
      care_scope,
      request_notes,
      service_type,
    })
    if (autoLinkedCustomerId) {
      console.log(`[apply] customer ${autoCreated ? '자동 생성' : '자동 연결'}: ${autoLinkedCustomerId}`)
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
        acquisition_source: normalizedSource, // Batch A-2: 유입 채널
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
      (autoLinkedCustomerId
        ? (autoCreated ? `• 🆕 신규 고객 자동 등록 완료` : `• 🔗 기존 고객 자동 연결 완료`)
        : `• ⚠️ 고객 자동 승격 실패 (pending 상태 · 수동 검수 필요)`)
    ).catch(() => {})

    return NextResponse.json({ success: true, id: data.id }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
