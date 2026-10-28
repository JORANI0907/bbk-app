/**
 * 정기 진행흐름 조회 API (2026-10-17 Phase C)
 *
 * RegularProgressFlow 컴포넌트가 쓰는 통합 조회 엔드포인트.
 * service_billings(결제) + service_applications(방문) + workers(담당자) 을 JOIN 후
 * 월/연도 단위로 그룹핑해서 반환.
 *
 * 입력:
 *   GET /api/admin/customers/{id}/regular-progress?year=2026&cycle=월간
 *     year: 조회할 연도 (default: 올해)
 *     cycle: '월간' | '연간' (default: '월간')
 *
 * 출력:
 *   { periods: [{ key, year, month, label, billings: [...], visits: [...] }] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

type BillingStatus = 'paid' | 'pending' | 'overdue'
type VisitStatus = 'done' | 'scheduled' | 'canceled'

interface BillingItem {
  id: string
  label: string
  amount: number
  dueDate: string
  paidDate?: string
  status: BillingStatus
  // Phase E: 모달 편집용
  billingType: string      // 'monthly' | 'annual' | 'onetime'
  billingPeriod: string    // '2026-11' or '2026'
  taxInvoiceIssued: boolean
  // Phase H.5-rev: 결제링크 복사용
  paymentUrl?: string
}

interface VisitItem {
  id: string
  date: string
  worker: string
  status: VisitStatus
  // 모달용 확장 필드
  assignedTo?: string         // Phase F: 담당자 변경용 UUID
  constructionTime?: string
  progressStatus?: string
  paymentStatus?: string
  careScope?: string
  adminRequest?: string
  adminMemo?: string
  notificationSent?: boolean
  // Phase G1: 미니 진행흐름용 상태 필드
  depositPaidAt?: string      // 예약금 입금일
  workCompletedAt?: string    // 작업완료일
  balancePaidAt?: string      // 잔금 결제일
  taxInvoiceIssued?: boolean  // 세금계산서 발행 여부
  // Phase G2: 알림 발송 이력
  notificationLog?: Array<{ type: string; sent_at: string; method?: string }>
  // Phase H.5-rev: 그 방문이 속한 월의 service_billings 결제 완료 여부 (정기딥/엔드 매핑)
  monthlyBillingPaid?: boolean
  // 2026-10-29: 회차별 작업자 (work_assignments.worker_id[]) — 투입일정 모달 수정용
  workerIds?: string[]
}

interface PeriodBundle {
  key: string
  year: number
  month: number | null
  label: string
  billings: BillingItem[]
  visits: VisitItem[]
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: customerId } = await params
    const url = new URL(request.url)
    const year = parseInt(url.searchParams.get('year') ?? String(new Date().getFullYear()), 10)
    const cycle = url.searchParams.get('cycle') ?? '월간'
    const isAnnual = cycle === '연간'

    const supabase = createServiceClient()

    // 연간이면 3년치, 월간이면 선택 연도만
    const yearStart = isAnnual ? `${year - 1}-01-01` : `${year}-01-01`
    const yearEnd   = isAnnual ? `${year + 1}-12-31` : `${year}-12-31`

    // 1) service_billings 조회 (payment_url 포함 — DB 마이그레이션 apply 완료)
    const { data: billings } = await supabase
      .from('service_billings')
      .select('id, billing_type, billing_period, amount, due_date, paid_date, status, tax_invoice_issued, payment_url')
      .eq('customer_id', customerId)
      .gte('due_date', yearStart)
      .lte('due_date', yearEnd)
      .order('due_date', { ascending: true })

    // 2) service_applications 조회 (해당 고객의 방문 건들)
    const { data: applications } = await supabase
      .from('service_applications')
      .select('id, construction_date, construction_time, assigned_to, progress_status, payment_status_detail, care_scope, request_notes, admin_notes, work_completed_at, notification_sent_at, deposit_paid_at, balance_paid_at, tax_invoice_issued, notification_log')
      .eq('customer_id', customerId)
      .gte('construction_date', yearStart)
      .lte('construction_date', yearEnd)
      .is('deleted_at', null)
      .order('construction_date', { ascending: true })

    // 3) 담당자 이름 조회
    const assignedIds = Array.from(
      new Set((applications ?? []).map(a => a.assigned_to).filter(Boolean) as string[]),
    )
    const workerMap = new Map<string, string>()
    if (assignedIds.length > 0) {
      // users 와 workers 양쪽에서 이름 찾기 (assigned_to 가 users.id 인 경우가 많음)
      const { data: userRows } = await supabase
        .from('users').select('id, name').in('id', assignedIds)
      for (const u of (userRows ?? [])) {
        if (u.name) workerMap.set(u.id, u.name as string)
      }
      const { data: workerRows } = await supabase
        .from('workers').select('id, name').in('id', assignedIds)
      for (const w of (workerRows ?? [])) {
        if (w.name && !workerMap.has(w.id)) workerMap.set(w.id, w.name as string)
      }
    }

    // 4) 월/연도별 그룹핑
    const periods: PeriodBundle[] = []

    if (isAnnual) {
      for (let y = year - 1; y <= year + 1; y++) {
        periods.push(buildAnnualPeriod(y, billings ?? [], applications ?? [], workerMap))
      }
    } else {
      for (let m = 1; m <= 12; m++) {
        periods.push(buildMonthlyPeriod(year, m, billings ?? [], applications ?? [], workerMap))
      }
    }

    // 4-1) 회차별 작업자(work_assignments) 매핑 + 선택용 작업자 목록 (2026-10-29)
    const workerIdsByApp = await loadWorkerIdsByApp(supabase, (applications ?? []).map(a => a.id as string))
    const periodsWithWorkers = periods.map(p => ({
      ...p,
      visits: p.visits.map(v => ({ ...v, workerIds: workerIdsByApp.get(v.id) ?? [] })),
    }))
    // workers 테이블엔 deleted_at 없음 — 고객관리 투입 설정과 같은 기준(고용형태 지정된 작업자)
    const { data: workerList, error: workerErr } = await supabase
      .from('workers')
      .select('id, name')
      .not('employment_type', 'is', null)
      .order('name', { ascending: true })
    if (workerErr) console.error('[regular-progress] 작업자 목록 조회 실패:', workerErr.message)
    const availableWorkers = (workerList ?? [])
      .filter(w => w.name)
      .map(w => ({ id: w.id as string, name: w.name as string }))

    // 5) Phase F: 담당자 변경용 전체 users 리스트
    const { data: allUsers } = await supabase
      .from('users')
      .select('id, name')
      .order('name', { ascending: true })
    const availableAssignees = (allUsers ?? [])
      .filter(u => u.name)
      .map(u => ({ id: u.id as string, name: u.name as string }))

    return NextResponse.json({ periods: periodsWithWorkers, availableAssignees, availableWorkers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── Helpers ──────────────────────────────────────────────────

type RawBilling = {
  id: string; billing_type: string | null; billing_period: string | null
  amount: number | null; due_date: string | null; paid_date: string | null
  status: string | null; tax_invoice_issued: boolean | null
  // payment_url 은 schema apply 후 복원 (지금은 undefined)
  payment_url?: string | null
}
type RawApplication = {
  id: string; construction_date: string | null; construction_time: string | null
  assigned_to: string | null; progress_status: string | null
  payment_status_detail: string | null; care_scope: string | null
  request_notes: string | null; admin_notes: string | null
  work_completed_at: string | null; notification_sent_at: string | null
  deposit_paid_at: string | null; balance_paid_at: string | null
  tax_invoice_issued: boolean | null
  notification_log: unknown
}

function normalizeBillingStatus(status: string | null): BillingStatus {
  if (status === 'paid' || status === 'pending' || status === 'overdue') return status
  return 'pending'
}

function billingTypeLabel(type: string | null): string {
  if (type === 'annual') return '연간'
  if (type === 'onetime') return '추가'
  return '월간'
}

function toBillingItem(b: RawBilling, monthLabel: string): BillingItem {
  return {
    id: b.id,
    label: `${monthLabel} ${billingTypeLabel(b.billing_type)} 청구`,
    amount: Number(b.amount ?? 0),
    dueDate: (b.due_date ?? '').slice(0, 10),
    paidDate: b.paid_date ? b.paid_date.slice(0, 10) : undefined,
    status: normalizeBillingStatus(b.status),
    billingType: b.billing_type ?? 'monthly',
    billingPeriod: b.billing_period ?? '',
    taxInvoiceIssued: b.tax_invoice_issued === true,
    paymentUrl: b.payment_url ?? undefined,
  }
}

/** application_id → worker_id[] (work_assignments) */
async function loadWorkerIdsByApp(
  supabase: ReturnType<typeof createServiceClient>,
  appIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  if (appIds.length === 0) return map
  const { data } = await supabase
    .from('work_assignments')
    .select('application_id, worker_id')
    .in('application_id', appIds)
  for (const r of (data ?? [])) {
    const appId = r.application_id as string | null
    if (!appId || !r.worker_id) continue
    map.set(appId, [...(map.get(appId) ?? []), r.worker_id as string])
  }
  return map
}

