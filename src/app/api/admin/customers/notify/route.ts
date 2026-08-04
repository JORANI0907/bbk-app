import { NextRequest, NextResponse } from 'next/server'
import { sendByTemplate } from '@/lib/template-sender'
import type { NotificationContext } from '@/lib/notification-variables'
import { createServiceClient } from '@/lib/supabase/server'
import { saveNotificationHistory } from '@/lib/notification'
import { sendSlack } from '@/lib/slack'

// ─── 알림 발송 후 업데이트할 pipeline_status ──────────────────────
const NOTIFY_PIPELINE_STATUS: Record<string, string> = {
  '방문견적알림': 'quote_sent',
  '정기방문알림': 'service_scheduled',
  '작업완료알림': 'service_done',
  '정기결제알림': 'payment_done',
  '건당결제알림': 'payment_done',
  '계약갱신알림': 'renewal_pending',
  '계정안내알림': 'subscription_active',
}

// ─── SMS 폴백 텍스트 ───────────────────────────────────────────────
function buildFallback(type: string, customer: Record<string, unknown>): string {
  const name    = String(customer.contact_name ?? '')
  const bizName = String(customer.business_name ?? '')
  const map: Record<string, string> = {
    '정기결제알림': `[BBK 공간케어] ${name}님, ${bizName} 정기케어 결제일이 다가왔습니다. 문의: 010-5434-4877`,
    '정기결제알림(현금)': `[BBK 공간케어] ${name}님, ${bizName} 정기케어 현금 결제일이 다가왔습니다. 문의: 010-5434-4877`,
    '정기결제알림(카드)': `[BBK 공간케어] ${name}님, ${bizName} 정기케어 카드 결제일이 다가왔습니다. 문의: 010-5434-4877`,
    '정기방문알림': `[BBK 공간케어] ${name}님, ${bizName} 정기케어 방문 예정일이 다가왔습니다. 문의: 010-5434-4877`,
    '계약갱신알림': `[BBK 공간케어] ${name}님, ${bizName} 계약 만료가 다가왔습니다. 갱신 문의: 010-5434-4877`,
    '건당결제알림': `[BBK 공간케어] ${name}님, ${bizName} 건당 서비스 결제를 안내드립니다. 문의: 010-5434-4877`,
    '방문견적알림': `[BBK 공간케어] ${name}님, 방문 견적 일정을 안내드립니다. 문의: 010-5434-4877`,
    '작업완료알림': `[BBK 공간케어] ${name}님, ${bizName} 케어가 완료되었습니다. 감사합니다.`,
    '작업완료알림(현금)':         `[BBK 공간케어] ${name}님, 케어가 완료되었습니다. 감사합니다.`,
    '작업완료알림(카드,플렛폼)':  `[BBK 공간케어] ${name}님, 케어가 완료되었습니다. 감사합니다.`,
    '작업완료알림(정기엔드케어)': `[BBK 공간케어] ${name}님, 오늘 진행한 청소 작업이 완료되었습니다. 감사합니다.`,
    '계정안내알림': `[BBK 공간케어] ${name}님, 고객 포털 계정 정보를 안내드립니다. 문의: 010-5434-4877`,
    '예약확정알림': `[BBK 공간케어] ${name}님, ${bizName} 예약이 확정되었습니다.`,
    '예약1일전알림': `[BBK 공간케어] ${name}님, 내일 ${bizName} 방문 예정입니다.`,
    '예약당일알림': `[BBK 공간케어] ${name}님, 오늘 방문 예정입니다. 준비 확인 부탁드립니다.`,
    '결제알림':               `[BBK 공간케어] ${name}님, 잔금 결제를 요청드립니다.`,
    '결제알림(현금)':         `[BBK 공간케어] ${name}님, 잔금 결제를 요청드립니다.`,
    '결제알림(카드,플렛폼)':  `[BBK 공간케어] ${name}님, 잔금 결제를 요청드립니다.`,
    '결제완료알림':       `[BBK 공간케어] ${name}님, 결제가 완료되었습니다. 감사합니다.`,
    '결제완료알림(잔금)': `[BBK 공간케어] ${name}님, 잔금 결제가 완료되었습니다. 감사합니다.`,
    '계산서발행완료알림': `[BBK 공간케어] ${name}님, 세금계산서가 발행되었습니다.`,
    '예약금 입금완료 알림': `[BBK 공간케어] ${name}님, 예약금 입금이 확인되었습니다. (${bizName})`,
    '예약금환급완료알림': `[BBK 공간케어] ${name}님, 예약금 환급이 완료되었습니다.`,
    '예약취소알림': `[BBK 공간케어] ${name}님, 예약이 취소되었습니다.`,
    'A/S방문알림':  `[BBK 공간케어] ${name}님, A/S 방문 일정을 안내드립니다.`,
  }
  return map[type] ?? `[BBK 공간케어] ${name}님께 알림을 발송합니다.`
}

