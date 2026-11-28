/**
 * 볼타(Bolta) 전자세금계산서 REST 클라이언트
 *
 * 문서: https://docs.bolta.io
 *  - 인증: Authorization: Basic base64("{API_KEY}:")  (비밀번호 비움)
 *  - 발행: POST /v1/taxInvoices/issue  → { issuanceKey }
 *  - 상태: GET  /v1/taxInvoices/issue/status?clientReferenceId=  → { issuanceKey, clientReferenceId, message }
 *  - 오류: { code, message, traceId }
 *
 * 환경변수: BOLTA_API_KEY (test_ 또는 live_ 접두사)
 *
 * 주의: 응답을 못 받았을 때 같은 clientReferenceId 로 재전송하면 400 이 난다.
 *       반드시 getIssueStatusByReference() 로 결과를 먼저 확인한다.
 */

import type { BoltaIssueRequest } from './mapper'

const BOLTA_BASE_URL = 'https://xapi.bolta.io'
const REQUEST_TIMEOUT_MS = 15_000

export class BoltaApiError extends Error {
  readonly status: number
  readonly code: string
  readonly traceId: string | null

  constructor(status: number, code: string, message: string, traceId: string | null) {
    super(message)
    this.name = 'BoltaApiError'
    this.status = status
    this.code = code
    this.traceId = traceId
  }
}

export interface BoltaIssueResponse {
  issuanceKey: string
}

export interface BoltaIssueStatusResponse {
  issuanceKey: string
  clientReferenceId: string
  message: string
}

export function isBoltaConfigured(): boolean {
  return !!process.env.BOLTA_API_KEY
}

export function boltaKeyMode(): 'test' | 'live' | 'none' {
  const key = process.env.BOLTA_API_KEY ?? ''
  if (key.startsWith('live_')) return 'live'
  if (key.startsWith('test_')) return 'test'
  return 'none'
}

function authHeader(): string {
  const key = process.env.BOLTA_API_KEY
  if (!key) throw new Error('BOLTA_API_KEY 환경변수가 없습니다')
  return `Basic ${Buffer.from(`${key}:`).toString('base64')}`
}

interface BoltaHttpResult {
  status: number
  ok: boolean
  json: unknown
}

/** 헤더뿐 아니라 본문 읽기까지 타임아웃을 적용한다 */
async function boltaFetch(path: string, init: RequestInit): Promise<BoltaHttpResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${BOLTA_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
    const json: unknown = await res.json().catch(() => ({}))
    return { status: res.status, ok: res.ok, json }
  } finally {
    clearTimeout(timer)
  }
}

function toApiError(res: BoltaHttpResult): BoltaApiError {
  const body = (res.json ?? {}) as { code?: string; message?: string; traceId?: string }
  return new BoltaApiError(
    res.status,
    body.code ?? `HTTP_${res.status}`,
    body.message ?? `볼타 API 오류 (${res.status})`,
    body.traceId ?? null,
  )
}

/** 정발행 요청. 네트워크 오류는 그대로 throw (호출자가 상태 조회로 보정). */
export async function issueTaxInvoice(
  request: BoltaIssueRequest,
  clientReferenceId: string,
): Promise<BoltaIssueResponse> {
  const res = await boltaFetch('/v1/taxInvoices/issue', {
    method: 'POST',
    headers: { 'Bolta-Client-Reference-Id': clientReferenceId },
    body: JSON.stringify(request),
  })
  if (!res.ok) throw toApiError(res)
  const json = res.json as Partial<BoltaIssueResponse>
  if (!json.issuanceKey) {
    // 2xx 인데 키가 없음 — 접수됐을 수 있으므로 호출자는 상태 조회로 보정한다
    throw new BoltaApiError(res.status, 'INVALID_RESPONSE', '응답에 issuanceKey 가 없습니다', null)
  }
  return { issuanceKey: json.issuanceKey }
}

/** clientReferenceId 로 발행 접수 여부 조회. 접수 기록이 없으면 null. */
export async function getIssueStatusByReference(
  clientReferenceId: string,
): Promise<BoltaIssueStatusResponse | null> {
  const qs = new URLSearchParams({ clientReferenceId })
  const res = await boltaFetch(`/v1/taxInvoices/issue/status?${qs}`, { method: 'GET' })
  if (res.status === 404) return null
  if (!res.ok) throw toApiError(res)
  const json = res.json as Partial<BoltaIssueStatusResponse>
  if (!json.issuanceKey) return null
  return {
    issuanceKey: json.issuanceKey,
    clientReferenceId: json.clientReferenceId ?? clientReferenceId,
    message: json.message ?? '',
  }
}