// 기존 PATCH /api/admin/billings 가 payment_url 받도록 하기 위해 아래 핸들러 개량은 별도 작업

function toVisitItem(
  a: RawApplication,
  workerMap: Map<string, string>,
  allBillings: RawBilling[],
): VisitItem {
  const workerName = a.assigned_to ? (workerMap.get(a.assigned_to) ?? '미배정') : '미배정'
  const status: VisitStatus = a.work_completed_at
    ? 'done'
    : a.progress_status === '예약취소' || a.progress_status === '취소'
    ? 'canceled'
    : 'scheduled'
  const log = Array.isArray(a.notification_log)
    ? (a.notification_log as Array<{ type: string; sent_at: string; method?: string }>)
    : []

  // Phase H.5-rev: 그 방문이 속한 월(또는 연)의 service_billings 결제 완료 여부 매핑
  // 월간 거래처: billing_period = '2026-10' 매칭. 연간 거래처: '2026' 매칭.
  const dateStr = a.construction_date ?? ''
  const monthKey = dateStr.slice(0, 7)
  const yearKey = dateStr.slice(0, 4)
  const matchedBilling = allBillings.find(b =>
    b.billing_period === monthKey || b.billing_period === yearKey,
  )
  const monthlyBillingPaid = matchedBilling?.status === 'paid'

  return {
    id: a.id,
    date: dateStr.slice(0, 10),
    worker: workerName,
    status,
    assignedTo: a.assigned_to ?? undefined,
    constructionTime: a.construction_time ?? undefined,
    progressStatus: a.progress_status ?? undefined,
    paymentStatus: a.payment_status_detail ?? undefined,
    careScope: a.care_scope ?? undefined,
    adminRequest: a.request_notes ?? undefined,
    adminMemo: a.admin_notes ?? undefined,
    notificationSent: !!a.notification_sent_at,
    depositPaidAt: a.deposit_paid_at ? a.deposit_paid_at.slice(0, 10) : undefined,
    workCompletedAt: a.work_completed_at ? a.work_completed_at.slice(0, 10) : undefined,
    balancePaidAt: a.balance_paid_at ? a.balance_paid_at.slice(0, 10) : undefined,
    taxInvoiceIssued: a.tax_invoice_issued === true,
    notificationLog: log,
    monthlyBillingPaid,
  }
}

