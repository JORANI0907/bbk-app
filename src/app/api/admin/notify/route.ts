import { NextRequest, NextResponse } from 'next/server'
import { sendSMS } from '@/lib/solapi'
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
// 이건 legacy status 컬럼용이라 하드코딩 유지 (도메인 의미가 코드에 고정).
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

// Phase 27-AQ: 진행상태·결제상태 하드코딩 매핑 제거.
// → notification_templates.linked_progress_status / linked_payment_status 로 이관.
// 관리자가 새 template 추가 시에도 관리 페이지 dropdown 으로 상태 연결을 지정 가능.
// 발송 직전에 template row 를 조회해 두 필드를 읽어 자동 업데이트.

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
  channel?: 'sms' | 'lms'
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

    // 게이팅: notification_templates(code=type) 에 등록된 활성 템플릿이 있어야 진행
    // 단, '작업완료알림'은 아래에서 세분화 후 재검증하므로 여기서 통과시킴
    if (type !== '작업완료알림') {
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
      const { data: dbTpl } = await supabase
        .from('notification_templates')
        .select('id, is_active')
        .eq('code', type)
        .maybeSingle()
      if (!dbTpl || dbTpl.is_active === false) {
        return NextResponse.json({ error: `알 수 없는 알림 유형입니다: ${type}` }, { status: 400 })
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
    const sendErrors: string[] = []
    const channelsUsed: Array<'sms' | 'lms'> = []
    for (const target of targets) {
      const smsResult = await sendByTemplate(type, target, {
        application: app as NotificationContext['application'],
      })
      if (smsResult.ok) {
        channelsUsed.push(smsResult.type === 'LMS' ? 'lms' : 'sms')
        continue
      }
      sendErrors.push(`${target}: ${smsResult.reason}${smsResult.details ? ` (${smsResult.details})` : ''}`)
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
        : 'SMS'
      sendSlack([
        `📤 *알림 발송* | ${type}`,
        `업체: ${String(app.business_name ?? '-')} / 고객: ${String(app.owner_name ?? '-')} (${targetSummary})`,
        `발송: ${method === 'manual' ? '수동' : '자동'} | 채널: ${channelLabel} | 템플릿: DB(${type})${sendErrorLine}`,
        ``,
        `[적용 변수]`,
        varLines,
        ``,
        `[폴백 SMS]`,
        fallbackText,
      ].join('\n')).catch(() => {})
    }

    // ── 계약상태 자동변경 (Phase 8-B: dual-write + Phase 27-AQ: template.linked_*) ──
    const newStatus = NOTIFY_TO_STATUS[type]
    // Phase 27-AQ: 하드코딩 매핑 → template row 의 linked_* 조회로 이관.
    // 최종 type 이 결정된 후 (작업완료알림 세분화 이후) 조회. 관리자가 관리 페이지에서
    // dropdown 으로 연결한 상태 값이 자동으로 세팅됨. 새 template 추가 시에도 즉시 반영.
    const { data: linkedRow } = await supabase
      .from('notification_templates')
      .select('linked_progress_status, linked_payment_status')
      .eq('code', type)
      .maybeSingle()

    // Phase 29-C: notification_templates에 suffix 없는 code(예약금 입금완료 알림, 결제완료알림(잔금) 등)가
    // 없을 경우를 대비한 payment_status_detail fallback 맵.
    // 웹훅 자동처리 호출 시 service_type suffix가 없는 type이 들어오면 linked_payment_status가 null이 되어
    // payment_status_detail이 업데이트되지 않는 문제를 방지.
    const NOTIFY_TO_PAYMENT_STATUS: Record<string, string> = {
      '예약금 입금완료 알림':  '예약금 입금',
      '결제완료알림(잔금)':    '결제완료(잔금)',
      '결제완료알림':          '결제완료',
      '결제알림':              '결제',
      '결제알림(현금)':        '결제',
      '결제알림(카드,플렛폼)': '결제',
      '계산서발행완료알림':    '계산서발행완료',
      '예약금환급완료알림':    '예약금환급완료',
    }

    const newProgressStatus: string | null = (linkedRow?.linked_progress_status as string | null) ?? null
    const newPaymentStatusDetail: string | null =
      (linkedRow?.linked_payment_status as string | null) ??
      NOTIFY_TO_PAYMENT_STATUS[type] ??
      null
    const nowIso = new Date().toISOString()

    // ── notification_log append ────────────────────────────────────
    const existingLog: NotificationLogEntry[] = Array.isArray(app.notification_log)
      ? (app.notification_log as NotificationLogEntry[])
      : []

    // 실제 발송된 번호(들)를 기록. 두 번호 발송 시 콤마 구분.
    const sentPhoneRecord = targets.join(',')
    const primaryChannel: 'sms' | 'lms' = channelsUsed[0] ?? 'sms'
    const newEntry: NotificationLogEntry = {
      type, sent_at: nowIso, phone: sentPhoneRecord, method,
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
    await saveNotificationHistory({
      category: 'sms',
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

    // ── Phase 27-BA: 작업완료알림 직후 부가 전달 (customer 특이사항 제거) ──
    // 이전(Phase 27-M): customer_memo 를 별도 SMS 로 고객에게 후행 발송 + admin Slack.
    // 변경 이유: 문자알림 관리 탭에 없는 자동 발송 채널이라 관리 불가능하고,
    // 이제 customer_memo 는 작업완료알림 알림톡 템플릿에 녹여져 있어 중복 발송.
    // → customer 향 SMS 와 관련 admin Slack(고객 전달 특이사항) 완전 삭제.
    // internal_memo → admin Slack 은 원래부터 관리자 전용 정보라 그대로 유지.
    if (
      type === '작업완료알림' ||
      type === '작업완료알림(현금)' ||
      type === '작업완료알림(카드,플렛폼)' ||
      type === '작업완료알림(정기엔드케어)'
    ) {
      const internalMemo = String(app.internal_memo ?? '').trim()
      const businessName = String(app.business_name ?? '')
      const ownerName = String(app.owner_name ?? '')
      const serviceType = String(app.service_type ?? '')
      const constructionDate = String(app.construction_date ?? '').slice(0, 10)

      // 내부 메모 → 관리자 Slack 만 (관리자 전용, 고객 미노출)
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

    // Phase 27-AQ: 프론트 옵티미스틱 업데이트가 응답 값 그대로 반영하도록 확장
    return NextResponse.json({
      success: true,
      new_status: newStatus ?? null,
      new_progress_status: newProgressStatus,
      new_payment_status_detail: newPaymentStatusDetail,
      final_type: type,   // 작업완료알림이 세분화된 최종 code (프론트 알림 이력 표기용)
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