// ─── notification_log 항목 타입 ────────────────────────────────────
interface NotificationLogEntry {
  type: string
  sent_at: string
  phone: string
  method: 'auto' | 'manual'
  channel?: 'sms' | 'lms'
}

// ─── 핸들러 ──────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      customer_id: string
      type: string
      method?: 'auto' | 'manual'
      drive_url?: string
      amount?: string
      visit_date?: string
      visit_time?: string
      login_id?: string
      login_pw?: string
    }
    const { customer_id, type, method = 'manual' } = body

    if (!customer_id || !type) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 게이팅: notification_templates에 code로 등록된 활성 템플릿이어야 발송 가능
    // Phase 27-AR: linked_progress_status / linked_payment_status 도 함께 조회 → 발송 성공 시 customer 자동 갱신.
    const { data: dbTpl } = await supabase
      .from('notification_templates')
      .select('id, is_active, linked_progress_status, linked_payment_status')
      .eq('code', type)
      .maybeSingle()
    const hasDbTemplate = !!dbTpl && dbTpl.is_active !== false
    const linkedProgress: string | null = (dbTpl?.linked_progress_status as string | null) ?? null
    const linkedPayment: string | null = (dbTpl?.linked_payment_status as string | null) ?? null
    if (!hasDbTemplate) {
      return NextResponse.json({ error: `알 수 없는 알림 유형입니다: ${type}` }, { status: 400 })
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customer_id)
      .is('deleted_at', null)
      .single()

    if (!customer) {
      return NextResponse.json({ error: '고객을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 발송 대상: phone_notify_1/2 규칙 (기본값 true, 명시적 false만 제외)
    const phone = String(customer.contact_phone ?? '').replace(/-/g, '')
    const phone2 = String(customer.contact_phone_2 ?? '').replace(/-/g, '')
    const notify1 = customer.phone_notify_1 !== false
    const notify2 = customer.phone_notify_2 === true // 추가번호는 기본 OFF

    const targets: string[] = []
    if (notify1 && phone) targets.push(phone)
    if (notify2 && phone2) targets.push(phone2)

    if (targets.length === 0) {
      return NextResponse.json({ error: '발송 가능한 전화번호가 없습니다.' }, { status: 400 })
    }

    const fallbackText = buildFallback(type, customer as Record<string, unknown>)

    // 번호별 SMS 발송 (sendByTemplate 단독)
    const sendErrors: string[] = []
    const channelsUsed: Array<'sms' | 'lms'> = []
    for (const target of targets) {
      const smsResult = await sendByTemplate(type, target, {
        customer: customer as NotificationContext['customer'],
      })
      if (smsResult.ok) {
        channelsUsed.push(smsResult.type === 'LMS' ? 'lms' : 'sms')
      } else {
        sendErrors.push(`${target}: ${smsResult.reason}${smsResult.details ? ` (${smsResult.details})` : ''}`)
      }
    }
    if (sendErrors.length === targets.length) {
      return NextResponse.json({ error: sendErrors.join(' / ') }, { status: 500 })
    }

    const nowIso = new Date().toISOString()
    const sentPhoneRecord = targets.join(',')

    // ── notification_log append ──────────────────────────────────
    const existingLog: NotificationLogEntry[] = Array.isArray(customer.notification_log)
      ? (customer.notification_log as NotificationLogEntry[])
      : []
    const primaryChannel: 'sms' | 'lms' = channelsUsed[0] ?? 'sms'
    const newEntry: NotificationLogEntry = {
      type, sent_at: nowIso, phone: sentPhoneRecord, method,
      channel: primaryChannel,
    }
    const updatedLog = [newEntry, ...existingLog]

    // pipeline_status 자동 업데이트 + Phase 27-AR: template.linked_* 로 progress/payment 자동 세팅
    const dbUpdates: Record<string, unknown> = { notification_log: updatedLog }
    const newStatus = NOTIFY_PIPELINE_STATUS[type]
    if (newStatus) dbUpdates.pipeline_status = newStatus
    // Phase 27-AR: 정기딥/정기엔드 세부화면의 진행상태·결제상태 필드 자동 갱신
    // (하드코딩 매핑 없음 → 관리자가 관리 페이지에서 dropdown 으로 지정한 값 사용)
    if (linkedProgress) dbUpdates.progress_status = linkedProgress
    if (linkedPayment)  dbUpdates.payment_status_detail = linkedPayment

    await supabase
      .from('customers')
      .update(dbUpdates)
      .eq('id', customer_id)

    // 알림 이력 저장 (감사·통계용)
    await saveNotificationHistory({
      category: 'sms',
      type,
      body: `${type} 발송 완료 — ${customer.contact_name ?? ''} (${sentPhoneRecord})`,
      title: type,
      method,
      recipientType: 'customer',
      recipientName: String(customer.contact_name ?? ''),
      recipientPhone: sentPhoneRecord,
      metadata: {
        customer_id,
        business_name: customer.business_name ?? '',
        channels: channelsUsed,
      },
      status: 'sent',
    }).catch(() => {})

    // 리뷰 이벤트 안내 자동 후속 발송
    // 1회성케어 작업완료 3종(정기엔드케어 제외) 발송 성공 시 이어서 리뷰 안내 LMS 발송.
    // 실패는 원본 작업완료 발송 성공에 영향 없음.
    if (
      (type === '작업완료알림' ||
        type === '작업완료알림(현금)' ||
        type === '작업완료알림(카드,플렛폼)') &&
      customer.customer_type === '1회성케어' &&
      channelsUsed.length > 0
    ) {
      const reviewLog: NotificationLogEntry[] = []
      for (const target of targets) {
        try {
          const result = await sendByTemplate('리뷰이벤트안내', target, {
            customer: customer as NotificationContext['customer'],
          })
          if (result.ok) {
            reviewLog.push({
              type: '리뷰이벤트안내',
              sent_at: new Date().toISOString(),
              phone: target,
              method: 'auto',
              channel: result.type === 'LMS' ? 'lms' : 'sms',
            })
          }
        } catch { /* 리뷰 알림 실패는 무시 */ }
      }

      if (reviewLog.length > 0) {
        const mergedLog = [...reviewLog, ...updatedLog]
        await supabase
          .from('customers')
          .update({ notification_log: mergedLog })
          .eq('id', customer_id)

        for (const entry of reviewLog) {
          await saveNotificationHistory({
            category: 'sms',
            type: '리뷰이벤트안내',
            body: '리뷰 이벤트 안내 자동 발송',
            title: '리뷰 이벤트 안내',
            method: 'auto',
            recipientType: 'customer',
            recipientName: String(customer.contact_name ?? ''),
            recipientPhone: entry.phone,
            status: 'sent',
            metadata: {
              customer_id,
              business_name: customer.business_name ?? '',
              channel: entry.channel,
              source: 'auto_review_after_completion',
            },
          }).catch(() => {})
        }
      }
    }

    // Slack 리포트
    const targetSummary = targets.length > 1
      ? `${targets.join(', ')} (${targets.length}건)`
      : targets[0]
    const sendErrorLine = sendErrors.length > 0 ? `\n⚠️ 일부 실패: ${sendErrors.join(' / ')}` : ''
    const channelLabel = channelsUsed.length > 0
      ? channelsUsed.map(c => c.toUpperCase()).join('+')
      : 'SMS'
    sendSlack([
      `📤 *고객 알림 발송* | ${type}`,
      `업체: ${String(customer.business_name ?? '-')} / 고객: ${String(customer.contact_name ?? '-')} (${targetSummary})`,
      `발송: ${method === 'manual' ? '수동' : '자동'} | 채널: ${channelLabel} | 템플릿: DB(${type})${sendErrorLine}`,
      ``,
      `[폴백 SMS]`,
      fallbackText,
    ].join('\n')).catch(() => {})

    // Phase 27-AR: 프론트 옵티미스틱 업데이트가 응답 값 그대로 반영하도록 확장
    return NextResponse.json({
      success: true,
      type,
      method,
      pipeline_status: newStatus ?? null,
      new_progress_status: linkedProgress,
      new_payment_status_detail: linkedPayment,
      notification_log: updatedLog,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
