/**
 * 홈택스 세금계산서 일괄발급 CSV 빌더 (전자세금계산서-일반/영세율)
 *
 * 원본 양식: reference/hometax-format.csv (6행 헤더 기준)
 * 총 59컬럼 (A~BG), 제외 7컬럼(D·L·V·BC~BF), 채워지는 52컬럼
 *
 * 규칙:
 *  - 열 위치 어긋나면 홈택스 반려 → 사용 안 하는 셀도 빈 문자열로 자리 유지 필수
 *  - 사업자번호는 하이픈 제거
 *  - 작성일자는 YYYYMMDD (구분자 없음)
 *  - 일자N은 '2자리 일자만' (예: 15) — 홈택스가 앞에 `'` 붙여 텍스트로 강제
 *  - 품목은 최대 4개, 없는 슬롯은 8개 셀 모두 빈 값
 *  - 파일 인코딩 UTF-8 with BOM, 개행 \r\n
 */

// ─── 헤더 정의 (홈택스 원본 6행) ─────────────────────────────
export const HOMETAX_HEADERS: readonly string[] = [
  '전자(세금)계산서 종류 (01:일반, 02:영세율)', // A
  '작성일자',                                     // B
  '공급자 등록번호 ("-" 없이 입력)',              // C
  '공급자 종사업장번호',                          // D (제외)
  '공급자 상호',                                  // E
  '공급자 성명',                                  // F
  '공급자 사업장주소',                            // G
  '공급자 업태',                                  // H
  '공급자 종목',                                  // I
  '공급자 이메일',                                // J
  '공급받는자 등록번호 ("-" 없이 입력)',          // K
  '공급받는자 종사업장번호',                      // L (제외)
  '공급받는자 상호',                              // M
  '공급받는자 성명',                              // N
  '공급받는자 사업장주소',                        // O
  '공급받는자 업태',                              // P
  '공급받는자 종목',                              // Q
  '공급받는자 이메일1',                           // R
  '공급받는자 이메일2',                           // S
  '공급가액 합계',                                // T
  '세액 합계',                                    // U
  '비고',                                         // V (제외)
  '일자1 (2자리, 작성년월 제외)',                 // W
  '품목1', '규격1', '수량1', '단가1', '공급가액1', '세액1', '품목비고1', // X~AD
  '일자2 (2자리, 작성년월 제외)',                 // AE
  '품목2', '규격2', '수량2', '단가2', '공급가액2', '세액2', '품목비고2', // AF~AL
  '일자3 (2자리, 작성년월 제외)',                 // AM
  '품목3', '규격3', '수량3', '단가3', '공급가액3', '세액3', '품목비고3', // AN~AT
  '일자4 (2자리, 작성년월 제외)',                 // AU
  '품목4', '규격4', '수량4', '단가4', '공급가액4', '세액4', '품목비고4', // AV~BB
  '현금',                                         // BC (제외)
  '수표',                                         // BD (제외)
  '어음',                                         // BE (제외)
  '외상미수금',                                   // BF (제외)
  '영수(01), 청구(02)',                           // BG
] as const

export const HOMETAX_COLUMN_COUNT = HOMETAX_HEADERS.length // 59

// 사용자가 채우지 않는 (홈택스 규격상 빈값 허용) 컬럼 인덱스 — 0-based
export const HOMETAX_EXCLUDED_INDEXES = new Set([
  3,   // D 공급자 종사업장번호
  11,  // L 공급받는자 종사업장번호
  21,  // V 비고
  54,  // BC 현금
  55,  // BD 수표
  56,  // BE 어음
  57,  // BF 외상미수금
])

// ─── 입력 데이터 인터페이스 ─────────────────────────────
export interface HometaxSupplier {
  registration_number: string  // 하이픈 제거 처리는 빌더가 담당
  company_name: string
  representative: string
  address: string
  business_type: string
  business_item: string
  email: string
}

export interface HometaxReceiver {
  registration_number?: string | null
  business_name: string
  owner_name?: string | null
  address?: string | null
  business_type?: string | null   // P — 선택
  business_item?: string | null   // Q — 선택
  email?: string | null
  email_2?: string | null         // S — 선택
}

export interface HometaxItem {
  /** 2자리 일자 (예: '15'). 없으면 작성일자의 일자 자동 사용 */
  day?: string | null
  name: string
  spec?: string | null
  qty?: number | null
  unit_price?: number | null
  supply_amount: number
  vat: number
  remark?: string | null
}

export interface HometaxRow {
  /** '01' 일반, '02' 영세율 — 기본 '01' */
  invoice_kind?: '01' | '02'
  /** YYYYMMDD 형식 */
  written_date: string
  supplier: HometaxSupplier
  receiver: HometaxReceiver
  /** 최대 4개까지 사용. 5개 이상은 잘림 */
  items: HometaxItem[]
  /** '01' 영수, '02' 청구 — 기본 '01' */
  receipt_type?: '01' | '02'
}

// ─── 유틸 ─────────────────────────────
function stripHyphen(s: string | null | undefined): string {
  return (s ?? '').replace(/[-\s]/g, '')
}

