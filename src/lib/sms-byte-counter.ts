/**
 * Phase 25: SMS/LMS byte 계산 유틸 (SolAPI 표준 EUC-KR 기준)
 * - 한글·특수 유니코드: 2 byte
 * - ASCII (영문·숫자·공백·기본 기호): 1 byte
 */

export function countSmsBytes(text: string): number {
  if (!text) return 0
  let bytes = 0
  for (const c of text) {
    bytes += c.charCodeAt(0) > 127 ? 2 : 1
  }
  return bytes
}

export type MessageType = 'SMS' | 'LMS' | 'OVER'

export function classifyMessage(text: string): MessageType {
  const bytes = countSmsBytes(text)
  if (bytes <= 90) return 'SMS'
  if (bytes <= 2000) return 'LMS'
  return 'OVER'
}

/** SolAPI 대략 단가 (KRW). 정확한 청구는 계약에 따름 */
export function estimatedSmsCost(text: string): number {
  const type = classifyMessage(text)
  if (type === 'SMS') return 20
  if (type === 'LMS') return 50
  return 0
}

export function messageTypeLabel(type: MessageType): string {
  switch (type) {
    case 'SMS': return 'SMS 단문'
    case 'LMS': return 'LMS 장문'
    case 'OVER': return '초과 (발송 불가)'
  }
}

export const SMS_MAX_BYTES = 90
export const LMS_MAX_BYTES = 2000
