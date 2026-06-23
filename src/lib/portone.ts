import { PortOneClient } from '@portone/server-sdk'
import type { PortOneClient as PortOneClientType } from '@portone/server-sdk'

const STORE_ID   = process.env.PORTONE_STORE_ID
const API_SECRET = process.env.PORTONE_V2_API_SECRET

let _client: PortOneClientType | null = null

export function getPortOneClient(): PortOneClientType | null {
  if (!STORE_ID || !API_SECRET) return null
  if (!_client) _client = PortOneClient({ secret: API_SECRET, storeId: STORE_ID })
  return _client
}

export function getStoreId(): string {
  if (!STORE_ID) throw new Error('PORTONE_STORE_ID가 설정되지 않았습니다.')
  return STORE_ID
}

export function getChannelKey(method: 'card' | 'vbank'): string {
  const key = method === 'card'
    ? process.env.PORTONE_CHANNEL_KEY_CARD
    : process.env.PORTONE_CHANNEL_KEY_VBANK
  if (!key) throw new Error(`PORTONE_CHANNEL_KEY_${method.toUpperCase()}가 설정되지 않았습니다.`)
  return key
}

export function isPortOneEnabled(): boolean {
  return Boolean(STORE_ID && API_SECRET)
}

// paymentId: bbk_{applicationId 앞 8자리}_{unix초}_{suffix}
export function generatePaymentId(applicationId: string, suffix: 'deposit' | 'balance'): string {
  const shortId = applicationId.replace(/-/g, '').slice(0, 8)
  const ts = Math.floor(Date.now() / 1000)
  return `bbk_${shortId}_${ts}_${suffix}`
}

// 결제 금액 계산: supply_amount + vat - deposit = balance
export function calcBalance(supplyAmount: number, vat: number, deposit: number): number {
  return (supplyAmount + vat) - deposit
}
