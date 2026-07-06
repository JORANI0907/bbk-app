import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { owner_name, business_name, phone, address, service_type, care_scope, request_notes, email } = body

    if (!owner_name || !phone || !address || !service_type) {
      return NextResponse.json({ error: '이름, 연락처, 주소, 서비스 유형은 필수입니다.' }, { status: 400 })
    }

    // 업체명이 폼에서 넘어오면 우선 사용, 없으면 owner_name으로 fallback (NOT NULL 제약)
    const resolvedBusinessName = typeof business_name === 'string' && business_name.trim()
      ? business_name.trim()
      : owner_name

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('service_applications')
      .insert({
        owner_name,
        business_name: resolvedBusinessName,
        phone,
        address,
        email: email || null,
        service_type,
        care_scope: care_scope || null,
        request_notes: request_notes || null,
        status: '신규',
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
      `• 접수시각: ${kstTime}`
    ).catch(() => {})

    return NextResponse.json({ success: true, id: data.id }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
