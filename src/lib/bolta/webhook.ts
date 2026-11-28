/**
 * 볼타 웹훅 서명 검증 (Standard Webhooks 규격)
 *
 *  헤더: webhook-id, webhook-timestamp(초), webhook-signature ("v1,<base64>" 공백 구분 복수 가능)
 *  서명 대상: `${id}.${timestamp}.${rawBody}` 를 HMAC-SHA256, 키는 시크릿의 "whsec_" 제거 후 base64 디코딩
 *  타임스탬프: ±5분 밖이면 거절
 *
 * 환경변수: BOLTA_WEBHOOK_SECRET
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export const WEBHOOK_TOLERANCE_SEC = 5 * 60

export interface WebhookHeaders {
  id: string | null
  timestamp: string | null
  signature: string | null
}

export type WebhookVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'missing_header' | 'bad_timestamp' | 'expired' | 'bad_signature' | 'no_secret' }

export function decodeWebhookSecret(secret: string): Buffer {
  const raw = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  return Buffer.from(raw, 'base64')
}

export function signWebhookPayload(secret: string, id: string, timestamp: string, body: string): string {
  return createHmac('sha256', decodeWebhookSecret(secret))
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64')
}

export function verifyBoltaWebhook(
  headers: WebhookHeaders,
  rawBody: string,
  secret: string | undefined,
  nowSec: number = Math.floor(Date.now() / 1000),
): WebhookVerifyResult {
  if (!secret) return { ok: false, reason: 'no_secret' }
  if (!headers.id || !headers.timestamp || !headers.signature) return { ok: false, reason: 'missing_header' }

  const ts = Number(headers.timestamp)
  if (!Number.isFinite(ts)) return { ok: false, reason: 'bad_timestamp' }
  if (Math.abs(nowSec - ts) > WEBHOOK_TOLERANCE_SEC) return { ok: false, reason: 'expired' }

  const expected = Buffer.from(signWebhookPayload(secret, headers.id, headers.timestamp, rawBody), 'base64')
  const candidates = headers.signature
    .split(' ')
    .map(s => s.trim())
    .filter(s => s.startsWith('v1,'))
    .map(s => Buffer.from(s.slice(3), 'base64'))

  const matched = candidates.some(c => c.length === expected.length && timingSafeEqual(c, expected))
  return matched ? { ok: true } : { ok: false, reason: 'bad_signature' }
}

// ── 이벤트 페이로드 타입 ─────────────────────────────────────
export type BoltaEventType = 'TAX_INVOICE_ISSUANCE_SUCCESS' | 'TAX_INVOICE_ISSUANCE_FAILURE'

export interface BoltaSuccessEvent {
  eventType: 'TAX_INVOICE_ISSUANCE_SUCCESS'
  data: { issuanceKey: string; taxInvoiceUrl?: string | null }
}

export interface BoltaFailureEvent {
  eventType: 'TAX_INVOICE_ISSUANCE_FAILURE'
  data: { issuanceKey: string; cause?: { code?: string; message?: string } | null }
}

export type BoltaWebhookEvent = BoltaSuccessEvent | BoltaFailureEvent

/** 본문을 파싱해 우리가 처리하는 이벤트인지 확인. 아니면 null. */
export function parseBoltaWebhookEvent(rawBody: string): BoltaWebhookEvent | null {
  let json: unknown
  try { json = JSON.parse(rawBody) } catch { return null }
  if (!json || typeof json !== 'object') return null
  const obj = json as { eventType?: unknown; data?: unknown }
  const data = (obj.data ?? {}) as { issuanceKey?: unknown }
  if (typeof data.issuanceKey !== 'string' || !data.issuanceKey) return null
  if (obj.eventType === 'TAX_INVOICE_ISSUANCE_SUCCESS' || obj.eventType === 'TAX_INVOICE_ISSUANCE_FAILURE') {
    return json as BoltaWebhookEvent
  }
  return null
}
