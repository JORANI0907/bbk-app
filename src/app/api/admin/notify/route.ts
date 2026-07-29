import { NextRequest, NextResponse } from 'next/server'
import { sendAlimtalk, sendSMS, sendSmsOrLms, sendSubscriptionPromoSMS } from '@/lib/solapi'
import { sendByTemplate } from '@/lib/template-sender'
import type { NotificationContext } from '@/lib/notification-variables'
import { createServiceClient } from '@/lib/supabase/server'
import { saveNotificationHistory } from '@/lib/notification'
import { sendPushToUsers } from '@/lib/push'
import { sendSlack } from '@/lib/slack'
import { dispatch, lookupFranchiseHqIdsForCustomer } from '@/lib/notification-dispatcher'

const WORKER_NOTIFY_TYPES = new Set(['작업자 일정 안내', '작업자 자세한 일정 안내'])

// ─── 계약상태 자동변경 매핑 (Phase 8-B: backward-compat status 컬럼) ─
// Dual-write 원칙: 기존 status는 그대로 유지하여 자동화(cron 필터, finance 등)가 안 깨지도록 함.
// 신규 컬럼(progress_status, payment_status_detail)는 아래 두 매핑으로 별도 추적.
const NOTIFY_TO_STATUS: Record<string, string> = {
  '예약확정알림':       '예약확정',
  '예약1일전알림':      '예약1일전',
  '예약당일알림':       '예약당일',
  '작업완료알림':               '작업완료',
  '작업완료알림(현금)':         '작업완료',
  '작업완료알림(카드,플렛폼)':  '작업완료',
  '작업완료알림(정기엔드케어)': '작업완료',
  '결제알림':               '결제',
  '결제알림(현금)':         '결제',
  '결제알림(카드,플렛폼)':  '결제',
  '결제완료알림':       '결제완료',
  '결제완료알림(잔금)':   '결제완료(잔금)',
  '예약금 입금완료 알림': '예약금 입금',
  '계산서발행완료알림': '계산서발행완료',
  '예약금환급완료알림': '예약금환급완료',
  '예약취소알림':       '예약취소',
  // 신청서작성완료알림은 상태 변경 없음 (신규 유지)
  'A/S방문알림':        'A/S방문',
  '방문견적알림':       '방문견적',
}

// Phase 8-B: 진행상태 자동변경 매핑 (progress_status 컬럼)
const NOTIFY_TO_PROGRESS_STATUS: Record<string, string> = {
  '신청서작성완료알림': '신청서작성',
  '예약확정알림':       '예약확정',
  '예약1일전알림':      '예약1일전',
  '예약당일알림':       '예약당일',
  '작업완료알림':               '작업완료',
  '작업완료알림(현금)':         '작업완료',
  '작업완료알림(카드,플렛폼)':  '작업완료',
  '작업완료알림(정기엔드케어)': '작업완료',
  '예약취소알림':       '예약취소',
  'A/S방문알림':        'A/S방문',
  '방문견적알림':       '방문견적',
}

// Phase 8-B: 결제상태 자동변경 매핑 (payment_status_detail 컬럼)
const NOTIFY_TO_PAYMENT_STATUS_DETAIL: Record<string, string> = {
  '결제알림':               '결제',
  '결제알림(현금)':         '결제',
  '결제알림(카드,플렛폼)':  '결제',
  '결제완료알림':       '결제완료',
  '결제완료알림(잔금)':   '결제완료(잔금)',
  '예약금 입금완료 알림': '예약금 입금',
  '계산서발행완료알림': '계산서발행완료',
  '예약금환급완료알림': '예약금환급완료',
}

// ─── 솔라피 카카오 알림톡 템플릿 ID (최신 자동화 v2) ──────────────
const ALIMTALK_TEMPLATES: Record<string, string> = {
  '예약확정알림':       'KA01TP260324131935207wzarljIsiyK',
  '예약1일전알림':      'KA01TP260324131935294IPmMhH8BWA8',
  '예약당일알림':       'KA01TP2603241319353583492vcrZ9c2',
  '작업완료알림':               'KA01TP260324125200271OOXEk0LPiAS',
  '작업완료알림(현금)':         'KA01TP260324125200310YfeiY0REGVv',
  '작업완료알림(카드,플렛폼)':  'KA01TP260324132220016T20FiBMSKKA',
  '작업완료알림(정기엔드케어)': 'KA01TP251208071633315G1wZC9a3w4F',
  '결제알림':               'KA01TP260324125232471CIIHJKDOBsf',
  '결제알림(현금)':         'KA01TP251127095540783njh0ig3nyjg',
  '결제알림(카드,플렛폼)':  'KA01TP251201210650817mczUreAtEjU',
  '결제완료알림':       'KA01TP260324125232674HVfev9PAzUe',
  '결제완료알림(잔금)':   'KA01TP260324125232674HVfev9PAzUe',
  '예약금 입금완료 알림': 'KA01TP260220102437819kp8ysvD4XqB',
  '계산서발행완료알림': 'KA01TP260324125232783yjmHI9u6j6j',
  '예약금환급완료알림': 'KA01TP260324125232819wDhAV1kuhAF',
  '예약취소알림':       'KA01TP260324125232854lv8CCYK3Ozu',
  'A/S방문알림':        'KA01TP260324125232887FY113tVp5zb',
  '방문견적알림':       'KA01TP260324125232920u1LmrtqCY0P',
  '신청서작성완료알림': 'KA01TP260225105100279pvfbwyZDT39',
  '견적신청접수알림':   'KA01TP260514153343828rQpIWkeH7pg',
  '계정안내알림':      'KA01TP260404141110684azipFQYSyxX',
}

