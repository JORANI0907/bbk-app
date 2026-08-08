import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { loadExportBundle, parseAccount, type DetailRow } from '@/lib/payroll/exportData'
import { bankNameToCode } from '@/lib/bankCodes'

/**
 * 국민은행 급여이체 파일 (obiz .xls 템플릿 기반)
 * POST /api/admin/payroll/export/bank
 *
 * 처리:
 *  1) obiz 샘플 템플릿 (.xls) 을 로드 → 은행이 요구하는 메타데이터 유지
 *  2) A~G 열 데이터 영역(예시 10줄)을 clear
 *  3) 우리 데이터로 채움 (A: 은행코드, B: 계좌, C: 금액, D: 예금주, E: 급여, F: 급여이체, G: N월급여)
 *  4) H~ 열의 유의사항·은행코드 목록은 그대로 유지
 *  5) .xls 형식으로 저장 (bookType: 'biff8')
 */

const TEMPLATE_PATH = path.join(process.cwd(), 'src/lib/payroll/templates/obiz_bank_transfer.xls')
const EXAMPLE_ROWS = 12  // 템플릿에 원래 있던 예시 데이터 행 수 (여유있게)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { month, filter } = body as {
      month?: string
      filter?: { user_ids?: string[]; worker_ids?: string[] } | null
    }
    if (!month) return NextResponse.json({ error: 'month 파라미터가 필요합니다.' }, { status: 400 })

    const bundle = await loadExportBundle(month, filter)
    const { managerDetails, workerDetails } = bundle
    const payLabel = `${Number(month.split('-')[1])}월급여`

    // 1) 템플릿 로드
    const templateBuffer = fs.readFileSync(TEMPLATE_PATH)
    const workbook = XLSX.read(templateBuffer, { type: 'buffer', cellStyles: true, cellNF: true })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]

    // 2) 기존 예시 데이터 (A~G, 상위 EXAMPLE_ROWS 행) clear
    for (let r = 0; r < EXAMPLE_ROWS; r++) {
      for (let c = 0; c < 7; c++) {
        const addr = XLSX.utils.encode_cell({ r, c })
        delete sheet[addr]
      }
    }

    // 3) 우리 데이터 채움
    type Row = { code: string; number: string; amount: number; name: string }
    const buildRow = (d: DetailRow): Row => {
      let code = d.bankCode ?? ''
      let number = d.accountRaw ?? ''
      if (!code && d.bankName) code = bankNameToCode(d.bankName) ?? ''
      if (!code || !number || number === d.accountRaw) {
        const parsed = parseAccount(d.accountRaw)
        if (!code && parsed.bank) code = bankNameToCode(parsed.bank) ?? ''
        if (parsed.number) number = parsed.number
      }
      return { code, number, amount: d.netPay, name: d.name }
    }
    const rows: Row[] = [
      ...managerDetails.map(buildRow),
      ...workerDetails.map(buildRow),
    ]

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]
      const setCell = (c: number, v: string | number, t: 's' | 'n' = 's') => {
        const addr = XLSX.utils.encode_cell({ r, c })
        sheet[addr] = { v, t, ...(t === 's' ? { z: '@' } : {}) }
      }
      // A: 은행 코드 (텍스트 셀 포맷 `@` 로 앞의 0 자동 유지 · ' 접두사 없이 그대로 표시)
      setCell(0, row.code, 's')
      // B: 계좌번호 (숫자만, 텍스트로 저장하여 앞자리 0 유지)
      setCell(1, row.number, 's')
      // C: 이체금액 (숫자)
      setCell(2, row.amount, 'n')
      // D: 예금주
      setCell(3, row.name, 's')
      // E: 통장표시 (급여)
      setCell(4, '급여', 's')
      // F: 내 통장 메모 (급여이체)
      setCell(5, '급여이체', 's')
      // G: 메모 (N월급여)
      setCell(6, payLabel, 's')
    }

    // 4) !ref 갱신 (기존보다 데이터가 적어지지 않도록 유지)
    const currentRef = sheet['!ref']
    if (currentRef) {
      const range = XLSX.utils.decode_range(currentRef)
      const newEndRow = Math.max(range.e.r, rows.length - 1, EXAMPLE_ROWS - 1)
      const newEndCol = Math.max(range.e.c, 6)
      sheet['!ref'] = XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: newEndRow, c: newEndCol },
      })
    }

    // 5) .xls (biff8) 로 저장 → 은행 파서 호환성 유지
    const outBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'biff8' }) as Buffer
    const fileName = `BBK_급여이체_${month}.xls`
    return new NextResponse(new Uint8Array(outBuffer), {
      headers: {
        'Content-Type': 'application/vnd.ms-excel',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    })
  } catch (err) {
    console.error('[export/bank] 실패:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : '실패' }, { status: 500 })
  }
}
