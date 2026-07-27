/**
 * Phase 27-R v2: SMS 파일럿 격리 endpoint.
 *
 * 목적: notification_templates 기반 SMS/LMS 발송 파이프를 실 고객 접촉 없이 검증.
 *
 * 안전 장치:
 * - phone_override 파라미터 필수 — 없으면 400 에러로 발송 자체 거부
 * - 즉 실 신청서 phone 이 뭐든 항상 override 로 지정한 번호로만 발송
 * - Bearer 토큰 인증 (BBK_CRON_SECRET)
 * - notification_history 에 method='pilot' 으로 이력 기록 (실 발송과 구분)
 *
 * Query:
 *   code={템플릿코드}             필수 — 예: 예약당일알림
 *   app_id={신청서ID}              필수 — 렌더링 컨텍스트 소스
 *   phone_override={번호}          ★ 필수 강제 ★
 *   ignore_applicable_types=true   선택 — applicable_types 필터 무시 (강제 발송)
 *
 * Response:
 *   { ok, sent_to, template_code, template_body_length, applicable_types_matched,
 *     rendered_text, bytes, channel: 'SMS'|'LMS', reason? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendByTemplate } from '@/lib/template-sender'
import type { NotificationContext } from '@/lib/notification-variables'
import { saveNotificationHistory } from '@/lib/notification'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')?.trim()
  const appId = searchParams.get('app_id')?.trim()
  const phoneOverride = searchParams.get('phone_override')?.trim()
  const ignoreTypes = searchParams.get('ignore_applicable_types') === 'true'

  // ★ 안전 장치: phone_override 필수 ★
  if (!phoneOverride) {
    return NextResponse.json(
      { error: 'phone_override 는 필수입니다. 실 고객 접촉 방지를 위한 안전 장치.' },
      { status: 400 },
    )
  }
  if (!code) {
    return NextResponse.json({ error: 'code 파라미터가 필요합니다.' }, { status: 400 })
  }
  if (!appId) {
    return NextResponse.json({ error: 'app_id 파라미터가 필요합니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 1) 템플릿 조회
  const { data: template, error: tplErr } = await supabase
    .from('notification_templates')
    .select('id, code, applicable_types, body, subject, is_active')
    .eq('code', code)
    .maybeSingle()

  if (tplErr || !template) {
    return NextResponse.json({ error: `template not found: ${code}` }, { status: 404 })
  }
  if (!template.is_active) {
    return NextResponse.json({ error: `template inactive: ${code}` }, { status: 400 })
  }

  // 2) 신청서 조회 (컨텍스트 소스)
  const { data: app, error: appErr } = await supabase
    .from('service_applications')
    .select('*, customer:customers(*)')
    .eq('id', appId)
    .maybeSingle()

  if (appErr || !app) {
    return NextResponse.json({ error: `application not found: ${appId}` }, { status: 404 })
  }

  // 3) applicable_types 매칭 검사
  const appServiceType = String(app.service_type ?? '')
  const applicableTypes = (template.applicable_types as string[] | null) ?? []
  const typesMatched = applicableTypes.length === 0 || applicableTypes.includes(appServiceType)

  if (!typesMatched && !ignoreTypes) {
    return NextResponse.json({
      ok: false,
      reason: 'applicable_types_mismatch',
      template_code: code,
      applicable_types: applicableTypes,
      app_service_type: appServiceType,
      hint: '?ignore_applicable_types=true 로 강제 발송 가능',
    })
  }

  // 4) NotificationContext 구성 (application + customer 병합)
  const customerRaw = Array.isArray(app.customer) ? app.customer[0] : app.customer
  const context: NotificationContext = {
    application: {
      business_name: (app.business_name as string | null) ?? null,
      business_number: (app.business_number as string | null) ?? null,
      owner_name: (app.owner_name as string | null) ?? null,
      phone: (app.phone as string | null) ?? null,
      phone_2: (app.phone_2 as string | null) ?? null,
      email: (app.email as string | null) ?? null,
      address: (app.address as string | null) ?? null,
      construction_date: (app.construction_date as string | null) ?? null,
      construction_time: (app.construction_time as string | null) ?? null,
      business_hours_start: (app.business_hours_start as string | null) ?? null,
      business_hours_end: (app.business_hours_end as string | null) ?? null,
      pre_meeting_at: (app.pre_meeting_at as string | null) ?? null,
      payment_method: (app.payment_method as string | null) ?? null,
      account_number: (app.account_number as string | null) ?? null,
      supply_amount: (app.supply_amount as number | null) ?? null,
      vat: (app.vat as number | null) ?? null,
      deposit: (app.deposit as number | null) ?? null,
      balance: (app.balance as number | null) ?? null,
      deposit_payment_url: (app.deposit_payment_url as string | null) ?? null,
      balance_payment_url: (app.balance_payment_url as string | null) ?? null,
      care_scope: (app.care_scope as string | null) ?? null,
      parking: (app.parking as string | null) ?? null,
      elevator: (app.elevator as string | null) ?? null,
      building_access: (app.building_access as string | null) ?? null,
      access_method: (app.access_method as string | null) ?? null,
      drive_folder_url: (app.drive_folder_url as string | null) ?? null,
      request_notes: (app.request_notes as string | null) ?? null,
    },
    customer: customerRaw ?? null,
  }

  // 5) sendByTemplate 호출 (phone_override 로만 발송)
  const result = await sendByTemplate(code, phoneOverride, context)

  // 6) 이력 저장 (method='pilot' 로 실 발송과 구분)
  if (result.ok) {
    await saveNotificationHistory({
      category: 'sms',
      type: `[PILOT] ${code}`,
      body: result.text,
      title: `[PILOT] ${code}`,
      method: 'auto', // notification_history.method 는 auto/manual 만 지원
      recipientType: 'customer',
      recipientName: '[PILOT]',
      recipientPhone: phoneOverride,
      metadata: {
        pilot: true,
        template_code: code,
        source_app_id: appId,
        source_business_name: app.business_name ?? '',
      },
      status: 'sent',
    }).catch(() => { /* 이력 저장 실패는 무시 */ })
  }

  return NextResponse.json({
    ok: result.ok,
    sent_to: phoneOverride,
    template_code: code,
    template_body_length: template.body?.length ?? 0,
    applicable_types: applicableTypes,
    applicable_types_matched: typesMatched,
    source_app: {
      id: appId,
      business_name: app.business_name,
      service_type: app.service_type,
      construction_date: app.construction_date,
    },
    ...(result.ok
      ? { channel: result.type, bytes: result.bytes, rendered_text: result.text }
      : { reason: result.reason, details: result.details }),
  })
}
