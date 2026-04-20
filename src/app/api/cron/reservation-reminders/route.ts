import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendAlimtalk } from '@/lib/solapi'

const CRON_SECRET = process.env.CRON_SECRET

// ─── 알림톡 템플릿 ID ─────────────────────────────────────────────
const TEMPLATES = {
  '예약1일전알림': 'KA01TP260324131935294IPmMhH8BWA8',
  '예약당일알림':  'KA01TP2603241319353583492vcrZ9c2',
  '결제알림':      'KA01TP260324125232471CIIHJKDOBsf',
}

// ─── 시공시간 기반 요청시간 계산: -1h ~ +2h ───────────────────────
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

// ─── KST 기준 오늘/내일 날짜 계산 ────────────────────────────────
function getKSTDates() {
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const todayKST = nowKST.toISOString().slice(0, 10)
  const tomorrowKST = new Date(nowKST.getTime() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  return { todayKST, tomorrowKST }
}

// ─── 알림 유형별 변수 빌더 ────────────────────────────────────────
function buildVariables(
  type: keyof typeof TEMPLATES,
  app: Record<string, unknown>,
  assignedName: string,
): Record<string, string> {
  const ownerName    = String(app.owner_name ?? '')
  const businessName = String(app.business_name ?? '')
  const serviceType  = String(app.service_type ?? '')
  const address      = String(app.address ?? '')
  const date         = (app.construction_date as string | null)?.slice(0, 10) ?? ''
  const hoursStart   = String(app.business_hours_start ?? '-')
  const supply       = Number(app.supply_amount ?? 0)
  const vat          = Number(app.vat ?? 0)
  const dep          = Number(app.deposit ?? 0)
  const balance      = ((supply + vat) - dep).toLocaleString('ko-KR')

  switch (type) {
    case '예약1일전알림':
    case '예약당일알림': {
      const preMeetingAt    = app.pre_meeting_at as string | null | undefined
      const constructionTime = app.construction_time as string | null | undefined
      const meetingYN   = preMeetingAt ? '진행 예정' : '-'
      const meetingTime = preMeetingAt
        ? new Date(preMeetingAt).toLocaleString('ko-KR', {
            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
          })
        : '-'
      const requestTime = constructionTime
        ? calcConstructionRequestTime(constructionTime)
        : hoursStart
      return {
        '고객명':   ownerName,
        '상호명':   businessName,
        '케어유형': serviceType,
        '담당자':   assignedName || '-',
        '주소':     address,
        '시공일자': date,
        '요청시간': requestTime,
        '미팅여부': meetingYN,
        '미팅시간': meetingTime,
      }
    }
    case '결제알림':
      return {
        '고객명':   ownerName,
        '청소비용': balance,
      }
  }
}

function buildFallback(type: keyof typeof TEMPLATES, app: Record<string, unknown>): string {
  const name    = String(app.owner_name ?? '')
  const bizName = String(app.business_name ?? '')
  switch (type) {
    case '예약1일전알림': return `[BBK 공간케어] ${name}님, 내일 ${bizName} 방문 예정입니다.`
    case '예약당일알림':  return `[BBK 공간케어] ${name}님, 오늘 방문 예정입니다. 준비 확인 부탁드립니다.`
    case '결제알림':      return `[BBK 공간케어] ${name}님, 잔금 결제를 요청드립니다.`
  }
}

// ─── notification_log에 해당 type이 오늘 이미 발송됐는지 확인 ─────
function alreadySentToday(
  log: Array<{ type: string; sent_at: string }>,
  type: string,
  todayKST: string,
): boolean {
  return log.some(
    (entry) => entry.type === type && entry.sent_at.slice(0, 10) === todayKST,
  )
}

// ─── notification_log에 해당 type이 한 번이라도 발송됐는지 확인 ───
function alreadySentEver(
  log: Array<{ type: string }>,
  type: string,
): boolean {
  return log.some((entry) => entry.type === type)
}

// ─── 단일 알림 발송 + log 업데이트 ───────────────────────────────
async function sendAndLog(
  supabase: ReturnType<typeof createServiceClient>,
  app: Record<string, unknown>,
  type: keyof typeof TEMPLATES,
  assignedName: string,
  notifyToStatus: Record<string, string>,
): Promise<void> {
  const templateId = TEMPLATES[type]
  const phone      = String(app.phone ?? '').replace(/-/g, '')
  const variables  = buildVariables(type, app, assignedName)
  const fallback   = buildFallback(type, app)

  await sendAlimtalk(phone, templateId, variables, fallback)

  const nowIso    = new Date().toISOString()
  const existLog  = Array.isArray(app.notification_log)
    ? (app.notification_log as Array<{ type: string; sent_at: string; phone: string; method: string }>)
    : []
  const newEntry  = { type, sent_at: nowIso, phone, method: 'auto' as const, template_id: templateId }
  const updatedLog = [newEntry, ...existLog]

  const updates: Record<string, unknown> = { notification_log: updatedLog }
  const newStatus = notifyToStatus[type]
  if (newStatus) updates.status = newStatus

  const { error } = await supabase
    .from('service_applications')
    .update(updates)
    .eq('id', app.id as string)

  if (error) throw new Error(`DB 업데이트 실패: ${error.message}`)
}

// ─── 메인 핸들러 ─────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { todayKST, tomorrowKST } = getKSTDates()
  const supabase = createServiceClient()

  const NOTIFY_TO_STATUS: Record<string, string> = {
    '예약1일전알림': '예약1일전',
    '예약당일알림':  '예약당일',
    '결제알림':      '결제',
  }

  // 담당자 이름 캐싱 (N+1 방지)
  const userNameCache: Record<string, string> = {}
  async function getAssignedName(userId: string | null): Promise<string> {
    if (!userId) return '-'
    if (userNameCache[userId]) return userNameCache[userId]
    const { data: u } = await supabase.from('users').select('name').eq('id', userId).single()
    const name = u?.name ?? '-'
    userNameCache[userId] = name
    return name
  }

  const results: { type: string; sent: number; failed: number; skipped: number }[] = []

  // ── 1. 예약1일전알림: 내일 시공 + 예약확정 + 담당자 배정 ──────────
  //     정기엔드케어는 예약당일 알림만 발송 (1일전/결제 제외)
  {
    const { data: apps } = await supabase
      .from('service_applications')
      .select('*')
      .eq('status', '예약확정')
      .eq('construction_date', tomorrowKST)
      .not('assigned_to', 'is', null)
      .neq('service_type', '정기엔드케어')

    let sent = 0, failed = 0, skipped = 0
    for (const app of (apps ?? [])) {
      if (!app.phone) { skipped++; continue }
      const log = Array.isArray(app.notification_log) ? app.notification_log : []
      if (alreadySentToday(log, '예약1일전알림', todayKST)) { skipped++; continue }

      const assignedName = await getAssignedName(app.assigned_to as string | null)
      try {
        await sendAndLog(supabase, app as Record<string, unknown>, '예약1일전알림', assignedName, NOTIFY_TO_STATUS)
        sent++
      } catch { failed++ }
    }
    results.push({ type: '예약1일전알림', sent, failed, skipped })
  }

  // ── 2. 예약당일알림: 오늘 시공 + (예약확정|예약1일전) + 담당자 배정 ─
  {
    const { data: apps } = await supabase
      .from('service_applications')
      .select('*')
      .in('status', ['예약확정', '예약1일전'])
      .eq('construction_date', todayKST)
      .not('assigned_to', 'is', null)

    let sent = 0, failed = 0, skipped = 0
    for (const app of (apps ?? [])) {
      if (!app.phone) { skipped++; continue }
      const log = Array.isArray(app.notification_log) ? app.notification_log : []
      if (alreadySentToday(log, '예약당일알림', todayKST)) { skipped++; continue }

      const assignedName = await getAssignedName(app.assigned_to as string | null)
      try {
        await sendAndLog(supabase, app as Record<string, unknown>, '예약당일알림', assignedName, NOTIFY_TO_STATUS)
        sent++
      } catch { failed++ }
    }
    results.push({ type: '예약당일알림', sent, failed, skipped })
  }

  // ── 3. 결제알림: 작업완료(딥/엔드) + 결제알림 미발송 ─────────────
  //     정기엔드케어는 결제알림 발송 제외
  {
    const { data: apps } = await supabase
      .from('service_applications')
      .select('*')
      .in('status', ['작업완료', '작업완료(엔드)'])
      .neq('service_type', '정기엔드케어')

    let sent = 0, failed = 0, skipped = 0
    for (const app of (apps ?? [])) {
      if (!app.phone) { skipped++; continue }
      const log = Array.isArray(app.notification_log) ? app.notification_log : []
      if (alreadySentEver(log, '결제알림')) { skipped++; continue }

      try {
        await sendAndLog(supabase, app as Record<string, unknown>, '결제알림', '-', NOTIFY_TO_STATUS)
        sent++
      } catch { failed++ }
    }
    results.push({ type: '결제알림', sent, failed, skipped })
  }

  return NextResponse.json({ ok: true, date: todayKST, results })
}