function csvEscape(v: string | number | null | undefined): string {
  const s = String(v ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function dayFromYmd(yyyymmdd: string): string {
  // '20260725' → '25'
  return yyyymmdd.slice(-2)
}

/**
 * Google Sheets 앞자리 0 보존용 텍스트 강제.
 * `'01` → Sheets가 텍스트로 취급해 `01`로 표시.
 * 빈 값이면 그대로 반환 (`'`만 남으면 안 됨).
 */
function preserveLeadingZero(s: string): string {
  if (!s) return ''
  return `'${s}`
}

/** 한 행을 59개 셀 배열로 변환 */
function buildRowCells(row: HometaxRow): string[] {
  const cells: string[] = new Array(HOMETAX_COLUMN_COUNT).fill('')

  const kind = row.invoice_kind ?? '01'
  const receipt = row.receipt_type ?? '01'
  const defaultDay = dayFromYmd(row.written_date)

  // 합계 계산 (품목 기반 재산정)
  const totalSupply = row.items.reduce((s, i) => s + Number(i.supply_amount ?? 0), 0)
  const totalVat = row.items.reduce((s, i) => s + Number(i.vat ?? 0), 0)

  // ── 공급자 (A~J) ──
  cells[0]  = preserveLeadingZero(kind)                         // A 종류 (01/02, 텍스트 강제)
  cells[1]  = preserveLeadingZero(row.written_date)             // B 작성일자 (YYYYMMDD, 콤마 포맷 방지)
  cells[2]  = preserveLeadingZero(stripHyphen(row.supplier.registration_number)) // C 등록번호 (10자리 텍스트)
  // D 종사업장번호 — 빈값
  cells[4]  = row.supplier.company_name                         // E 상호
  cells[5]  = row.supplier.representative                       // F 성명
  cells[6]  = row.supplier.address                              // G 주소
  cells[7]  = row.supplier.business_type                        // H 업태
  cells[8]  = row.supplier.business_item                        // I 종목
  cells[9]  = row.supplier.email                                // J 이메일

  // ── 공급받는자 (K~S) ──
  cells[10] = preserveLeadingZero(stripHyphen(row.receiver.registration_number)) // K 등록번호 (10자리 텍스트)
  // L 종사업장번호 — 빈값
  cells[12] = row.receiver.business_name ?? ''                  // M 상호
  cells[13] = row.receiver.owner_name ?? ''                     // N 성명
  cells[14] = row.receiver.address ?? ''                        // O 주소
  cells[15] = row.receiver.business_type ?? ''                  // P 업태 (수동)
  cells[16] = row.receiver.business_item ?? ''                  // Q 종목 (수동)
  cells[17] = row.receiver.email ?? ''                          // R 이메일1
  cells[18] = row.receiver.email_2 ?? ''                        // S 이메일2

  // ── 합계 (T, U) ──
  cells[19] = String(totalSupply)                               // T 공급가액 합계
  cells[20] = String(totalVat)                                  // U 세액 합계
  // V 비고 — 빈값

  // ── 품목 슬롯 (최대 4개, W~BB) ──
  // 슬롯 시작 인덱스: 22, 30, 38, 46
  for (let i = 0; i < 4; i++) {
    const base = 22 + i * 8
    const item = row.items[i]
    if (!item) continue // 빈 슬롯 그대로 유지
    cells[base + 0] = preserveLeadingZero(item.day ?? defaultDay) // 일자 (2자리, 텍스트 강제)
    cells[base + 1] = item.name                                  // 품목명
    cells[base + 2] = item.spec ?? ''                            // 규격
    cells[base + 3] = String(item.qty ?? 1)                      // 수량
    cells[base + 4] = String(item.unit_price ?? item.supply_amount) // 단가
    cells[base + 5] = String(item.supply_amount)                 // 공급가액
    cells[base + 6] = String(item.vat)                           // 세액
    cells[base + 7] = item.remark ?? ''                          // 품목비고
  }

  // BC~BF (현금/수표/어음/외상미수금) — 빈값 (사용자 지정 규칙)
  cells[58] = preserveLeadingZero(receipt)                      // BG 영수/청구 (01/02, 텍스트 강제)

  return cells
}

/**
 * 홈택스 CSV 문자열 생성 (헤더 6행 + 데이터 행).
 * 홈택스 원본은 상단 5행이 안내문·설명이지만, 실제 업로드 시에는 7행부터 데이터.
 * 여기서는 최소한의 5행 안내 + 6행 헤더 + 7행부터 데이터 순으로 생성.
 */
export function buildHometaxCsv(rows: HometaxRow[]): string {
  const lines: string[] = []

  // 1~5행: 국세청 원본 안내문 (홈택스가 파싱에는 사용 안 하지만 관례 유지)
  lines.push('엑셀 업로드 양식(전자세금계산서-일반(영세율)) - 100건 이하')
  lines.push('"○ 필수항목(주황색)은 반드시 입력하셔야 합니다."')
  lines.push('"○ 임의로 양식을 변경[행 또는 열 추가 삭제 등]하는 경우 발급시 오류가 발생할 수 있으므로, 정해진 양식으로 작성하시기 바랍니다"')
  lines.push('"> 거래한 재화 또는 용역에 맞는 전자(세금)계산서 종류코드(01, 02)를 정확히 입력하셔야 합니다."')
  lines.push('"○ 발급가능한 파일 확장자는 XLS, XLSX 입니다."')

  // 6행: 헤더
  lines.push(HOMETAX_HEADERS.map(csvEscape).join(','))

  // 7행~: 데이터
  for (const row of rows) {
    const cells = buildRowCells(row)
    if (cells.length !== HOMETAX_COLUMN_COUNT) {
      throw new Error(
        `홈택스 CSV 컬럼 개수 불일치: ${cells.length} !== ${HOMETAX_COLUMN_COUNT}. ` +
        `buildRowCells 로직 버그 — 이 파일을 홈택스에 업로드하면 반려됩니다.`,
      )
    }
    lines.push(cells.map(csvEscape).join(','))
  }

  return lines.join('\r\n') + '\r\n'
}

/** 오늘 날짜의 YYYYMMDD (KST 기준) */
export function todayYmdKst(): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  return `${y}${m}${d}`
}
