import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { loadExportBundle, type DetailRow } from '@/lib/payroll/exportData'

/**
 * 급여명세 상세 시트 (25열) — 회계사 신고 자료용
 * POST /api/admin/payroll/export/detail
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { month, filter } = body as {
      month?: string
      filter?: { user_ids?: string[]; worker_ids?: string[] } | null
    }
    if (!month) return NextResponse.json({ error: 'month 파라미터가 필요합니다.' }, { status: 400 })

    const bundle = await loadExportBundle(month, filter)
    const { managerDetails, workerDetails, monthLabel, rates } = bundle

    const HEADERS = [
      '성명', '역할', '고용형태', '세금유형', '급여기준',
      '근무일수', '근무건수',
      '기본급', '상여금', '식대', '교통비', '기타수당', '기타지급', '지급합계',
      '국민연금', '건강보험', '장기요양', '고용보험', '소득세', '지방소득세', '사업소득세', '추가공제', '공제합계',
      '실지급액', '지급일', '지급완료', '계좌', '비고',
    ]

    const detailToRow = (d: DetailRow): (string | number)[] => {
      const bankLabel = d.bankCode
        ? `${d.bankName ?? ''}(${d.bankCode})`.trim()
        : d.bankName ?? ''
      const account = d.accountRaw ? `${bankLabel ? bankLabel + ' ' : ''}${d.accountRaw}` : ''
      return [
        d.name, d.roleLabel, d.employmentType, d.taxType, d.salaryBasis,
        d.workDays, d.jobCount,
        d.basePay, d.bonus, d.meal, d.car, d.otherAllowance, d.otherPay, d.grossTotal,
        d.nationalPension, d.healthInsurance, d.longtermCare, d.employmentInsurance,
        d.incomeTax, d.residentTax, d.businessTax, d.extraDedTotal, d.deductionTotal,
        d.netPay, d.payDate, d.isPaid ? '○' : '×', account, d.note,
      ]
    }

    const sumBy = (rows: DetailRow[], key: keyof DetailRow) =>
      rows.reduce((s, r) => s + (typeof r[key] === 'number' ? (r[key] as number) : 0), 0)

    const totalGross = sumBy(managerDetails, 'grossTotal') + sumBy(workerDetails, 'grossTotal')
    const totalDed = sumBy(managerDetails, 'deductionTotal') + sumBy(workerDetails, 'deductionTotal')
    const totalNet = sumBy(managerDetails, 'netPay') + sumBy(workerDetails, 'netPay')
    const totalHead = managerDetails.length + workerDetails.length

    const detailRows: (string | number)[][] = [
      [`BBK 급여명세 상세 - ${monthLabel}`],
      [
        `발행일: ${new Date().toISOString().slice(0, 10)}`,
        `총 ${totalHead}명`,
        `지급합계 ${totalGross.toLocaleString('ko-KR')}원`,
        `공제합계 ${totalDed.toLocaleString('ko-KR')}원`,
        `실지급합계 ${totalNet.toLocaleString('ko-KR')}원`,
      ],
      [`※ 소득세는 요율 페이지의 근로소득세율(${(rates.incomeTax * 100).toFixed(2)}%) × 지급총액으로 자동 계산됩니다.`],
      [],
    ]

    const emitSection = (label: string, rows: DetailRow[]) => {
      if (rows.length === 0) return
      detailRows.push([`[ ${label} ${rows.length}명 ]`])
      detailRows.push(HEADERS)
      for (const d of rows) detailRows.push(detailToRow(d))
      detailRows.push([
        `${label} 합계`, '', '', '', '',
        sumBy(rows, 'workDays'), sumBy(rows, 'jobCount'),
        sumBy(rows, 'basePay'), sumBy(rows, 'bonus'),
        sumBy(rows, 'meal'), sumBy(rows, 'car'),
        sumBy(rows, 'otherAllowance'), sumBy(rows, 'otherPay'),
        sumBy(rows, 'grossTotal'),
        sumBy(rows, 'nationalPension'), sumBy(rows, 'healthInsurance'),
        sumBy(rows, 'longtermCare'), sumBy(rows, 'employmentInsurance'),
        sumBy(rows, 'incomeTax'), sumBy(rows, 'residentTax'),
        sumBy(rows, 'businessTax'), sumBy(rows, 'extraDedTotal'),
        sumBy(rows, 'deductionTotal'),
        sumBy(rows, 'netPay'), '', '', '', '',
      ])
      detailRows.push([])
    }
    emitSection('담당자', managerDetails)
    emitSection('작업자', workerDetails)

    detailRows.push([
      '총 합계', '', '', '', '',
      '', '',
      '', '', '', '', '', '', totalGross,
      '', '', '', '', '', '', '', '', totalDed,
      totalNet, '', '', '', '',
    ])

    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet(detailRows)
    sheet['!cols'] = [
      { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 8 },
      { wch: 8 }, { wch: 8 },
      { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 26 }, { wch: 40 },
    ]
    XLSX.utils.book_append_sheet(workbook, sheet, '급여상세')

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    const fileName = `BBK_급여상세_${month}.xlsx`
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    })
  } catch (err) {
    console.error('[export/detail] 실패:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : '실패' }, { status: 500 })
  }
}
