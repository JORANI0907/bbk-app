/**
 * Phase 25c: 서버 사이드 template 조회 + SMS/LMS 발송 헬퍼.
 * 자동/수동 발송 라우트에서 재사용.
 *
 * 원리:
 * 1) code로 notification_templates 조회 (is_active=true)
 * 2) renderTemplate으로 {{변수}} 치환
 * 3) sendSmsOrLms 호출 (90byte 초과 시 LMS 자동 승격)
 *
 * 반환:
 *   { ok: true, type: 'SMS' | 'LMS', text }
 *   { ok: false, reason: 'template_not_found' | 'inactive' | 'send_failed', ... }
 */

import { createServiceClient } from './supabase/server'
import { renderTemplate } from './notification-renderer'
import type { NotificationContext } from './notification-variables'
import { sendSmsOrLms } from './solapi'
import { classifyMessage, countSmsBytes } from './sms-byte-counter'

export type SendResult =
  | { ok: true; type: 'SMS' | 'LMS'; text: string; bytes: number; templateId: string }
  | { ok: false; reason: string; details?: string }

/**
 * template code로 발송. context는 렌더용, phone은 수신자.
 */
export async function sendByTemplate(
  code: string,
  phone: string,
  context: NotificationContext,
): Promise<SendResult> {
  const supabase = createServiceClient()
  const { data: template, error } = await supabase
    .from('notification_templates')
    .select('id, body, subject, is_active')
    .eq('code', code)
    .maybeSingle()

  if (error || !template) {
    return { ok: false, reason: 'template_not_found', details: code }
  }
  if (!template.is_active) {
    return { ok: false, reason: 'inactive', details: code }
  }

  const rendered = renderTemplate(template.body, context)
  const bytes = countSmsBytes(rendered)
  const type = classifyMessage(rendered)

  if (type === 'OVER') {
    return { ok: false, reason: 'over_2000_bytes', details: `${bytes} bytes` }
  }

  try {
    await sendSmsOrLms(phone, rendered, { subject: template.subject })
    return { ok: true, type, text: rendered, bytes, templateId: template.id }
  } catch (e) {
    return { ok: false, reason: 'send_failed', details: e instanceof Error ? e.message : String(e) }
  }
}
