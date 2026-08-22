/**
 * 범빌드코리아 계약서 템플릿 시스템 v2
 *
 * 변수 규약 (v2, 한글 이름):
 *   {{고객서명}}    - 고객 전자서명 이미지
 *   {{고객성명}}    - 고객 서명자 이름 (텍스트)
 *   {{고객사직인}}  - 고객사 도장 이미지
 *   {{공급사서명}}  - BBK 서명 이미지 (기존 ADMIN_SIGNATURE 대체)
 *   {{공급사직인}}  - BBK 도장 이미지
 *   {{오늘날짜}}    - 계약 생성 시점 (예: "2026년 8월 4일")
 *   {{인적사항표}}  - 자동 표 삽입 마커 (없으면 본문 맨 밑에 삽입)
 *
 * 옛 시스템(A방식) 하위 호환: {{CUSTOMER_XXX}} 등 옛 변수는 빈 문자열로 치환.
 */

/**
 * 모달에서 수집하는 계약 정보 스냅샷
 * — customers 테이블 자동 채움 + 관리자 수정본
 */
export interface ContractCustomerInfo {
  business_name: string       // 업체명
  contact_name: string        // 고객명
  contact_phone: string       // 연락처
  address: string             // 주소
  business_number: string     // 사업자등록번호
  email: string               // 이메일
  contract_start_date: string // 계약 시작일 (YYYY-MM-DD)
  contract_end_date: string   // 계약 종료일 (YYYY-MM-DD)
  care_scope: string          // 케어범위 (자유 텍스트)
}

/** 서명·직인 자산 (렌더 시 이미지로 치환) */
export interface ContractSigningAssets {
  customerSignature?: string | null   // base64 dataURL or URL
  customerSignerName?: string | null
  customerStamp?: string | null
  supplierSignature?: string | null   // BBK 서명
  supplierStamp?: string | null       // BBK 도장
}

// ─── 자동 표 렌더 (4열 4행, 라벨 셀은 색상, 값 셀은 흰색) ───────────

/**
 * 모달의 8필드를 4열 4행 표로 조립.
 * 라벨 셀: 연한 회색 배경 (#f0f2f5)
 * 값 셀:   흰색 배경
 */
