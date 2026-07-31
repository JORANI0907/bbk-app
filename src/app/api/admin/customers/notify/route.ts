import { NextRequest, NextResponse } from 'next/server'
import { sendAlimtalk, sendSMS } from '@/lib/solapi'
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

// ─── 알림톡 템플릿 ID (서비스관리 notify와 동기화) ─────────────────
const ALIMTALK_TEMPLATES: Record<string, string> = {
  // 기존 customer 알림
  '정기결제알림': 'KA01TP260324125257636A2QdT1YNpL5',
  // Phase 29: 신설 — 결제방법별 정기결제 알림 (카카오 채널 심사 후 ID 채울 것)
  '정기결제알림(현금)': '',
  '정기결제알림(카드)': '',
  '정기방문알림': 'KA01TP260324125257699vIDeuYdkbc0',
  '계약갱신알림': 'KA01TP260324125257737g0vuFScqrCv',
  '건당결제알림': 'KA01TP260324125257773XLuybvXeleL',
  '방문견적알림': 'KA01TP260324125232920u1LmrtqCY0P',
  '작업완료알림': 'KA01TP260324125200271OOXEk0LPiAS',
  '계정안내알림': 'KA01TP260324125257807O2QPegF6wmS',
  // 신청서 라이프사이클 이관 (Phase A-2)
  '예약확정알림':       'KA01TP260324131935207wzarljIsiyK',
  '예약1일전알림':      'KA01TP260324131935294IPmMhH8BWA8',
  '예약당일알림':       'KA01TP2603241319353583492vcrZ9c2',
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
}

const fmtDate = (d: string | null | undefined): string =>
  d ? d.slice(0, 10).replace(/-/g, '.') : '-'
const fmt = (n: number | null | undefined): string =>
  n == null ? '0' : n.toLocaleString('ko-KR')