// ─── 요청시간 계산: 마감시간 +1h ~ +4h ("~3시간 후") ──────────────
// 예) 21:00 → "22:00 ~ 01:00 사이"
function calcRequestTime(endTime: string | null | undefined): string {
  if (!endTime) return '-'
  const match = endTime.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return endTime
  const h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  const startH = (h + 1) % 24
  const endH   = (h + 4) % 24
  const fmt = (hour: number) => `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return `${fmt(startH)} ~ ${fmt(endH)} 사이`
}

// ─── 시공시간 기반 요청시간 계산: 0h ~ +2h ───────────────────────
// 예) 10:00 → "10:00 ~ 12:00 사이"
function calcConstructionRequestTime(timeStr: string | null | undefined): string {
  if (!timeStr) return '-'
  const match = timeStr.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return timeStr
  const h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  const startH = h % 24
  const endH   = (h + 2) % 24
  const fmt = (hour: number) => `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return `${fmt(startH)} ~ ${fmt(endH)} 사이`
}

// ─── 알림 유형별 변수 빌더 ────────────────────────────────────────
function buildVariables(
  type: string,
  app: Record<string, unknown>,
  assignedUserName: string,
): Record<string, string> {
  const ownerName   = String(app.owner_name ?? '')
  const businessName = String(app.business_name ?? '')
  const phone       = String(app.phone ?? '')
  const serviceType = String(app.service_type ?? '')
  const address     = String(app.address ?? '')
  const date        = (app.construction_date as string | null)?.slice(0, 10) ?? ''
  const hoursStart       = String(app.business_hours_start ?? '-')
  const hoursEnd         = app.business_hours_end as string | null
  const constructionTime = app.construction_time as string | null | undefined
  const requestTime      = constructionTime
    ? calcConstructionRequestTime(constructionTime)
    : ''
  const driveUrl    = String(app.drive_folder_url ?? '-')
  const bizNum      = String(app.business_number ?? '-')
  const accountNum  = String(app.account_number ?? '-')
  const deposit     = String(app.deposit ?? 0)
  const email       = String(app.email ?? '')
  const emailParts  = email.includes('@') ? email.split('@') : [email, '']

  // 금액 계산
  const supply  = Number(app.supply_amount ?? 0)
  const vat     = Number(app.vat ?? 0)
  const dep     = Number(app.deposit ?? 0)
  const total   = String((supply + vat).toLocaleString('ko-KR'))          // 총액 (공급가액+부가세)
  const balance = String(((supply + vat) - dep).toLocaleString('ko-KR'))  // 잔금 (총액-예약금)

  // 사전미팅 여부 / 시간
  const preMeetingAt = app.pre_meeting_at as string | null | undefined
  const meetingYN = preMeetingAt ? '진행 예정' : '-'
  const meetingTime = preMeetingAt
    ? new Date(preMeetingAt.slice(0, 16)).toLocaleString('ko-KR', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    : '-'

  switch (type) {
    case '예약확정알림':
      return {
        '고객명':     ownerName,
        '고객연락처': phone,
        '상호명':     businessName,
        '케어유형':   serviceType,
        '담당자':     assignedUserName || '-',
        '주소':       address,
        '시공일자':   date,
        '요청시간':   requestTime,
        '미팅여부':   meetingYN,
        '미팅시간':   meetingTime,
      }
    case '예약1일전알림':
    case '예약당일알림':
      return {
        '고객명':   ownerName,
        '상호명':   businessName,
        '케어유형': serviceType,
        '담당자':   assignedUserName || '-',
        '주소':     address,
        '시공일자': date,
        '요청시간': requestTime,
        '미팅여부': meetingYN,
        '미팅시간': meetingTime,
      }
    case '작업완료알림(정기엔드케어)':
      return {
        '고객명':  ownerName,
        '구글URL': driveUrl,
      }
    case '작업완료알림':
      return {
        '고객명':       ownerName,
        '구글URL':      driveUrl,
        '청소비용':     balance,
        '입금자고객명': ownerName,
      }
    case '작업완료알림(현금)':
      return {
        '고객명':       ownerName,
        '구글URL':      driveUrl,
        '현금잔금':     balance,
        '입금자고객명': ownerName,
      }
    case '작업완료알림(카드,플렛폼)':
      return {
        '고객명':       ownerName,
        '구글URL':      driveUrl,
        '청소비용':     total,
        '입금자고객명': ownerName,
      }
    case '결제알림':
      return {
        '고객명':   ownerName,
        '청소비용': balance,
      }
    case '결제알림(현금)':
      return {
        '고객명':       ownerName,
        '청소현금비용': balance,
      }
    case '결제알림(카드,플렛폼)':
      return {
        '고객명':       ownerName,
        '청소카드비용': total,
      }
    case '결제완료알림':
    case '결제완료알림(잔금)':
      return {
        '고객명':       ownerName,
        '사업자등록번호': bizNum,
        '페이백계좌번호': accountNum,
      }
    case '계산서발행완료알림':
      return {
        '고객명':     ownerName,
        '이메일아이디': emailParts[0] || '-',
        '이메일도메인': emailParts[1] || '-',
      }
    case '예약금 입금완료 알림':
      return {
        '고객명':   ownerName,
        '상호명':   businessName,
        '예약금':   deposit,
        '시공일자': date,
      }
    case '예약금환급완료알림':
      return {
        '고객명':   ownerName,
        '계좌번호': accountNum,
        '예약금':   deposit,
      }
    case '예약취소알림':
      return {
        '고객명':   ownerName,
        '성함':     ownerName,
        '연락처':   phone,
        '케어유형': serviceType,
        '시공일자': date,
      }
    case 'A/S방문알림':
      return {
        '고객명':   ownerName,
        '성함':     ownerName,
        '연락처':   phone,
        '케어유형': serviceType,
        '시공일자': date,
        '방문시간': hoursStart,
      }
    case '방문견적알림':
      return {
        '고객명':   ownerName,
        '성함':     ownerName,
        '연락처':   phone,
        '케어유형': serviceType,
        '시공일자': date,
        '방문시간': constructionTime ?? '-',
      }
    case '신청서작성완료알림':
      return { '고객명': ownerName }
    case '견적신청접수알림':
      return {
        '고객명': ownerName,
        '업체명': businessName,
        '시공일': (app.construction_date as string | null)?.slice(0, 10) ?? '미정',
      }
    default:
      return { '고객명': ownerName }
  }
}

// ─── 폴백 SMS 텍스트 ──────────────────────────────────────────────
function buildFallback(type: string, app: Record<string, unknown>): string {
  const name = String(app.owner_name ?? '')
  const bizName = String(app.business_name ?? '')
  const date = (app.construction_date as string | null)?.slice(0, 10) ?? ''
  const fallbacks: Record<string, string> = {
    '예약확정알림':       `[BBK 공간케어] ${name}님, ${bizName} 예약이 확정되었습니다. (${date})`,
    '예약1일전알림':      `[BBK 공간케어] ${name}님, 내일 ${bizName} 방문 예정입니다.`,
    '예약당일알림':       `[BBK 공간케어] ${name}님, 오늘 방문 예정입니다. 준비 확인 부탁드립니다.`,
    '작업완료알림':               `[BBK 공간케어] ${name}님, 케어가 완료되었습니다. 감사합니다.`,
    '작업완료알림(현금)':         `[BBK 공간케어] ${name}님, 케어가 완료되었습니다. 감사합니다.`,
    '작업완료알림(카드,플렛폼)':  `[BBK 공간케어] ${name}님, 케어가 완료되었습니다. 감사합니다.`,
    '작업완료알림(정기엔드케어)': `[BBK 공간케어] ${name}님, 오늘 진행한 청소 작업이 완료되었습니다. 감사합니다.`,
    '결제알림':               `[BBK 공간케어] ${name}님, 잔금 결제를 요청드립니다.`,
    '결제알림(현금)':         `[BBK 공간케어] ${name}님, 잔금 결제를 요청드립니다.`,
    '결제알림(카드,플렛폼)':  `[BBK 공간케어] ${name}님, 잔금 결제를 요청드립니다.`,
    '결제완료알림':       `[BBK 공간케어] ${name}님, 결제가 완료되었습니다. 감사합니다.`,
    '결제완료알림(잔금)': `[BBK 공간케어] ${name}님, 잔금 결제가 완료되었습니다. 감사합니다.`,
    '계산서발행완료알림': `[BBK 공간케어] ${name}님, 세금계산서가 발행되었습니다.`,
    '예약금 입금완료 알림': `[BBK 공간케어] ${name}님, 예약금 입금이 확인되었습니다. (${bizName})`,
    '예약금환급완료알림': `[BBK 공간케어] ${name}님, 예약금 환급이 완료되었습니다.`,
    '예약취소알림':       `[BBK 공간케어] ${name}님, 예약이 취소되었습니다.`,
    'A/S방문알림':        `[BBK 공간케어] ${name}님, A/S 방문 일정을 안내드립니다.`,
    '방문견적알림':       `[BBK 공간케어] ${name}님, 방문견적 일정을 안내드립니다.`,
    '신청서작성완료알림': `[BBK 공간케어] ${name}님, 신청서가 정상적으로 접수되었습니다. 담당자가 확인 후 연락드리겠습니다.`,
    '견적신청접수알림':   `[BBK 공간케어] ${name}님, 견적 신청이 접수되었습니다. 담당자가 확인 후 연락드리겠습니다.`,
  }
  return fallbacks[type] ?? `[BBK 공간케어] ${name}님께 알림을 발송합니다.`
}

// ─── notification_log 항목 타입 ──────────────────────────────────
interface NotificationLogEntry {
  type: string
  sent_at: string
  phone: string
  method: 'auto' | 'manual'
  template_id?: string
  channel?: 'sms' | 'lms' | 'alimtalk'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      application_id: string
      type: string
      method?: 'auto' | 'manual'
    }
    const { application_id, method = 'manual' } = body
    let type = body.type
    if (!application_id || !type) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // ── 구독권유알림 SMS (별도 처리) ─────────────────────────────
    if (type === '구독권유알림') {
      const { data: app } = await supabase
        .from('service_applications')
        .select('*')
        .eq('id', application_id)
        .single()
      if (!app) return NextResponse.json({ error: '신청서를 찾을 수 없습니다.' }, { status: 404 })

      if (app.service_type !== '1회성케어') {
        return NextResponse.json({ error: '이미 구독 중인 고객입니다.' }, { status: 400 })
      }

      const existingLog: NotificationLogEntry[] = Array.isArray(app.notification_log) ? app.notification_log : []
      if (existingLog.some(l => l.type === '구독권유알림')) {
        return NextResponse.json({ success: true, skipped: true, reason: '이미 발송된 알림입니다.' })
      }

      const phone = (app.phone ?? '').replace(/-/g, '')
      if (!phone) return NextResponse.json({ error: '전화번호가 없습니다.' }, { status: 400 })

      const customerName = String(app.owner_name ?? app.contact_name ?? '')
      await sendSubscriptionPromoSMS(phone, customerName)

      const nowIso = new Date().toISOString()
      const newEntry: NotificationLogEntry = { type: '구독권유알림', sent_at: nowIso, phone, method }
      await supabase
        .from('service_applications')
        .update({ notification_log: [newEntry, ...existingLog] })
        .eq('id', application_id)

      await saveNotificationHistory({
        category: 'sms',
        type: '구독권유알림',
        body: `구독권유알림 발송 완료 — ${app.owner_name ?? ''} (${phone})`,
        title: '구독권유알림',
        method,
        recipientType: 'customer',
        recipientName: String(app.owner_name ?? ''),
        recipientPhone: phone,
        metadata: { application_id },
        status: 'sent',
      })

      return NextResponse.json({ success: true, new_status: null })
    }

    // ── 작업자 일정 안내 SMS (별도 처리) ──────────────────────────
    if (WORKER_NOTIFY_TYPES.has(type)) {
      const { data: app } = await supabase
        .from('service_applications')
        .select('*')
        .eq('id', application_id)
        .single()
      if (!app) return NextResponse.json({ error: '신청서를 찾을 수 없습니다.' }, { status: 404 })

      // work_assignments에서 실제 배정된 작업자 조회
      const { data: assignments } = await supabase
        .from('work_assignments')
        .select('worker_id')
        .eq('application_id', application_id)

      if (!assignments?.length) {
        return NextResponse.json({ error: '배정된 작업자가 없습니다. 먼저 작업자를 배정해주세요.' }, { status: 400 })
      }

      const workerIds = assignments.map(a => a.worker_id)
      const { data: workerRows } = await supabase
        .from('workers')
        .select('id, name, phone')
        .in('id', workerIds)

      const validWorkers = (workerRows ?? []).filter(w => w.phone)
      if (!validWorkers.length) {
        return NextResponse.json({ error: '배정된 작업자의 전화번호가 없습니다. 작업자 관리에서 연락처를 확인해주세요.' }, { status: 400 })
      }

      const date = app.construction_date?.slice(0, 10) ?? '-'
      const start = app.business_hours_start ?? '-'
      const end = app.business_hours_end ?? '-'
      const ctTime = app.construction_time as string | null | undefined
      const ctLabel = (() => {
        if (!ctTime) return null
        const m = ctTime.match(/^(\d{1,2}):(\d{2})/)
        if (!m) return ctTime
        return m[2] === '00' ? `${parseInt(m[1], 10)}시` : `${parseInt(m[1], 10)}시 ${m[2]}분`
      })()
      const timeLine = ctLabel
        ? `시공시간: ${ctLabel}`
        : `시간: ${start} ~ ${end}`

      const nowIso = new Date().toISOString()
      const existingLog = Array.isArray(app.notification_log) ? app.notification_log : []
      const sentPhones: string[] = []

      for (const worker of validWorkers) {
        let smsText: string
        if (type === '작업자 일정 안내') {
          smsText =
            `[BBK 공간케어] ${worker.name ?? ''}님 일정 안내\n` +
            `업체: ${app.business_name ?? '-'}\n` +
            `주소: ${app.address ?? '-'}\n` +
            `일자: ${date}\n` +
            `${timeLine}`
        } else {
          const ctLine = ctLabel ? `시공시간: ${ctLabel}` : null
          const bizHoursLine = (app.business_hours_start || app.business_hours_end)
            ? `영업시간: ${app.business_hours_start ?? '-'} ~ ${app.business_hours_end ?? '-'}`
            : null
          const parts = [
            `[BBK 공간케어] ${worker.name ?? ''}님 자세한 일정 안내`,
            `\n[기본 정보]`,
            `업체: ${app.business_name ?? '-'}`,
            `주소: ${app.address ?? '-'}`,
            `일자: ${date}`,
            ...(ctLine ? [ctLine] : []),
            ...(bizHoursLine ? [bizHoursLine] : []),
            `\n[현장 연락]`,
            `고객연락처: ${app.phone ?? '-'}`,
            `\n[출입 안내]`,
            `주차: ${app.parking ?? '-'}`,
            `건물출입: ${app.building_access ?? '-'}`,
            `엘리베이터: ${app.elevator ?? '-'}`,
            `출입방법: ${app.access_method ?? '-'}`,
            `\n[작업 안내]`,
            `케어범위: ${app.care_scope ?? '-'}`,
            `고객 요청: ${app.request_notes ?? '-'}`,
            `관리자 요청: ${app.admin_notes ?? '-'}`,
            `\n사진(드라이브): ${app.drive_folder_url ?? '-'}`,
          ]
          smsText = parts.join('\n')
        }

        await sendSMS(worker.phone!, smsText)
        sentPhones.push(worker.phone!)

        // 발송 내용 Slack 보고 (notification_rules.notify_admin 토글 OFF면 건너뜀)
        const { data: ruleWorkerSlack } = await supabase
          .from('notification_rules')
          .select('notify_admin, is_active')
          .eq('type', type)
          .maybeSingle()
        const workerSlackEnabled = (ruleWorkerSlack as { notify_admin?: boolean; is_active?: boolean } | null)
        const shouldWorkerSlack = !workerSlackEnabled || (workerSlackEnabled.notify_admin && workerSlackEnabled.is_active !== false)
        if (shouldWorkerSlack) {
          sendSlack([
            `📤 *작업자 알림* | ${type}`,
            `수신: ${worker.name ?? '-'} (${worker.phone})`,
            ``,
            `[발송 내용]`,
            smsText,
          ].join('\n')).catch(() => {})
        }

        await saveNotificationHistory({
          category: 'sms',
          type,
          body: `${type} 발송 완료 — ${worker.name ?? ''} (${worker.phone})`,
          title: type,
          method,
          recipientType: 'worker',
          recipientName: String(worker.name ?? ''),
          recipientPhone: worker.phone!,
          metadata: { application_id },
          status: 'sent',
        })
      }

      const newEntry = { type, sent_at: nowIso, phone: sentPhones.join(','), method }
      await supabase
        .from('service_applications')
        .update({ notification_log: [newEntry, ...existingLog] })
        .eq('id', application_id)

      return NextResponse.json({ success: true, new_status: null, worker_phones: sentPhones })
    }

    let legacyTemplateId: string | null = ALIMTALK_TEMPLATES[type] ?? null
    // 게이팅: legacy 카톡 매핑 OR notification_templates(code=type) 중 하나만 있으면 진행
    // 단, '작업완료알림'은 아래에서 세분화 후 재검증하므로 여기서 통과시킴
    if (!legacyTemplateId && type !== '작업완료알림') {
      const { data: dbTpl } = await supabase
        .from('notification_templates')
        .select('id, is_active')
        .eq('code', type)
        .maybeSingle()
      const hasDbTemplate = !!dbTpl && dbTpl.is_active !== false
      if (!hasDbTemplate) {
        return NextResponse.json({ error: `알 수 없는 알림 유형입니다: ${type}` }, { status: 400 })
      }
    }

    // 신청서 + 담당자 이름 조회 (삭제된 레코드 제외)
    const { data: app } = await supabase
      .from('service_applications')
      .select('*')
      .eq('id', application_id)
      .is('deleted_at', null)
      .single()

    if (!app) return NextResponse.json({ error: '신청서를 찾을 수 없습니다.' }, { status: 404 })

    // 작업완료알림: 서비스 유형 및 payment_method에 따라 알림 유형 결정
    if (type === '작업완료알림') {
      if (String(app.service_type ?? '') === '정기엔드케어') {
        type = '작업완료알림(정기엔드케어)'
      } else {
        const pm = String(app.payment_method ?? '')
        if (pm === '현금(비과세)') {
          type = '작업완료알림(현금)'
        } else if (pm === '카드(온라인 간편결제)' || pm === '플랫폼') {
          type = '작업완료알림(카드,플렛폼)'
        } else if (pm !== '현금(계산서 희망)') {
          return NextResponse.json({ success: true, skipped: true, reason: `결제방법 '${pm}'은(는) 발송 대상이 아닙니다.` })
        }
      }
      legacyTemplateId = ALIMTALK_TEMPLATES[type] ?? null
      if (!legacyTemplateId) {
        const { data: dbTpl } = await supabase
          .from('notification_templates')
          .select('id, is_active')
          .eq('code', type)
          .maybeSingle()
        if (!dbTpl || dbTpl.is_active === false) {
          return NextResponse.json({ error: `알 수 없는 알림 유형입니다: ${type}` }, { status: 400 })
        }
      }
    }

    // 신청서작성완료알림 1회 제한
    if (type === '신청서작성완료알림') {
      const log: NotificationLogEntry[] = Array.isArray(app.notification_log) ? app.notification_log : []
      if (log.some(l => l.type === '신청서작성완료알림')) {
        return NextResponse.json({ success: true, skipped: true, reason: '이미 발송된 알림입니다.' })
      }
    }

    // 담당자 이름 조회
    let assignedUserName = '-'
    if (app.assigned_to) {
      const { data: userRow } = await supabase
        .from('users')
        .select('name')
        .eq('id', app.assigned_to)
        .single()
      if (userRow?.name) assignedUserName = userRow.name
    }

    // 발송 대상 번호 결정 — 견적서와 동일 규칙:
    // phone_notify_1 !== false 이면 메인 phone, phone_notify_2 !== false 이면 추가번호 phone_2
    // 둘 다 활성인 경우 두 번호 모두에게 발송. 둘 다 비활성 or 번호 없음이면 발송 스킵.
    const phone = (app.phone ?? '').replace(/-/g, '')
    const phone2 = (String(app.phone_2 ?? '') || '').replace(/-/g, '')
    const notify1 = app.phone_notify_1 !== false
    const notify2 = app.phone_notify_2 !== false

    const targets: string[] = []
    if (notify1 && phone) targets.push(phone)
    if (notify2 && phone2) targets.push(phone2)

    if (targets.length === 0) {
      return NextResponse.json({ error: '발송 가능한 전화번호가 없습니다.' }, { status: 400 })
    }

    const variables = buildVariables(type, app as Record<string, unknown>, assignedUserName)
    const fallbackText = buildFallback(type, app as Record<string, unknown>)

    // 각 번호로 순차 발송. 하나 실패해도 나머지는 계속.
    // Phase 25e: notification_templates code 기반 SMS 우선 → 실패 시 legacy 카톡 fallback (legacy ID 있을 때만)
    const sendErrors: string[] = []
    const channelsUsed: Array<'sms' | 'lms' | 'alimtalk'> = []
    for (const target of targets) {
      const smsResult = await sendByTemplate(type, target, {
        application: app as NotificationContext['application'],
      })
      if (smsResult.ok) {
        channelsUsed.push(smsResult.type === 'LMS' ? 'lms' : 'sms')
        continue
      }
      if (!legacyTemplateId) {
        sendErrors.push(`${target}: ${smsResult.reason}${smsResult.details ? ` (${smsResult.details})` : ''}`)
        console.error(`[notify] SMS 발송 실패 (${target}): ${smsResult.reason}`)
        continue
      }
      try {
        await sendAlimtalk(target, legacyTemplateId, variables, fallbackText)
        channelsUsed.push('alimtalk')
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        sendErrors.push(`${target}: ${msg}`)
        console.error(`[notify] 알림톡 발송 실패 (${target}):`, msg)
      }
    }
    if (sendErrors.length === targets.length) {
      // 전체 실패 시에만 명시적 에러 반환
      return NextResponse.json({ error: sendErrors.join(' / ') }, { status: 500 })
    }

    // ── 발송 내용 Slack 보고 (notification_rules.notify_admin 토글 OFF면 건너뜀) ──
    const { data: ruleAdmin } = await supabase
      .from('notification_rules')
      .select('notify_admin, is_active')
      .eq('type', type)
      .maybeSingle()
    const adminSlackEnabled = (ruleAdmin as { notify_admin?: boolean; is_active?: boolean } | null)
    const shouldSlack = !adminSlackEnabled || (adminSlackEnabled.notify_admin && adminSlackEnabled.is_active !== false)
    if (shouldSlack) {
      const varLines = Object.entries(variables)
        .map(([k, v]) => `  ${k}: ${v || '(빈값)'}`)
        .join('\n')
      const targetSummary = targets.length > 1
        ? `${targets.join(', ')} (${targets.length}건)`
        : targets[0]
      const sendErrorLine = sendErrors.length > 0 ? `\n⚠️ 일부 실패: ${sendErrors.join(' / ')}` : ''
      const channelLabel = channelsUsed.length > 0
        ? channelsUsed.map(c => c.toUpperCase()).join('+')
        : '알림톡'
      sendSlack([
        `📤 *알림 발송* | ${type}`,
        `업체: ${String(app.business_name ?? '-')} / 고객: ${String(app.owner_name ?? '-')} (${targetSummary})`,
        `발송: ${method === 'manual' ? '수동' : '자동'} | 채널: ${channelLabel} | 템플릿: ${legacyTemplateId ?? `DB(${type})`}${sendErrorLine}`,
        ``,
        `[적용 변수]`,
        varLines,
        ``,
        `[폴백 SMS]`,
        fallbackText,
      ].join('\n')).catch(() => {})
    }

    // ── 계약상태 자동변경 (Phase 8-B: dual-write) ──────────────────
    const newStatus = NOTIFY_TO_STATUS[type]
    const newProgressStatus = NOTIFY_TO_PROGRESS_STATUS[type]
    const newPaymentStatusDetail = NOTIFY_TO_PAYMENT_STATUS_DETAIL[type]
    const nowIso = new Date().toISOString()

    // ── notification_log append ────────────────────────────────────
    const existingLog: NotificationLogEntry[] = Array.isArray(app.notification_log)
      ? (app.notification_log as NotificationLogEntry[])
      : []

    // 실제 발송된 번호(들)를 기록. 두 번호 발송 시 콤마 구분.
    const sentPhoneRecord = targets.join(',')
    const primaryChannel: 'sms' | 'lms' | 'alimtalk' = channelsUsed[0] ?? (legacyTemplateId ? 'alimtalk' : 'sms')
    const newEntry: NotificationLogEntry = {
      type, sent_at: nowIso, phone: sentPhoneRecord, method,
      template_id: legacyTemplateId ?? undefined,
      channel: primaryChannel,
    }
    const updatedLog = [newEntry, ...existingLog]

    const dbUpdates: Record<string, unknown> = { notification_log: updatedLog }
    if (newStatus) dbUpdates.status = newStatus
    // Phase 8-B: dual-write — 신규 두 컬럼도 함께 업데이트
    if (newProgressStatus) dbUpdates.progress_status = newProgressStatus
    if (newPaymentStatusDetail) dbUpdates.payment_status_detail = newPaymentStatusDetail
    // 작업완료알림 발송 시 notification_sent_at 기록 (WorkPanel 완료 표시용)
    if (
      type === '작업완료알림' ||
      type === '작업완료알림(현금)' ||
      type === '작업완료알림(카드,플렛폼)' ||
      type === '작업완료알림(정기엔드케어)'
    ) {
      dbUpdates.notification_sent_at = nowIso
      dbUpdates.notification_send_at = null
    }

    await supabase
      .from('service_applications')
      .update(dbUpdates)
      .eq('id', application_id)

    // ── 알림 이력 저장 ──────────────────────────────────────────────
    const historyCategory: 'alimtalk' | 'sms' =
      primaryChannel === 'alimtalk' ? 'alimtalk' : 'sms'
    await saveNotificationHistory({
      category: historyCategory,
      type,
      body: `${type} 발송 완료 — ${app.owner_name ?? ''} (${sentPhoneRecord})`,
      title: type,
      method,
      recipientType: 'customer',
      recipientName: String(app.owner_name ?? ''),
      recipientPhone: sentPhoneRecord,
      metadata: {
        application_id,
        business_name: app.business_name ?? '',
        channels: channelsUsed,
      },
      status: 'sent',
    })

    // ── Web Push 발송 (notification_rules의 role 토글에 따라 분기) ──
    // dispatcher가 notify_admin/worker/customer/franchise_hq 규칙을 적용함
    // 관리자 push는 customers.assigned_user_id(담당 관리자)에게만 — 모든 admin이 받지 않음
    try {
      const customerIdRaw = app.customer_id ? String(app.customer_id) : undefined
      const { customerUserId, assignedAdminId } = await (async () => {
        if (!customerIdRaw) return { customerUserId: undefined, assignedAdminId: undefined }
        const { data } = await supabase
          .from('customers')
          .select('user_id, assigned_user_id')
          .eq('id', customerIdRaw)
          .maybeSingle()
        const row = data as { user_id: string | null; assigned_user_id: string | null } | null
        return {
          customerUserId: row?.user_id ?? undefined,
          assignedAdminId: row?.assigned_user_id ?? undefined,
        }
      })()
      const franchiseHqIds = customerIdRaw ? await lookupFranchiseHqIdsForCustomer(customerIdRaw) : []

      await dispatch(type, {
        customer: {
          id: customerIdRaw,
          userId: customerUserId,
          phone,
          name: String(app.owner_name ?? ''),
          businessName: String(app.business_name ?? ''),
        },
        workerIds: app.assigned_to ? [String(app.assigned_to)] : [],
        adminIds: assignedAdminId ? [assignedAdminId] : [],
        franchiseHqIds,
        push: { title: `BBK 공간케어 — ${type}`, body: `${String(app.business_name ?? '')} ${type}`, url: '/admin' },
        method,
        metadata: { application_id, business_name: app.business_name ?? '', source: 'admin/notify' },
      })
    } catch {
      // dispatcher 실패는 알림톡 응답에 영향 없음
    }

    // ── 결제완료알림 발송 직후 구독권유알림 자동 발송 ────────────
    if (
      (type === '결제완료알림' || type === '결제완료알림(잔금)') &&
      app.service_type === '1회성케어'
    ) {
      try {
        const latestLog: NotificationLogEntry[] = Array.isArray(app.notification_log)
          ? (app.notification_log as NotificationLogEntry[])
          : []
        const alreadySentPromo = latestLog.some(l => l.type === '구독권유알림')
        if (!alreadySentPromo) {
          const promoCustomerName = String(app.owner_name ?? app.contact_name ?? '')
          await sendSubscriptionPromoSMS(phone, promoCustomerName)
          const promoNow = new Date().toISOString()
          const promoEntry: NotificationLogEntry = { type: '구독권유알림', sent_at: promoNow, phone, method: 'auto' }
          // notification_log는 이미 updatedLog로 업데이트됐으므로 거기에 추가
          const promoLog = [promoEntry, ...updatedLog]
          await supabase
            .from('service_applications')
            .update({ notification_log: promoLog })
            .eq('id', application_id)
          await saveNotificationHistory({
            category: 'sms',
            type: '구독권유알림',
            body: `구독권유알림 자동 발송 — ${app.owner_name ?? ''} (${phone})`,
            title: '구독권유알림',
            method: 'auto',
            recipientType: 'customer',
            recipientName: String(app.owner_name ?? ''),
            recipientPhone: phone,
            metadata: { application_id, trigger: type },
            status: 'sent',
          })
        }
      } catch {
        // 구독권유알림 실패는 메인 응답에 영향 없음
      }
    }

    // ── Phase 27-M: 작업완료알림 직후 특이사항·내부메모 부가 전달 ──
    // 카카오 승인 템플릿에는 자유텍스트 슬롯이 없어 customer_memo/internal_memo 가
    // 그동안 어떤 채널로도 전달되지 않았음. 관리자가 [알림 발송] 을 누르는 시점에
    // - customer_memo: 고객 후행 SMS/LMS + 관리자 Slack
    // - internal_memo: 관리자 Slack 만
    if (
      type === '작업완료알림' ||
      type === '작업완료알림(현금)' ||
      type === '작업완료알림(카드,플렛폼)' ||
      type === '작업완료알림(정기엔드케어)'
    ) {
      const customerMemo = String(app.customer_memo ?? '').trim()
      const internalMemo = String(app.internal_memo ?? '').trim()
      const businessName = String(app.business_name ?? '')
      const ownerName = String(app.owner_name ?? '')
      const serviceType = String(app.service_type ?? '')
      const constructionDate = String(app.construction_date ?? '').slice(0, 10)

      // 1) 고객 특이사항 → 고객 후행 SMS/LMS + 관리자 Slack
      if (customerMemo) {
        try {
          const smsText =
            `[BBK 공간케어] 오늘 작업 관련 특이사항입니다.\n\n` +
            `${customerMemo}\n\n` +
            `문의는 답장 또는 대표번호(031-759-4877)로 부탁드립니다.`
          await sendSmsOrLms(phone, smsText, { subject: '[BBK] 작업 특이사항' })
          await saveNotificationHistory({
            category: 'sms',
            type: '작업완료 특이사항',
            body: smsText,
            title: '작업완료 특이사항',
            method,
            recipientType: 'customer',
            recipientName: ownerName,
            recipientPhone: phone,
            metadata: { application_id, trigger: type },
            status: 'sent',
          })
        } catch {
          // 특이사항 SMS 실패는 메인 알림톡 응답에 영향 없음
        }
        try {
          await sendSlack(
            `📌 *고객 전달 특이사항* — ${businessName} (${serviceType})\n` +
            `👤 ${ownerName} · ${constructionDate || '-'}\n` +
            `${customerMemo}`
          )
        } catch { /* fire-and-forget */ }
      }

      // 2) 내부 메모 → 관리자 Slack 만
      if (internalMemo) {
        try {
          await sendSlack(
            `📝 *내부 메모* — ${businessName} (${serviceType})\n` +
            `👤 ${ownerName} · ${constructionDate || '-'}\n` +
            `${internalMemo}`
          )
        } catch { /* fire-and-forget */ }
      }
    }

    // Phase 27-AN: 하드코딩 자동 연쇄 삭제.
    // 이전엔 작업완료알림 발송 직후 계정안내알림을 자동으로 이어서 발송했으나,
    // "활성·자동 스위치가 유일한 결정자" 원칙에 따라 제거. 계정안내는 관리자 수동 발송
    // 또는 문자알림 관리 탭에서 계정안내 템플릿의 auto_used=true 로 통제.

    return NextResponse.json({ success: true, new_status: newStatus ?? null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
