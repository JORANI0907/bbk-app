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

export function getChannelKey(method: 'card' | 'vbank' | 'transfer'): string {
  // KG이니시스는 "일반결제 채널 하나"에 카드·계좌이체·가상계좌 모두 포함.
  // 폴백 체인: 서버 전용 env → 다른 서버 전용 env → NEXT_PUBLIC_ 환경변수.
  // NEXT_PUBLIC_* 는 Next.js 에서 브라우저용으로 노출되지만 서버에서도 그대로 읽을 수 있어
  //   "접두사 불일치로 서버에서 환경변수 못 찾는 사고" 방지의 최종 안전망 역할.
  if (method === 'card') {
    const key = process.env.PORTONE_CHANNEL_KEY_CARD
             || process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_CARD
    if (!key) throw new Error('PORTONE_CHANNEL_KEY_CARD (서버) 또는 NEXT_PUBLIC_PORTONE_CHANNEL_KEY_CARD 가 설정되지 않았습니다.')
    return key
  }
  if (method === 'vbank') {
    const key = process.env.PORTONE_CHANNEL_KEY_VBANK
             || process.env.PORTONE_CHANNEL_KEY_CARD
             || process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_CARD
    if (!key) throw new Error('PORTONE_CHANNEL_KEY_VBANK / CARD / NEXT_PUBLIC_* 모두 미설정.')
    return key
  }
  // transfer
  const key = process.env.PORTONE_CHANNEL_KEY_TRANSFER
           || process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_TRANSFER
           || process.env.PORTONE_CHANNEL_KEY_CARD
           || process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_CARD
  if (!key) throw new Error('PORTONE_CHANNEL_KEY_TRANSFER / NEXT_PUBLIC_* / CARD 모두 미설정.')
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
