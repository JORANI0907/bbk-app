import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createServiceClient } from '@/lib/supabase/server'

function getMonthEndDate(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  return `${yearMonth}-${String(lastDay).padStart(2, '0')}`
}

function fmtDate(s: string | null): string {
  if (!s) return ''
  return s.slice(5).replace('-', '/')
}

type AppRow = {
  id: string
  assigned_to: string | null
  business_name: string
  service_type: string
  construction_date: string
  manager_pay: number | null
  resolved_pay: number
}

type AssignRow = {
  id: string
  worker_id: string | null
  business_name: string
  construction_date: string
  salary: number | null
  application_id: string | null
}

type RecordRow = {
  id: string
  year_month: string
  person_type: string
  person_id: string
  auto_amount: number
  final_amount: number | null
  note: string | null
  is_paid: boolean
  paid_at: string | null
}

// ─── Excel 개인 시트 추가 ─────────────────────────────────────────────────────

function addPersonSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  monthLabel: string,
  managerJobs: AppRow[] | null,
  workerJobs: AssignRow[] | null,
  autoAmount: number,
  finalAmount: number,
  note: string | null,
) {
  const rows: (string | number)[][] = [
    [`${sheetName} - ${monthLabel} 급여 상세`],
    [],
    ['[ 담당자로 들어간 일정 ]'],
  ]

  if (managerJobs && managerJobs.length > 0) {
    rows.push(['날짜', '업체명', '서비스 유형', '금액'])
    for (const job of managerJobs) {
      rows.push([fmtDate(job.construction_date), job.business_name, job.service_type, job.resolved_pay])
    }
    const sub = managerJobs.reduce((s, j) => s + j.resolved_pay, 0)
    rows.push(['담당자 소계', '', '', sub])
  } else {
    rows.push(['(해당 일정 없음)'])
  }

  rows.push([], ['[ 작업자로 들어간 일정 ]'])

  if (workerJobs && workerJobs.length > 0) {
    rows.push(['날짜', '업체명', '금액'])
    for (const job of workerJobs) {
      rows.push([fmtDate(job.construction_date), job.business_name, job.salary ?? 0])
    }
    const sub = workerJobs.reduce((s, j) => s + (j.salary ?? 0), 0)
    rows.push(['작업자 소계', '', sub])
  } else {
    rows.push(['(해당 일정 없음)'])
  }

  rows.push([])

  if (finalAmount !== autoAmount) {
    rows.push(['자동 계산액', '', '', autoAmount])
    rows.push(['최종 지급액 (수동 조정)', '', '', finalAmount])
  } else {
    rows.push(['최종 지급액', '', '', finalAmount])
  }

  if (note) {
    rows.push(['메모', note])
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 15 }, { wch: 14 }]

  // 시트 이름은 최대 31자 (Excel 제한)
  XLSX.utils.book_append_sheet(workbook, ws, sheetName.slice(0, 31))
}

