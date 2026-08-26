/**
 * Batch B-3: 고객 클레임 접수 API
 *
 * POST /api/customer/claims
 *   body: { phone, otp, category, content, is_rework? }
 *   - OTP 검증 통과 시 claims INSERT
 *   - customers 자동 매칭으로 customer_id/business_name 채움
 *   - Slack 알림 즉시 발송
 *   - 응답: 매칭된 이름/업체명 (성공 페이지 표시용)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'
import { otpStore } from '@/lib/otp-store'

const VALID_CATEGORIES = ['청소 미흡', '파손·훼손', '시간 지연', '작업자 태도', '기타'] as const

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone, otp, category, content } = body
    const isRework = !!body.is_rework

    if (!phone || !otp) {
      return NextResponse.json({ error: '연락처와 인증번호가 필요합니다.' }, { status: 400 })
    }
    if (!category || !(VALID_CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ error: '카테고리를 선택해주세요.' }, { status: 400 })
    }
    if (!content || typeof content !== 'string' || content.trim().length < 5) {
      return NextResponse.json({ error: '세부 내용을 5자 이상 입력해주세요.' }, { status: 400 })
    }

    const normalizedPhone = String(phone).replace(/-/g, '')

    // OTP 검증 (성공 시 store에서 자동 삭제 → 일회용)
    const verify = otpStore.verify(normalizedPhone, String(otp).trim())
    if (!verify.success) {
      return NextResponse.json({ error: verify.error ?? '인증 실패' }, { status: 401 })
    }

    // customer 재조회 (send-otp 시점 이후 상태 변화 방어)
    const supabase = createServiceClient()
    const { data: customer } = await supabase
      .from('customers')
      .select('id, business_name, contact_name')
      .or(`contact_phone.eq.${normalizedPhone},contact_phone.eq.${phone}`)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (!customer) {
      return NextResponse.json({ error: '고객 정보를 찾을 수 없습니다.' }, { status: 404 })
    }

    // claims INSERT
    const { data: claim, error } = await supabase
      .from('claims')
      .insert({
        customer_id: customer.id,
        occurred_at: new Date().toISOString(),
        content: content.trim(),
        category,
        is_rework: isRework,
        reporter_phone: normalizedPhone,
        reporter_name: customer.contact_name ?? null,
        business_name: customer.business_name ?? null,
        source: 'customer_form',
      })
      .select('id')
      .single()

    if (error) {
      console.error('[claims] insert 실패:', error.message)
      return NextResponse.json({ error: '접수 저장 실패' }, { status: 500 })
    }

    // Slack 즉시 알림 (심각도 높음)
    const kstTime = new Date().toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
    sendSlack(
      `🚨 *새 클레임 접수 (고객 자율)*\n` +
      `• 업체: ${customer.business_name ?? '-'}\n` +
      `• 담당자: ${customer.contact_name ?? '-'}\n` +
      `• 연락처: ${normalizedPhone}\n` +
      `• 카테고리: ${category}\n` +
      `• 재작업 요청: ${isRework ? '✅' : '❌'}\n` +
      `• 내용: ${content.trim().slice(0, 200)}${content.length > 200 ? '...' : ''}\n` +
      `• 접수시각: ${kstTime}`
    ).catch(() => {})

    return NextResponse.json({
      success: true,
      claim_id: claim.id,
      customer_name: customer.contact_name,
      business_name: customer.business_name,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[claims] 오류:', message)
    return NextResponse.json({ error: `접수 실패: ${message}` }, { status: 500 })
  }
}