export function buildCustomerInfoTable(info: ContractCustomerInfo): string {
  const period = [info.contract_start_date, info.contract_end_date]
    .filter(Boolean)
    .join(' ~ ') || '-'

  const rows: Array<[string, string, string, string]> = [
    ['업체명',        info.business_name  || '-', '고객명', info.contact_name || '-'],
    ['연락처',        info.contact_phone  || '-', '주소',   info.address      || '-'],
    ['사업자등록번호', info.business_number || '-', '이메일', info.email        || '-'],
    ['계약기간',      period,                     '케어범위', info.care_scope   || '-'],
  ]

  const labelStyle = 'background:#f0f2f5;border:1px solid #ccc;padding:8px 12px;font-weight:600;color:#333;width:18%;'
  const valueStyle = 'background:#ffffff;border:1px solid #ccc;padding:8px 12px;color:#1a1a1a;width:32%;'

  const bodyRows = rows.map(([l1, v1, l2, v2]) => (
    `<tr>` +
      `<td style="${labelStyle}">${escapeHtml(l1)}</td>` +
      `<td style="${valueStyle}">${escapeHtml(v1)}</td>` +
      `<td style="${labelStyle}">${escapeHtml(l2)}</td>` +
      `<td style="${valueStyle}">${escapeHtml(v2)}</td>` +
    `</tr>`
  )).join('')

  return (
    `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">` +
      `<tbody>${bodyRows}</tbody>` +
    `</table>`
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─── 오늘 날짜 포맷 ──────────────────────────────────────────────────

export function formatToday(d: Date = new Date()): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
}

// ─── 서명 자산 → HTML 조각 ──────────────────────────────────────────

function signatureImg(src: string | null | undefined, label: string, wPx = 200, hPx = 80): string {
  if (src) {
    return `<img src="${src}" alt="${escapeHtml(label)}" style="max-width:${wPx}px;max-height:${hPx}px;object-fit:contain;vertical-align:middle;" />`
  }
  return `<span style="display:inline-block;min-width:${wPx}px;height:${hPx}px;line-height:${hPx}px;text-align:center;color:#bbb;font-size:11px;border:1px dashed #ddd;border-radius:4px;">(${label})</span>`
}

function stampImg(src: string | null | undefined, label: string): string {
  if (src) {
    return `<img src="${src}" alt="${escapeHtml(label)}" style="width:80px;height:80px;object-fit:contain;vertical-align:middle;" />`
  }
  return `<span style="display:inline-block;width:80px;height:80px;line-height:80px;text-align:center;color:#bbb;font-size:10px;border:1px dashed #ddd;border-radius:4px;">(${label})</span>`
}

// ─── 신규 v2 변수 치환 ───────────────────────────────────────────────

/**
 * v2 변수 (한글) 치환.
 * customerInfo 로부터 인적사항표 마커를 실제 표로 대체.
 * 마커가 없으면 본문 맨 밑(별지 마커 <hr> 직전 또는 </body> 직전)에 자동 삽입.
 */
export function renderContractV2(
  htmlBody: string,
  customerInfo: ContractCustomerInfo,
  signing: ContractSigningAssets = {},
  today: Date = new Date(),
): string {
  let rendered = htmlBody

  // 1. 인적사항표 마커 처리 (있으면 그 자리에 삽입, 없으면 맨 밑)
  const infoTableHtml = buildCustomerInfoTable(customerInfo)
  const markerPattern = /\{\{\s*인적사항표\s*\}\}/g
  if (markerPattern.test(rendered)) {
    rendered = rendered.replace(markerPattern, infoTableHtml)
  } else {
    // </body> 직전 삽입. </body> 태그가 없으면 문서 끝에 붙임.
    if (/<\/body>/i.test(rendered)) {
      rendered = rendered.replace(/<\/body>/i, `${infoTableHtml}\n</body>`)
    } else {
      rendered = rendered + '\n' + infoTableHtml
    }
  }

  // 2. 서명·직인·오늘날짜 변수 치환
  rendered = rendered
    .replace(/\{\{\s*고객서명\s*\}\}/g,   signatureImg(signing.customerSignature, '고객 서명'))
    .replace(/\{\{\s*고객성명\s*\}\}/g,   escapeHtml(signing.customerSignerName ?? customerInfo.contact_name ?? ''))
    .replace(/\{\{\s*고객사직인\s*\}\}/g, stampImg(signing.customerStamp,       '고객사 직인'))
    .replace(/\{\{\s*공급사서명\s*\}\}/g, signatureImg(signing.supplierSignature, '공급사 서명'))
    .replace(/\{\{\s*공급사직인\s*\}\}/g, stampImg(signing.supplierStamp,       '공급사 직인'))
    .replace(/\{\{\s*오늘날짜\s*\}\}/g,   escapeHtml(formatToday(today)))

  // 3. 옛 변수 하위 호환 — 빈 문자열로 치환 (A방식)
  // 대문자·언더스코어로만 구성된 옛 규약. 관리자가 신규 양식 만들 때 실수로 옛 변수를 넣어도 조용히 무시.
  rendered = rendered.replace(/\{\{[A-Z0-9_]+\}\}/g, '')

  return rendered
}

/** 편집 모드 미리보기용 — 서명·직인 자리를 빈 박스로 대체 (자산 없이) */
export function renderContractPreview(
  htmlBody: string,
  customerInfo: ContractCustomerInfo,
  today: Date = new Date(),
): string {
  return renderContractV2(htmlBody, customerInfo, {}, today)
}

/**
 * 저장 전 sanitize — 편집기·미리보기 API 등에서 렌더된 dashed placeholder <span> 을
 * 원본 v2 한글 변수({{고객서명}}, {{고객사직인}}, {{공급사서명}}, {{공급사직인}}) 로
 * 되돌린다. 이후 서명 완료 시점에 실제 이미지로 정상 치환되도록 보장.
 *
 * 왜 필요한가:
 *   계약서 생성 화면(admin/contracts/page.tsx) 이 preview API 결과(=서명 변수가 dashed
 *   로 이미 치환된 HTML) 를 html_body 로 전송한다. 서버가 그대로 저장하면 서명 자리가
 *   dashed 텍스트로 박제되어 서명 이미지를 박을 곳이 사라진다.
 *
 * 여러 화면에서 서로 다른 저장 API 를 호출하므로, 저장 진입점(POST /contracts,
 * PATCH /contracts/[id]) 에서 반드시 이 함수를 통과시킨다.
 */
export function restoreSignaturePlaceholders(html: string): string {
  if (!html) return html
  // 계약서 dashed <span> 5종 (renderContractV2 의 signatureImg/stampImg 출력물).
  // style 문자열 안의 특수문자 그대로 매칭하려고 정규식은 최소 이스케이프만 사용.
  // injectProcessFieldPlaceholders 가 (서명자 성명) 도 dashed 로 렌더링하므로 함께 복원.
  return html
    .replace(
      /<span style="display:inline-block;min-width:200px;height:80px;line-height:80px;text-align:center;color:#bbb;font-size:11px;border:1px dashed #ddd;border-radius:4px;">\(고객 서명\)<\/span>/g,
      '{{고객서명}}',
    )
    .replace(
      /<span style="display:inline-block;min-width:200px;height:80px;line-height:80px;text-align:center;color:#bbb;font-size:11px;border:1px dashed #ddd;border-radius:4px;">\(공급사 서명\)<\/span>/g,
      '{{공급사서명}}',
    )
    .replace(
      /<span style="display:inline-block;width:80px;height:80px;line-height:80px;text-align:center;color:#bbb;font-size:10px;border:1px dashed #ddd;border-radius:4px;">\(고객사 직인\)<\/span>/g,
      '{{고객사직인}}',
    )
    .replace(
      /<span style="display:inline-block;width:80px;height:80px;line-height:80px;text-align:center;color:#bbb;font-size:10px;border:1px dashed #ddd;border-radius:4px;">\(공급사 직인\)<\/span>/g,
      '{{공급사직인}}',
    )
    .replace(
      /<span style="display:inline-block;min-width:120px;height:40px;line-height:40px;text-align:center;color:#bbb;font-size:11px;border:1px dashed #ddd;border-radius:4px;">\(서명자 성명\)<\/span>/g,
      '{{고객성명}}',
    )
}

/**
 * 스냅샷 저장용 렌더 — 인적사항표와 오늘날짜만 치환하고, 서명·직인·성명 변수는
 * 그대로 유지한다. 이후 고객 서명(agree route) / 관리자 최종 확인(admin-sign route)
 * 시점에 실제 이미지로 치환된다.
 *
 * ⚠️ 절대 renderContractV2/renderContractPreview 로 저장하지 말 것.
 *    저장 시점에는 서명 자산이 없어 서명 변수가 dashed placeholder 로 박제되고,
 *    이후 서명이 완료돼도 치환할 자리가 사라진다.
 */
export function renderContractForStorage(
  htmlBody: string,
  customerInfo: ContractCustomerInfo,
  today: Date = new Date(),
): string {
  let rendered = htmlBody

  // 인적사항표 (마커 있으면 그 자리, 없으면 </body> 직전)
  const infoTableHtml = buildCustomerInfoTable(customerInfo)
  const markerPattern = /\{\{\s*인적사항표\s*\}\}/g
  if (markerPattern.test(rendered)) {
    rendered = rendered.replace(markerPattern, infoTableHtml)
  } else if (/<\/body>/i.test(rendered)) {
    rendered = rendered.replace(/<\/body>/i, `${infoTableHtml}\n</body>`)
  } else {
    rendered = rendered + '\n' + infoTableHtml
  }

  // 오늘날짜만 치환. 서명·직인·성명 변수는 손대지 않는다.
  rendered = rendered.replace(/\{\{\s*오늘날짜\s*\}\}/g, escapeHtml(formatToday(today)))

  // 옛 v1 영문 변수 중 서명·직인 관련이 아닌 것만 빈 문자열로 (하위 호환).
  // {{CUSTOMER_SIGNATURE}}, {{CUSTOMER_STAMP}}, {{ADMIN_SIGNATURE}}, {{SUPPLIER_STAMP}},
  // {{CUSTOMER_SIGNER_NAME}} 은 남겨둔다.
  const preservedV1 = new Set([
    'CUSTOMER_SIGNATURE', 'CUSTOMER_STAMP', 'ADMIN_SIGNATURE',
    'SUPPLIER_STAMP', 'CUSTOMER_SIGNER_NAME',
  ])
  rendered = rendered.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => (
    preservedV1.has(key) ? match : ''
  ))

  return rendered
}