// ─── POST /api/admin/payroll/export ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { month, filter } = body as {
      month?: string
      filter?: { user_ids?: string[]; worker_ids?: string[] } | null
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'month 파라미터가 필요합니다. (YYYY-MM)' }, { status: 400 })
    }

    // 선택 인원 필터 유효성: 최소 1명 이상 있어야 필터로 인정
    const hasFilter = !!(filter && (
      (filter.user_ids && filter.user_ids.length > 0) ||
      (filter.worker_ids && filter.worker_ids.length > 0)
    ))
    const userIdSet = new Set(filter?.user_ids ?? [])
    const workerIdSet = new Set(filter?.worker_ids ?? [])

    const supabase = createServiceClient()

    const [appsRes, assignRes, usersRes, workersRes, recordsRes, pricesRes] = await Promise.all([
      supabase
        .from('service_applications')
        .select('id, assigned_to, business_name, service_type, construction_date, manager_pay')
        .not('assigned_to', 'is', null)
        .gte('construction_date', `${month}-01`)
        .lte('construction_date', getMonthEndDate(month))
        .order('construction_date'),
      supabase
        .from('work_assignments')
        .select('id, worker_id, business_name, construction_date, salary, application_id')
        .gte('construction_date', `${month}-01`)
        .lte('construction_date', getMonthEndDate(month))
        .order('construction_date'),
      supabase.from('users').select('id, name, role, phone, account_number').in('role', ['worker', 'admin']).eq('is_active', true).order('name'),
      supabase.from('workers').select('id, name, employment_type, phone, account_number').order('name'),
      supabase.from('payroll_records').select('*').eq('year_month', month),
      supabase.from('unit_price_monthly').select('application_id, unit_price').eq('year_month', month),
    ])

    if (appsRes.error) throw new Error(appsRes.error.message)
    if (assignRes.error) throw new Error(assignRes.error.message)
    if (usersRes.error) throw new Error(usersRes.error.message)
    if (workersRes.error) throw new Error(workersRes.error.message)
    if (recordsRes.error) throw new Error(recordsRes.error.message)

    const apps: AppRow[] = (appsRes.data ?? []).map(a => ({ ...a, resolved_pay: 0 }))
    const assignments: AssignRow[] = assignRes.data ?? []
    const users = usersRes.data ?? []
    const workers = workersRes.data ?? []
    const records: RecordRow[] = recordsRes.data ?? []
    const monthlyPriceMap = new Map<string, number>((pricesRes.data ?? []).map(p => [p.application_id, p.unit_price]))
    const recordMap = new Map<string, RecordRow>(records.map(r => [`${r.person_type}:${r.person_id}`, r]))

    // ── 담당자 집계 ──
    type ManagerEntry = { person: typeof users[number]; jobs: AppRow[]; autoAmount: number; record: RecordRow | undefined }
    const managerMap = new Map<string, ManagerEntry>()

    for (const app of apps) {
      if (!app.assigned_to) continue
      const user = users.find(u => u.id === app.assigned_to)
      if (!user) continue
      if (!managerMap.has(app.assigned_to)) {
        managerMap.set(app.assigned_to, { person: user, jobs: [], autoAmount: 0, record: recordMap.get(`user:${app.assigned_to}`) })
      }
      const entry = managerMap.get(app.assigned_to)!
      const monthlyPrice = monthlyPriceMap.get(app.id) ?? null
      const pay = (app.manager_pay ?? monthlyPrice) ?? 0
      entry.jobs.push({ ...app, resolved_pay: pay })
      entry.autoAmount += pay
    }

    // ── 작업자 집계 ──
    type WorkerEntry = { person: typeof workers[number]; jobs: AssignRow[]; autoAmount: number; record: RecordRow | undefined }
    const workerMap = new Map<string, WorkerEntry>()

    for (const assign of assignments) {
      if (!assign.worker_id) continue
      const worker = workers.find(w => w.id === assign.worker_id)
      if (!worker) continue
      if (!workerMap.has(assign.worker_id)) {
        workerMap.set(assign.worker_id, { person: worker, jobs: [], autoAmount: 0, record: recordMap.get(`worker:${assign.worker_id}`) })
      }
      const entry = workerMap.get(assign.worker_id)!
      entry.jobs.push(assign)
      entry.autoAmount += assign.salary ?? 0
    }

    let managerEntries = Array.from(managerMap.values())
    let workerEntries = Array.from(workerMap.values())

    // 선택 인원 필터 적용 — 표시할 시트만 남김
    if (hasFilter) {
      managerEntries = managerEntries.filter(e => userIdSet.has(e.person.id))
      workerEntries = workerEntries.filter(e => workerIdSet.has(e.person.id))
    }

    const [y, m] = month.split('-')
    const monthLabel = `${y}년 ${Number(m)}월`

    // ── 총계 시트 ──────────────────────────────────────────────────────────────
    const summaryRows: (string | number)[][] = [
      [`BBK 급여정산 현황 - ${monthLabel}`],
      [],
    ]

    if (managerEntries.length > 0) {
      summaryRows.push(['[ 담당자 ]'])
      summaryRows.push(['이름', '구분', '지급금액'])
      for (const e of managerEntries) {
        const final = e.record?.final_amount ?? e.autoAmount
        summaryRows.push([e.person.name, e.person.role === 'admin' ? '관리자' : '직원', final])
      }
      const total = managerEntries.reduce((s, e) => s + (e.record?.final_amount ?? e.autoAmount), 0)
      summaryRows.push(['담당자 합계', '', total])
      summaryRows.push([])
    }

    if (workerEntries.length > 0) {
      summaryRows.push(['[ 작업자 ]'])
      summaryRows.push(['이름', '고용형태', '지급금액'])
      for (const e of workerEntries) {
        const final = e.record?.final_amount ?? e.autoAmount
        summaryRows.push([e.person.name, e.person.employment_type ?? '-', final])
      }
      const total = workerEntries.reduce((s, e) => s + (e.record?.final_amount ?? e.autoAmount), 0)
      summaryRows.push(['작업자 합계', '', total])
      summaryRows.push([])
    }

    const grandTotal =
      managerEntries.reduce((s, e) => s + (e.record?.final_amount ?? e.autoAmount), 0) +
      workerEntries.reduce((s, e) => s + (e.record?.final_amount ?? e.autoAmount), 0)
    summaryRows.push(['총 지급액', '', grandTotal])

    const workbook = XLSX.utils.book_new()
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows)
    summarySheet['!cols'] = [{ wch: 15 }, { wch: 12 }, { wch: 15 }]
    XLSX.utils.book_append_sheet(workbook, summarySheet, '총계')

    // ── 개인별 시트 ──────────────────────────────────────────────────────────
    // 시트 이름 중복 방지 (동명이인 처리)
    const sheetNames = new Set<string>()
    const uniqueName = (base: string) => {
      const trimmed = base.slice(0, 28)
      let name = trimmed
      let count = 2
      while (sheetNames.has(name)) {
        name = `${trimmed}(${count++})`
      }
      sheetNames.add(name)
      return name
    }

    for (const e of managerEntries) {
      const final = e.record?.final_amount ?? e.autoAmount
      addPersonSheet(workbook, uniqueName(e.person.name), monthLabel, e.jobs, null, e.autoAmount, final, e.record?.note ?? null)
    }
    for (const e of workerEntries) {
      const final = e.record?.final_amount ?? e.autoAmount
      addPersonSheet(workbook, uniqueName(e.person.name), monthLabel, null, e.jobs, e.autoAmount, final, e.record?.note ?? null)
    }

    // ── Excel 버퍼 생성 후 바로 반환 (Drive 업로드는 클라이언트에서 처리) ──────
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    const fileName = `BBK_급여정산_${month}.xlsx`
    const encodedName = encodeURIComponent(fileName)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
      },
    })
  } catch (err) {
    console.error('급여정산 엑셀 생성 실패:', err)
    return NextResponse.json({ error: '엑셀 생성에 실패했습니다.' }, { status: 500 })
  }
}
