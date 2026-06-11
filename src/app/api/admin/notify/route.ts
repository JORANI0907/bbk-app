import { NextRequest, NextResponse } from 'next/server'
import { sendAlimtalk, sendSMS, sendSubscriptionPromoSMS } from '@/lib/solapi'
import { createServiceClient } from '@/lib/supabase/server'
import { saveNotificationHistory } from '@/lib/notification'
import { sendPushToUsers } from '@/lib/push'
import { sendSlack } from '@/lib/slack'

const WORKER_NOTIFY_TYPES = new Set(['작업자 일정 안내', '작업자 자세한 일정 안내'])

// ─── 계약상태 자동변경 매핑 ────────────────────────────────────────
const NOTIFY_TO_STATUS: Record<string, string> = {
  '예약확정알림':       '예약확정',
  '예약1일전알림':      '예약1일전',
  '예약당일알림':       '예약당일',
  '작업완료알림':           '작업완료',
  '작업완료알림(현금)':     '작업완료',
  '작업완료알림(카드,플렛폼)': '작업완료',
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

// ─── 솔라피 카카오 알림톡 템플릿 ID (최신 자동화 v2) ──────────────
const ALIMTALK_TEMPLATES: Record<string, string> = {
  '예약확정알림':       'KA01TP260324131935207wzarljIsiyK',
  '예약1일전알림':      'KA01TP260324131935294IPmMhH8BWA8',
  '예약당일알림':       'KA01TP2603241319353583492vcrZ9c2',
  '작업완료알림':           'KA01TP260324125200271OOXEk0LPiAS',
  '작업완료알림(현금)':     'KA01TP260324125200310YfeiY0REGVv',
  '작업완료알림(카드,플렛폼)': 'KA01TP260324132220016T20FiBMSKKA',
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
    ? new Date(preMeetingAt).toLocaleString('ko-KR', {
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
    case '작업완료알림':
    case '작업완료알림(현금)':
      return {
        '고객명':     ownerName,
        '구글URL':    driveUrl,
        '청소비용':   balance,   // 잔금 (총액 - 예약금)
        '입금자고객명': ownerName,
      }
    case '작업완료알림(카드,플렛폼)':
      return {
        '고객명':     ownerName,
        '구글URL':    driveUrl,
        '청소비용':   total,     // 총액 (예약금 환급 후 카드 전액 결제)
        '입금자고객명': ownerName,
      }
    case '결제알림':
    case '결제알림(현금)':
      return {
        '고객명':   ownerName,
        '청소비용': balance,   // 잔금 (총액 - 예약금)
      }
    case '결제알림(카드,플렛폼)':
      return {
        '고객명':   ownerName,
        '청소비용': total,     // 총액 (예약금 환급 후 카드 전액 결제)
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
    case '방문견적알림':
      return {
        '고객명':   ownerName,
        '성함':     ownerName,
        '연락처':   phone,
        '케어유형': serviceType,
        '시공일자': date,
        '방문시간': hoursStart,
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
    '작업완료알림':           `[BBK 공간케어] ${name}님, 케어가 완료되었습니다. 감사합니다.`,
    '작업완료알림(현금)':     `[BBK 공간케어] ${name}님, 케어가 완료되었습니다. 감사합니다.`,
    '작업완료알림(카드,플렛폼)': `[BBK 공간케어] ${name}님, 케어가 완료되었습니다. 감사합니다.`,
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

    let templateId = ALIMTALK_TEMPLATES[type]
    if (!templateId && type !== '작업완료알림') {
      return NextResponse.json({ error: '알 수 없는 알림 유형입니다.' }, { status: 400 })
    }

    // 신청서 + 담당자 이름 조회
    const { data: app } = await supabase
      .from('service_applications')
      .select('*')
      .eq('id', application_id)
      .single()

    if (!app) return NextResponse.json({ error: '신청서를 찾을 수 없습니다.' }, { status: 404 })

    // 작업완료알림: payment_method에 따라 실제 알림 유형 결정
    if (type === '작업완료알림') {
      const pm = String(app.payment_method ?? '')
      if (pm === '현금(비과세)') {
        type = '작업완료알림(현금)'
      } else if (pm === '카드(온라인 간편결제)' || pm === '플렛폼') {
        type = '작업완료알림(카드,플렛폼)'
      }
      templateId = ALIMTALK_TEMPLATES[type]
      if (!templateId) {
        return NextResponse.json({ error: '알 수 없는 알림 유형입니다.' }, { status: 400 })
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

    const phone = (app.phone ?? '').replace(/-/g, '')
    if (!phone) return NextResponse.json({ error: '전화번호가 없습니다.' }, { status: 400 })

    const variables = buildVariables(type, app as Record<string, unknown>, assignedUserName)
    const fallbackText = buildFallback(type, app as Record<string, unknown>)

    await sendAlimtalk(phone, templateId, variables, fallbackText)

    // ── 계약상태 자동변경 ──────────────────────────────────────────
    const newStatus = NOTIFY_TO_STATUS[type]
    const nowIso = new Date().toISOString()

    // ── notification_log append ────────────────────────────────────
    const existingLog: NotificationLogEntry[] = Array.isArray(app.notification_log)
      ? (app.notification_log as NotificationLogEntry[])
      : []

    const newEntry: NotificationLogEntry = { type, sent_at: nowIso, phone, method, template_id: templateId }
    const updatedLog = [newEntry, ...existingLog]

    const dbUpdates: Record<string, unknown> = { notification_log: updatedLog }
    if (newStatus) dbUpdates.status = newStatus
    // 작업완료알림 발송 시 notification_sent_at 기록 (WorkPanel 완료 표시용)
    if (
      type === '작업완료알림' ||
      type === '작업완료알림(현금)' ||
      type === '작업완료알림(카드,플렛폼)'
    ) {
      dbUpdates.notification_sent_at = nowIso
      dbUpdates.notification_send_at = null
    }

    await supabase
      .from('service_applications')
      .update(dbUpdates)
      .eq('id', application_id)

    // ── 알림 이력 저장 ──────────────────────────────────────────────
    await saveNotificationHistory({
      category: 'alimtalk',
      type,
      body: `${type} 발송 완료 — ${app.owner_name ?? ''} (${phone})`,
      title: type,
      method,
      recipientType: 'customer',
      recipientName: String(app.owner_name ?? ''),
      recipientPhone: phone,
      metadata: { application_id, business_name: app.business_name ?? '' },
      status: 'sent',
    })

    // ── Web Push 발송 ───────────────────────────────────────────────
    // 담당 작업자 및 고객 계정에게 Push 발송 (실패해도 응답에 영향 없음)
    try {
      const pushTargetIds: string[] = []
      if (app.assigned_to) pushTargetIds.push(String(app.assigned_to))
      if (app.customer_id) pushTargetIds.push(String(app.customer_id))
      if (pushTargetIds.length) {
        const pushTitle = `BBK 공간케어 — ${type}`
        const pushBody = `${String(app.business_name ?? '')} ${type}`
        await sendPushToUsers(pushTargetIds, { title: pushTitle, body: pushBody, url: '/admin' })
      }
    } catch {
      // Web Push 실패는 알림톡 응답에 영향 없음
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

    // ── 작업완료알림 발송 직후 계정안내알림 자동 발송 ────────────────
    if (
      (
        type === '작업완료알림' ||
        type === '작업완료알림(현금)' ||
        type === '작업완료알림(카드,플렛폼)'
      ) &&
      ['정기딥케어', '정기엔드케어'].includes(String(app.service_type ?? ''))
    ) {
      try {
        // 고객 계정 조회: customer_id 우선, fallback은 phone
        type AccountRow = { phone: string | null; password_hint: string | null; account_sent_at: string | null }
        let accountUser: AccountRow | null = null

        if (app.customer_id) {
          const { data } = await supabase
            .from('users')
            .select('phone, password_hint, account_sent_at')
            .eq('id', String(app.customer_id))
            .single()
          accountUser = data as AccountRow | null
        }

        if (!accountUser) {
          const cleanPhone = (app.phone ?? '').replace(/-/g, '')
          const { data } = await supabase
            .from('users')
            .select('phone, password_hint, account_sent_at')
            .eq('phone', cleanPhone)
            .eq('role', 'customer')
            .maybeSingle()
          accountUser = data as AccountRow | null
        }

        if (!accountUser?.phone || !accountUser?.password_hint) {
          await sendSlack(
            `⚠️ 계정안내알림 스킵 — ${app.owner_name ?? ''} (${app.business_name ?? ''}): 계정 정보 없음 (아이디 또는 비밀번호 미등록)`
          ).catch(() => {})
        } else {
          const accountPhone = accountUser.phone.replace(/-/g, '')
          const ACCOUNT_TEMPLATE = 'KA01TP260404141110684azipFQYSyxX'
          const APP_URL = 'https://bbk-app.vercel.app'

          // 카카오 알림톡
          await sendAlimtalk(
            accountPhone,
            ACCOUNT_TEMPLATE,
            {
              '아이디':   accountUser.phone,
              '비밀번호': accountUser.password_hint,
              '앱URL':    APP_URL,
            },
            `[BBK 공간케어] ${app.owner_name ?? ''}님, 고객 포털 계정을 안내드립니다.\n아이디: ${accountUser.phone}\n비밀번호: ${accountUser.password_hint}\n접속: ${APP_URL}`
          )

          const accountNow = new Date().toISOString()

          // account_sent_at 기록
          await supabase
            .from('users')
            .update({ account_sent_at: accountNow })
            .eq('phone', accountUser.phone)

          // notification_log에 추가
          const accountEntry: NotificationLogEntry = {
            type: '계정안내알림', sent_at: accountNow,
            phone: accountPhone, method: 'auto', template_id: ACCOUNT_TEMPLATE,
          }
          await supabase
            .from('service_applications')
            .update({ notification_log: [accountEntry, ...updatedLog] })
            .eq('id', application_id)

          await saveNotificationHistory({
            category: 'alimtalk',
            type: '계정안내알림',
            body: `계정안내알림 자동 발송 — ${app.owner_name ?? ''} (${accountPhone})`,
            title: '계정안내알림',
            method: 'auto',
            recipientType: 'customer',
            recipientName: String(app.owner_name ?? ''),
            recipientPhone: accountPhone,
            metadata: { application_id, trigger: '작업완료알림' },
            status: 'sent',
          })
        }
      } catch {
        // 계정안내알림 실패는 메인 응답에 영향 없음
      }
    }

    return NextResponse.json({ success: true, new_status: newStatus ?? null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