// ─── 편집기 변수 카탈로그 (하드코딩 — DB 폴백용) ────────────────────

export interface EditorVariable {
  name: string   // 실제 삽입되는 변수 (예: '고객서명')
  label: string  // UI 라벨
  hint: string   // 툴팁
  category: 'signing' | 'system' | 'table_marker'
}

export const EDITOR_VARIABLES: EditorVariable[] = [
  { name: '인적사항표', label: '📋 인적사항표', hint: '자동 표 위치 지정 (미사용 시 본문 맨 밑 자동 삽입)', category: 'table_marker' },
  { name: '오늘날짜',   label: '📅 오늘날짜',   hint: '계약 생성 시점 (예: 2026년 8월 4일)', category: 'system' },
  { name: '고객성명',   label: '✍️ 고객성명',   hint: '고객 서명자 이름 (텍스트)', category: 'signing' },
  { name: '고객서명',   label: '✒️ 고객서명',   hint: '고객 전자서명 이미지', category: 'signing' },
  { name: '고객사직인', label: '🔖 고객사직인', hint: '고객사 도장 이미지', category: 'signing' },
  { name: '공급사서명', label: '✒️ 공급사서명', hint: 'BBK 서명 이미지', category: 'signing' },
  { name: '공급사직인', label: '🔖 공급사직인', hint: 'BBK 도장 이미지', category: 'signing' },
]