// ─── 시공시간 기반 요청시간 계산: 0h ~ +2h ────────────────────────
function calcConstructionRequestTime(timeStr: string | null | undefined): string {
  if (!timeStr) return '-'
  const match = timeStr.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return timeStr
  const h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  const startH = h % 24
  const endH   = (h + 2) % 24
  const pad = (hour: number) => `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return `${pad(startH)} ~ ${pad(endH)} 사이`
}

// ─── 변수 빌더 (customer 컨텍스트 매핑) ────────────────────────────
function buildVariables(
  type: string,
  customer: Record<string, unknown>,
  assignedUserName: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  const name       = String(customer.contact_name ?? '')
  const bizName    = String(customer.business_name ?? '')
  const phone      = String(customer.contact_phone ?? '')
  const careType   = String(customer.customer_type ?? customer.billing_cycle ?? '-')
  const address    = String(customer.address ?? '-')
  const nextVisit  = fmtDate(customer.next_visit_date as string | null)
  const nextBill   = fmtDate(customer.billing_next_date as string | null)
  const contractEnd = fmtDate(customer.contract_end_date as string | null)
  const hoursStart = String(customer.business_hours_start ?? '-')
  const driveUrl   = extra.drive_url ?? String(customer.drive_folder_url ?? '-')
  const billingAmt = fmt(customer.billing_amount as number | null)
  const unitPrice  = fmt(customer.unit_price as number | null)
  const constructionTime = customer.construction_time as string | null | undefined
  const requestTime = constructionTime ? calcConstructionRequestTime(constructionTime) : ''
  const bizNum     = String(customer.business_number ?? '-')
  const accountNum = String(customer.account_number ?? '-')
  const deposit    = String(customer.deposit ?? 0)
  const email      = String(customer.email ?? '')
  const emailParts = email.includes('@') ? email.split('@') : [email, '']
  const supply     = Number(customer.supply_amount ?? 0)
  const vat        = Number(customer.vat ?? 0)
  const dep        = Number(customer.deposit ?? 0)
  const total      = String((supply + vat).toLocaleString('ko-KR'))
  const balance    = String(((supply + vat) - dep).toLocaleString('ko-KR'))

  switch (type) {
    // ── 정기 고객 알림 (기존 유지) ────────────────────────────────
    case '정기결제알림':
      return { '#{고객명}': name, '#{청소비용}': billingAmt }
    case '정기결제알림(현금)':
      return { '#{고객명}': name, '#{청소비용}': billingAmt }
    case '정기결제알림(카드)':
      return { '#{고객명}': name, '#{청소비용}': billingAmt }
    case '건당결제알림':
      return { '#{고객명}': name, '#{청소비용}': unitPrice }
    case '정기방문알림':
      return { '#{고객명}': name, '#{상호명}': bizName, '#{방문예정일}': nextVisit }
    case '계약갱신알림':
      return { '#{고객명}': name, '#{상호명}': bizName, '#{만료일}': contractEnd }
    case '계정안내알림':
      return {
        '#{고객명}':  name,
        '#{아이디}':  extra.login_id ?? phone.replace(/-/g, ''),
        '#{비밀번호}': extra.login_pw ?? '-',
      }

    // ── 신청서 라이프사이클 알림 (Phase A-2 이관) ──────────────────
    case '예약확정알림':
      return {
        '고객명':     name,
        '고객연락처': phone,
        '상호명':     bizName,
        '케어유형':   careType,
        '담당자':     assignedUserName || '-',
        '주소':       address,
        '시공일자':   nextVisit !== '-' ? nextVisit : (extra.visit_date ?? '-'),
        '요청시간':   requestTime,
        '미팅여부':   '-',
        '미팅시간':   '-',
      }
    case '예약1일전알림':
    case '예약당일알림':
      return {
        '고객명':   name,
        '상호명':   bizName,
        '케어유형': careType,
        '담당자':   assignedUserName || '-',
        '주소':     address,
        '시공일자': nextVisit !== '-' ? nextVisit : (extra.visit_date ?? '-'),
        '요청시간': requestTime,
        '미팅여부': '-',
        '미팅시간': '-',
      }
    case '작업완료알림':
      return {
        '#{고객명}':       name,
        '#{구글URL}':      driveUrl,
        '#{청소비용}':     balance,
        '#{입금자고객명}': name,
      }
    case '작업완료알림(현금)':
      return {
        '고객명':       name,
        '구글URL':      driveUrl,
        '현금잔금':     balance,
        '입금자고객명': name,
      }
    case '작업완료알림(카드,플렛폼)':
      return {
        '고객명':       name,
        '구글URL':      driveUrl,
        '청소비용':     total,
        '입금자고객명': name,
      }
    case '작업완료알림(정기엔드케어)':
      return {
        '고객명':  name,
        '구글URL': driveUrl,
      }
    case '결제알림':
      return { '고객명': name, '청소비용': balance }
    case '결제알림(현금)':
      return { '고객명': name, '청소현금비용': balance }
    case '결제알림(카드,플렛폼)':
      return { '고객명': name, '청소카드비용': total }
    case '결제완료알림':
    case '결제완료알림(잔금)':
      return {
        '고객명':       name,
        '사업자등록번호': bizNum,
        '페이백계좌번호': accountNum,
      }
    case '계산서발행완료알림':
      return {
        '고객명':       name,
        '이메일아이디': emailParts[0] || '-',
        '이메일도메인': emailParts[1] || '-',
      }
    case '예약금 입금완료 알림':
      return {
        '고객명':   name,
        '상호명':   bizName,
        '예약금':   deposit,
        '시공일자': nextVisit !== '-' ? nextVisit : (extra.visit_date ?? '-'),
      }
    case '예약금환급완료알림':
      return {
        '고객명':   name,
        '계좌번호': accountNum,
        '예약금':   deposit,
      }
    case '예약취소알림':
      return {
        '고객명':   name,
        '성함':     name,
        '연락처':   phone,
        '케어유형': careType,
        '시공일자': nextVisit !== '-' ? nextVisit : (extra.visit_date ?? '-'),
      }
    case 'A/S방문알림':
      return {
        '고객명':   name,
        '성함':     name,
        '연락처':   phone,
        '케어유형': careType,
        '시공일자': nextVisit !== '-' ? nextVisit : (extra.visit_date ?? '-'),
        '방문시간': hoursStart,
      }
    case '방문견적알림':
      return {
        '#{고객명}':   name,
        '#{성함}':     name,
        '#{연락처}':   phone,
        '#{케어유형}': careType,
        '#{시공일자}': nextVisit !== '-' ? nextVisit : (extra.visit_date ?? '-'),
        '#{방문시간}': extra.visit_time ?? (constructionTime ?? hoursStart),
      }
    default:
      return { '#{고객명}': name }
  }
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
  template_id?: string
  channel?: 'sms' | 'lms' | 'alimtalk'
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
    const { customer_id, type, method = 'manual', ...extra } = body

    if (!customer_id || !type) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 게이팅: (a) 레거시 카톡 템플릿 매핑에 있거나 (b) notification_templates에 code로 등록된 신규 템플릿이면 OK
    // Phase 27-AR: linked_progress_status / linked_payment_status 도 함께 조회 → 발송 성공 시 customer 자동 갱신.
    const legacyTemplateId: string | null = ALIMTALK_TEMPLATES[type] ?? null
    const { data: dbTpl } = await supabase
      .from('notification_templates')
      .select('id, is_active, linked_progress_status, linked_payment_status')
      .eq('code', type)
      .maybeSingle()
    const hasDbTemplate = !!dbTpl && dbTpl.is_active !== false
    const linkedProgress: string | null = (dbTpl?.linked_progress_status as string | null) ?? null
    const linkedPayment: string | null = (dbTpl?.linked_payment_status as string | null) ?? null
    if (!legacyTemplateId && !hasDbTemplate) {
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

    // 담당자 이름 조회 (예약 안내 등에서 사용)
    let assignedUserName = '-'
    if (customer.assigned_user_id) {
      const { data: userRow } = await supabase
        .from('users')
        .select('name')
        .eq('id', customer.assigned_user_id)
        .single()
      if (userRow?.name) assignedUserName = userRow.name
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

    const variables = buildVariables(
      type,
      customer as Record<string, unknown>,
      assignedUserName,
      extra as Record<string, string>,
    )
    const fallbackText = buildFallback(type, customer as Record<string, unknown>)

    // 번호별 발송
    // Phase 25e: notification_templates code 기반 SMS 우선 → 실패 시 legacy 카톡 fallback (legacy ID 있을 때만)
    const sendErrors: string[] = []
    const channelsUsed: Array<'sms' | 'lms' | 'alimtalk'> = []
    for (const target of targets) {
      const smsResult = await sendByTemplate(type, target, {
        customer: customer as NotificationContext['customer'],
      })
      if (smsResult.ok) {
        channelsUsed.push(smsResult.type === 'LMS' ? 'lms' : 'sms')
        continue
      }
      // legacy 카톡 ID가 없는 신규 템플릿은 SMS 실패 시 그대로 오류 처리
      if (!legacyTemplateId) {
        sendErrors.push(`${target}: ${smsResult.reason}${smsResult.details ? ` (${smsResult.details})` : ''}`)
        continue
      }
      try {
        await sendAlimtalk(target, legacyTemplateId, variables, fallbackText)
        channelsUsed.push('alimtalk')
      } catch (err) {
        // 건당결제알림은 SMS로 자동 전환
        if (type === '건당결제알림') {
          try {
            await sendSMS(target, fallbackText)
            channelsUsed.push('sms')
          } catch (smsErr) {
            const msg = smsErr instanceof Error ? smsErr.message : String(smsErr)
            sendErrors.push(`${target}: ${msg}`)
          }
        } else {
          const msg = err instanceof Error ? err.message : String(err)
          sendErrors.push(`${target}: ${msg}`)
        }
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
    const primaryChannel: 'sms' | 'lms' | 'alimtalk' = channelsUsed[0] ?? (legacyTemplateId ? 'alimtalk' : 'sms')
    const newEntry: NotificationLogEntry = {
      type, sent_at: nowIso, phone: sentPhoneRecord, method,
      template_id: legacyTemplateId ?? undefined,
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

    // 알림 이력 저장 (감사·통계용) — channel 반영
    const historyCategory: 'alimtalk' | 'sms' =
      primaryChannel === 'alimtalk' ? 'alimtalk' : 'sms'
    await saveNotificationHistory({
      category: historyCategory,
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

    // Slack 리포트
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
      `📤 *고객 알림 발송* | ${type}`,
      `업체: ${String(customer.business_name ?? '-')} / 고객: ${String(customer.contact_name ?? '-')} (${targetSummary})`,
      `발송: ${method === 'manual' ? '수동' : '자동'} | 채널: ${channelLabel} | 템플릿: ${legacyTemplateId ?? `DB(${type})`}${sendErrorLine}`,
      ``,
      `[적용 변수]`,
      varLines,
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
