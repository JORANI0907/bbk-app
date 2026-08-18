/**
 * 직원 서류 요청·수집 시스템 공통 상수·유틸.
 *
 * 사용처: 관리자 UI (요청 모달·서류 섹션), 관리자 API, 직원 업로드 페이지, 직원 API.
 */

export type WorkerDocumentType =
  | 'safety_edu'
  | 'health_cert'
  | 'labor_contract'
  | 'bank_copy'
  | 'certification'
  | 'id_card'
  | 'criminal_record'
  | 'other'

export interface WorkerDocumentTypeDef {
  value: WorkerDocumentType
  /** 관리자 UI 체크박스·직원 업로드 폼에 표시되는 라벨 (기본값). other 는 관리자가 직접 입력 가능 */
  label: string
  /** 부가 설명 (한 줄, 관리자가 필요 시 참고) */
  hint?: string
  /** 이 서류에 대한 default 파일명 prefix. Storage 저장 시 사용 */
  fileNamePrefix: string
}

/**
 * 8종 서류. 순서는 관리자 UI 체크박스 표시 순서와 동일.
 * 새 서류 추가는 사용자가 직접 이 배열에 append.
 */
export const WORKER_DOCUMENT_TYPES: readonly WorkerDocumentTypeDef[] = [
  {
    value: 'safety_edu',
    label: '건설안전교육 이수증',
    hint: '건설업 기초 안전보건교육 이수증',
    fileNamePrefix: 'safety_edu',
  },
  {
    value: 'health_cert',
    label: '보건증',
    hint: '식품위생 관련 보건증 (유효기간 확인 필요)',
    fileNamePrefix: 'health_cert',
  },
  {
    value: 'labor_contract',
    label: '근로계약서',
    hint: '서명 완료된 근로계약서 사본',
    fileNamePrefix: 'labor_contract',
  },
  {
    value: 'bank_copy',
    label: '통장 사본',
    hint: '급여 이체용 통장 사본',
    fileNamePrefix: 'bank_copy',
  },
  {
    value: 'certification',
    label: '자격증',
    hint: '보유 자격증 사본',
    fileNamePrefix: 'certification',
  },
  {
    value: 'id_card',
    label: '신분증 사본',
    hint: '주민등록증 또는 운전면허증 사본',
    fileNamePrefix: 'id_card',
  },
  {
    value: 'criminal_record',
    label: '범죄경력회보서',
    hint: '경찰서 발급 범죄경력회보서',
    fileNamePrefix: 'criminal_record',
  },
  {
    value: 'other',
    label: '기타',
    hint: '체크박스 선택 시 라벨을 직접 입력',
    fileNamePrefix: 'other',
  },
] as const

export const DOCUMENT_TYPE_MAP: Record<WorkerDocumentType, WorkerDocumentTypeDef> =
  WORKER_DOCUMENT_TYPES.reduce((acc, def) => {
    acc[def.value] = def
    return acc
  }, {} as Record<WorkerDocumentType, WorkerDocumentTypeDef>)

export function getDocumentLabel(type: WorkerDocumentType, customLabel?: string | null): string {
  if (type === 'other' && customLabel && customLabel.trim()) return customLabel.trim()
  return DOCUMENT_TYPE_MAP[type]?.label ?? type
}

// ─── 파일 제한 ─────────────────────────────────────────────────────

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

export const ALLOWED_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/pdf',
] as const

export const ALLOWED_EXTENSIONS: readonly string[] = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'pdf'] as const

export function extensionFromFileName(fileName: string): string {
  const m = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m?.[1] ?? ''
}

export function isAllowedExtension(fileName: string): boolean {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(extensionFromFileName(fileName))
}

export function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mime)
}

// ─── Storage 경로 ─────────────────────────────────────────────────

export const WORKER_DOCUMENTS_BUCKET = 'worker-documents'

/**
 * Storage 저장 경로: {worker_id}/{request_id}/{document_type}_{timestamp}.{ext}
 * 직원별 폴더로 자동 정리되어 나중에 특정 직원 서류를 스토리지 리스트만으로 조회 가능.
 */
export function buildStoragePath(opts: {
  workerId: string
  requestId: string
  documentType: WorkerDocumentType
  originalFileName: string
}): string {
  const ext = extensionFromFileName(opts.originalFileName) || 'bin'
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const prefix = DOCUMENT_TYPE_MAP[opts.documentType]?.fileNamePrefix ?? opts.documentType
  return `${opts.workerId}/${opts.requestId}/${prefix}_${ts}.${ext}`
}

// ─── SMS 본문 기본 템플릿 ───────────────────────────────────────

export const DEFAULT_SMS_TEMPLATE = `[BBK 범빌드코리아]
안녕하세요, {name}님.
아래 서류를 제출해 주세요:
{document_list}

제출 링크(7일 유효):
{url}`

export interface SmsTemplateContext {
  name: string
  documentList: string
  url: string
}

export function renderSmsBody(template: string, ctx: SmsTemplateContext): string {
  return template
    .replaceAll('{name}', ctx.name)
    .replaceAll('{document_list}', ctx.documentList)
    .replaceAll('{url}', ctx.url)
}