// ═══════════════════════════════════════════════════════════════════════
// Legacy 호환 shim
//
// v1 시스템 소비자들(옛 계약서 편집·서명 페이지, 옛 signed PDF 재생성 API 등)이
// 아직 아래 export 들을 import 중이다. 완전 삭제 시 tsc 파괴 → 옛 계약서 화면도
// 깨질 수 있으므로, 무해한 stub 으로 유지한다.
//
// A방식 원칙: v1 변수는 빈 문자열로 렌더. 이미 서명 완료돼 스냅샷이 저장된
// 옛 계약서는 스냅샷 그대로 표시되므로 이 shim 의 영향 없음.
// ═══════════════════════════════════════════════════════════════════════

export interface VarConfig {
  label: string
  mode: 'auto' | 'manual'
  autoField?: string
}
export type TemplateVarConfigMap = Record<string, VarConfig>

/** @deprecated v2 편집기에서는 미사용. VariablesTab UI 폴백용. */
export const AUTO_FILL_FIELDS: Record<string, string> = {}
/** @deprecated */
export const PROCESS_AUTO_FIELDS: Set<string> = new Set<string>()
/** @deprecated */
export const TEMPLATE_PREVIEW_VALUES: Record<string, string> = {}

/** @deprecated v1 하드코딩 템플릿 렌더 — v2 이후로는 stub */
export function renderContract(_v: unknown): string {
  return '<div style="padding:20px;color:#999;text-align:center;">계약서 양식을 선택해주세요.</div>'
}

/** @deprecated */
export function extractVariablesFromCustomer(_c: unknown, _ct: unknown): Record<string, string> {
  return {}
}

/**
 * v1 규약 {{VAR_NAME}} 치환 (대문자·영숫자·언더스코어).
 * 옛 계약서 서명 API 가 남아있어 유지. v2 신규 계약서에는 관여하지 않음.
 */
export function renderTemplateWithVars(
  htmlBody: string,
  vars: Record<string, string>,
): string {
  return htmlBody.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => vars[key] ?? match)
}

/** v1 규약 변수명 추출 */
export function extractTemplateVars(htmlBody: string): string[] {
  const matches = Array.from(htmlBody.matchAll(/\{\{([A-Z0-9_]+)\}\}/g))
  return Array.from(new Set(matches.map((m) => m[1])))
}

/**
 * 서명 페이지에서 서명·직인 자리를 빈 박스로 대체.
 * v1 영문·v2 한글 양쪽 모두 지원.
 */
export function injectProcessFieldPlaceholders(html: string): string {
  const box = (label: string, w = 200, h = 80) =>
    `<span style="display:inline-block;min-width:${w}px;height:${h}px;line-height:${h}px;text-align:center;color:#bbb;font-size:11px;border:1px dashed #ddd;border-radius:4px;">(${label})</span>`
  const stamp = (label: string) =>
    `<span style="display:inline-block;width:80px;height:80px;line-height:80px;text-align:center;color:#bbb;font-size:10px;border:1px dashed #ddd;border-radius:4px;">(${label})</span>`

  return html
    // v2 한글
    .replace(/\{\{\s*고객서명\s*\}\}/g,   box('고객 서명'))
    .replace(/\{\{\s*공급사서명\s*\}\}/g, box('공급사 서명'))
    .replace(/\{\{\s*고객사직인\s*\}\}/g, stamp('고객사 직인'))
    .replace(/\{\{\s*공급사직인\s*\}\}/g, stamp('공급사 직인'))
    // v1 영문 (하위 호환)
    .replace(/\{\{CUSTOMER_SIGNATURE\}\}/g,   box('고객 서명'))
    .replace(/\{\{ADMIN_SIGNATURE\}\}/g,      box('관리자 서명'))
    .replace(/\{\{CUSTOMER_STAMP\}\}/g,       stamp('고객사 직인'))
    .replace(/\{\{SUPPLIER_STAMP\}\}/g,       stamp('공급사 직인'))
    .replace(/\{\{CUSTOMER_SIGNER_NAME\}\}/g, box('서명자 성명', 120, 40))
}

/** @deprecated v1 유형 정의 — 옛 코드 호환용 */
export interface ContractVariables {
  contractYear: string
  contractMonth: string
  contractDay: string
  customerBusinessName: string
  customerBusinessNumber: string
  customerOwnerName: string
  customerAddress: string
  customerPhone: string
  customerEmail: string
  servicePlan: string
  visitOption: string
  monthlyPrice: string
  annualPrice: string
  contractStartDate: string
  contractEndDate: string
  selectedItemsList: string
}

/** @deprecated v2 시스템에서는 옛 변수는 빈 문자열로 렌더 (A방식) */
export function resolveAutoField(_field: string, _c: Record<string, unknown>, _ct: Record<string, unknown>): string {
  return ''
}
