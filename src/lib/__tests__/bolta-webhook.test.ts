import { describe, it, expect } from 'vitest'
import { verifyBoltaWebhook, signWebhookPayload, parseBoltaWebhookEvent } from '@/lib/bolta/webhook'

const SECRET = 'whsec_' + Buffer.from('test-secret-key-0123456789').toString('base64')
const BODY = JSON.stringify({ eventType: 'TAX_INVOICE_ISSUANCE_SUCCESS', data: { issuanceKey: 'ik_1', taxInvoiceUrl: 'https://x' } })
const NOW = 1_800_000_000

function headersFor(ts: number, body = BODY, secret = SECRET) {
  const timestamp = String(ts)
  return { id: 'msg_1', timestamp, signature: `v1,${signWebhookPayload(secret, 'msg_1', timestamp, body)}` }
}

describe('verifyBoltaWebhook', () => {
  it('올바른 서명은 통과', () => {
    expect(verifyBoltaWebhook(headersFor(NOW), BODY, SECRET, NOW)).toEqual({ ok: true })
  })
  it('여러 서명 중 하나만 맞아도 통과', () => {
    const h = headersFor(NOW)
    h.signature = `v1,AAAA ${h.signature}`
    expect(verifyBoltaWebhook(h, BODY, SECRET, NOW).ok).toBe(true)
  })
  it('본문이 바뀌면 거절', () => {
    const r = verifyBoltaWebhook(headersFor(NOW), BODY + ' ', SECRET, NOW)
    expect(r).toEqual({ ok: false, reason: 'bad_signature' })
  })
  it('다른 시크릿으로 만든 서명은 거절', () => {
    const r = verifyBoltaWebhook(headersFor(NOW, BODY, 'whsec_' + Buffer.from('other').toString('base64')), BODY, SECRET, NOW)
    expect(r.ok).toBe(false)
  })
  it('5분 넘은 타임스탬프는 거절', () => {
    const r = verifyBoltaWebhook(headersFor(NOW - 301), BODY, SECRET, NOW)
    expect(r).toEqual({ ok: false, reason: 'expired' })
  })
  it('헤더 누락·시크릿 없음', () => {
    expect(verifyBoltaWebhook({ id: null, timestamp: null, signature: null }, BODY, SECRET, NOW)).toEqual({ ok: false, reason: 'missing_header' })
    expect(verifyBoltaWebhook(headersFor(NOW), BODY, undefined, NOW)).toEqual({ ok: false, reason: 'no_secret' })
  })
})

describe('parseBoltaWebhookEvent', () => {
  it('성공 이벤트 파싱', () => {
    const ev = parseBoltaWebhookEvent(BODY)
    expect(ev?.eventType).toBe('TAX_INVOICE_ISSUANCE_SUCCESS')
    expect(ev?.data.issuanceKey).toBe('ik_1')
  })
  it('실패 이벤트 파싱', () => {
    const ev = parseBoltaWebhookEvent(JSON.stringify({ eventType: 'TAX_INVOICE_ISSUANCE_FAILURE', data: { issuanceKey: 'ik_2', cause: { code: 'E1', message: 'bad' } } }))
    expect(ev?.eventType).toBe('TAX_INVOICE_ISSUANCE_FAILURE')
  })
  it('모르는 이벤트·깨진 JSON 은 null', () => {
    expect(parseBoltaWebhookEvent(JSON.stringify({ eventType: 'OTHER', data: { issuanceKey: 'x' } }))).toBeNull()
    expect(parseBoltaWebhookEvent(JSON.stringify({ eventType: 'TAX_INVOICE_ISSUANCE_SUCCESS', data: {} }))).toBeNull()
    expect(parseBoltaWebhookEvent('{not json')).toBeNull()
  })
})