function buildMonthlyPeriod(
  year: number, month: number,
  allBillings: RawBilling[], allApplications: RawApplication[],
  workerMap: Map<string, string>,
): PeriodBundle {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`
  const monthLabel = `${month}월`
  const monthBillings = allBillings
    .filter(b => (b.billing_period ?? '') === monthKey || (b.due_date ?? '').startsWith(monthKey))
    .map(b => toBillingItem(b, monthLabel))
  const monthVisits = allApplications
    .filter(a => (a.construction_date ?? '').startsWith(monthKey))
    .map(a => toVisitItem(a, workerMap, allBillings))
  return {
    key: monthKey, year, month,
    label: monthLabel,
    billings: monthBillings, visits: monthVisits,
  }
}

function buildAnnualPeriod(
  year: number,
  allBillings: RawBilling[], allApplications: RawApplication[],
  workerMap: Map<string, string>,
): PeriodBundle {
  const yearKey = String(year)
  const yearLabel = `${year}년`
  const yearBillings = allBillings
    .filter(b => (b.billing_period ?? '') === yearKey || (b.due_date ?? '').startsWith(yearKey))
    .map(b => toBillingItem(b, yearLabel))
  const yearVisits = allApplications
    .filter(a => (a.construction_date ?? '').startsWith(yearKey))
    .map(a => toVisitItem(a, workerMap, allBillings))
  return {
    key: yearKey, year, month: null,
    label: yearLabel,
    billings: yearBillings, visits: yearVisits,
  }
}
