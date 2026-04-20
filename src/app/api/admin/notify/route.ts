import { NextRequest, NextResponse } from 'next/server'
import { sendAlimtalk, sendSMS } from '@/lib/solapi'
import { createServiceClient } from '@/lib/supabase/server'
import { notifySlack } from '@/lib/slack'

const WORKER_NOTIFY_TYPE = '작업자 일정 안내'

// ─── 계약상태 자동변경 매핑 ────────────────────────────────────────
const NOTIFY_TO_STATUS: Record<string, string> = {
  '예약확정알림':       '예약확정',
  '예약1일전알림':      '예약1일전',
  '예약당일알림':       '예약당일',
  '작업완료알림':       '작업완료',
  '결제알림':           '결제',
  '결제완료알림':       '결제완료',
  '결제완료알림(잔금)':   '결제완료(잔금)',
  '예약금 입금완료 알림': '예약금 입금',
  '계산서발행완료알림': '계산서발행완료',
  '예약금환급완료알림': '예약금환급완료',
  '예약취소알림':       '예약취소',
  'A/S방문알림':        'A/S방문',
  '방문견적알림':       '방문견적',
}

// ─── 솔라피 카카오 알림톡 템플릿 ID (최신 자동화 v2) ──────────────
const ALIMTALK_TEMPLATES: Record<string, string> = {
  '예약확정알림':       'KA01TP260324131935207wzarljIsiyK',
  '예약1일전알림':      'KA01TP260324131935294IPmMhH8BWA8',
  '예약당일알림':       'KA01TP2603241319353583492vcrZ9c2',
  '작업완료알림':       'KA01TP260324125200271OOXEk0LPiAS',
  '결제알림':           'KA01TP260324125232471CIIHJKDOBsf',
  '결제완료알림':       'KA01TP260324125232674HVfev9PAzUe',
  '결제완료알림(잔금)':   'KA01TP260324125232674HVfev9PAzUe',
  '예약금 입금완료 알림': 'KA01TP260220102437819kp8ysvD4XqB',
  '계산서발행완료알림': 'KA01TP260324125232783yjmHI9u6j6j',
  '예약금환급완료알림': 'KA01TP260324125232819wDhAV1kuhAF',
  '예약취소알림':       'KA01TP260324125232854lv8CCYK3Ozu',
  'A/S방문알림':        'KA01TP260324125232887FY113tVp5zb',
  '방문견적알림':       'KA01TP260324125232920u1LmrtqCY0P',
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

// ─── 시공시간 기반 요청시간 계산: -1h ~ +2h ───────────────────────
// 예) 10:00 → "09:00 ~ 12:00 사이"
function calcConstructionRequestTime(timeStr: string | null | undefined): string {
  if (!timeStr) return '-'
  const match = timeStr.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return timeStr
  const h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  const startH = (h - 1 + 24) % 24
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
    : calcRequestTime(hoursEnd)
  const driveUrl    = String(app.drive_folder_url ?? '-')
  const bizNum      = String(app.business_number ?? '-')
  const accountNum  = String(app.account_number ?? '-')
  const deposit     = String(app.deposit ?? 0)
  const email       = String(app.email ?? '')
  const emailParts  = email.includes('@') ? email.split('@') : [email, '']

  // 잔금 계산 (supply_amount + vat - deposit)
  const supply  = Number(app.supply_amount ?? 0)
  const vat     = Number(app.vat ?? 0)
  const dep     = Number(app.deposit ?? 0)
  const balance = String(((supply + vat) - dep).toLocaleString('ko-KR'))

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
      return {
        '고객명':     ownerName,
        '구글URL':    driveUrl,
        '청소비용':   balance,
        '입금자고객명': ownerName,
      }
    case '결제알림':
      return {
        '고객명':   ownerName,
        '청소비용': balance,
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
    '작업완료알림':       `[BBK 공간케어] ${name}님, 케어가 완료되었습니다. 감사합니다.`,
    '결제알림':           `[BBK 공간케어] ${name}님, 잔금 결제를 요청드립니다.`,
    '결제완료알림':       `[BBK 공간케어] ${name}님, 결제가 완료되었습니다. 감사합니다.`,
    '결제완료알림(잔금)': `[BBK 공간케어] ${name}님, 잔금 결제가 완료되었습니다. 감사합니다.`,
    '계산서발행완료알림': `[BBK 공간케어] ${name}님, 세금계산서가 발행되었습니다.`,
    '예약금 입금완료 알림': `[BBK 공간케어] ${name}님, 예약금 입금이 확인되었습니다. (${bizName})`,
    '예약금환급완료알림': `[BBK 공간케어] ${name}님, 예약금 환급이 완료되었습니다.`,
    '예약취소알림':       `[BBK 공간케어] ${name}님, 예약이 취소되었습니다.`,
    'A/S방문알림':        `[BBK 공간케어] ${name}님, A/S 방문 일정을 안내드립니다.`,
    '방문견적알림':       `[BBK 공간케어] ${name}님, 방문견적 일정을 안내드립니다.`,
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
    const { application_id, type, method = 'manual' } = await request.json() as {
      application_id: string
      type: string
      method?: 'auto' | 'manual'
    }
    if (!application_id || !type) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // ── 작업자 일정 안내 SMS (별도 처리) ──────────────────────────
    if (type === WORKER_NOTIFY_TYPE) {
      const { data: app } = await supabase
        .from('service_applications')
        .select('*')
        .eq('id', application_id)
        .single()
      if (!app) return NextResponse.json({ error: '신청서를 찾을 수 없습니다.' }, { status: 404 })
      if (!app.assigned_to) return NextResponse.json({ error: '담당 작업자가 배정되지 않았습니다.' }, { status: 400 })

      const { data: worker } = await supabase
        .from('workers')
        .select('name, phone')
        .eq('id', app.assigned_to)
        .single()
      if (!worker?.phone) return NextResponse.json({ error: '작업자 전화번호가 없습니다.' }, { status: 400 })

      const date = app.construction_date?.slice(0, 10) ?? '-'
      const start = app.business_hours_start ?? '-'
      const end = app.business_hours_end ?? '-'
      const scope = app.care_scope ?? app.request_notes ?? '-'
      const ctTime = app.construction_time as string | null | undefined
      const timeLine = ctTime
        ? `시공시간: ${ctTime.slice(0, 5)}시`
        : `시간: ${start} ~ ${end}`
      const smsText =
        `[BBK 공간케어] ${worker.name ?? ''}님 일정 안내\n` +
        `업체: ${app.business_name ?? '-'}\n` +
        `주소: ${app.address ?? '-'}\n` +
        `일자: ${date}\n` +
        `${timeLine}\n` +
        `케어범위: ${scope}`

      await sendSMS(worker.phone, smsText)

      const nowIso = new Date().toISOString()
      const existingLog = Array.isArray(app.notification_log) ? app.notification_log : []
      const newEntry = { type, sent_at: nowIso, phone: worker.phone, method }
      await supabase
        .from('service_applications')
        .update({ notification_log: [newEntry, ...existingLog] })
        .eq('id', application_id)

      return NextResponse.json({ success: true, new_status: null, worker_phone: worker.phone })
    }

    const templateId = ALIMTALK_TEMPLATES[type]
    if (!templateId) {
      return NextResponse.json({ error: '알 수 없는 알림 유형입니다.' }, { status: 400 })
    }

    // 신청서 + 담당자 이름 조회
    const { data: app } = await supabase
      .from('service_applications')
      .select('*')
      .eq('id', application_id)
      .single()

    if (!app) return NextResponse.json({ error: '신청서를 찾을 수 없습니다.' }, { status: 404 })

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
    if (type === '작업완료알림') {
      dbUpdates.notification_sent_at = nowIso
      dbUpdates.notification_send_at = null
    }

    await supabase
      .from('service_applications')
      .update(dbUpdates)
      .eq('id', application_id)

    // ── Slack 보고 ──────────────────────────────────────────────────
    await notifySlack({
      notifyType: type,
      customerName: app.owner_name ?? '',
      phone,
      businessName: app.business_name ?? '',
      constructionDate: app.construction_date?.slice(0, 10) ?? null,
      method,
    }).catch(() => { /* Slack 실패는 무시 */ })

    return NextResponse.json({ success: true, new_status: newStatus ?? null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
