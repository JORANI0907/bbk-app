/**
 * 가상계좌 발급 시 고객이 선택할 수 있는 은행 목록 (BBK 메이저 12개).
 *
 * ⚠️ 주의: code 값은 PortOne V2 **server-sdk** Bank enum 과 정확히 일치해야 함.
 * (node_modules/@portone/server-sdk/dist/generated/common/Bank.d.ts 참고)
 * browser-sdk 의 enum 과 다름 (browser: 'KOOKMIN_BANK', server: 'KOOKMIN').
 * payInstantly 는 server-sdk 를 쓰므로 서버 enum 값 사용.
 */
export const BBK_VBANK_BANKS = [
  { code: 'KOOKMIN',            name: '국민은행'     },
  { code: 'SHINHAN',            name: '신한은행'     },
  { code: 'WOORI',              name: '우리은행'     },
  { code: 'HANA',               name: '하나은행'     },
  { code: 'IBK',                name: '기업은행'     },
  { code: 'NONGHYUP',           name: 'NH농협은행'   },
  { code: 'KAKAO',              name: '카카오뱅크'   },
  { code: 'TOSS',               name: '토스뱅크'     },
  { code: 'POST',               name: '우체국'       },
  { code: 'SUHYUP',             name: '수협은행'     },
  { code: 'KFCC',               name: '새마을금고'   },
  { code: 'STANDARD_CHARTERED', name: 'SC제일은행'   },
] as const

export type BBKVBankCode = typeof BBK_VBANK_BANKS[number]['code']

export const DEFAULT_VBANK_CODE: BBKVBankCode = 'KOOKMIN'

/** 코드가 BBK 지원 은행인지 검증 */
export function isValidBBKVBankCode(code: string): code is BBKVBankCode {
  return BBK_VBANK_BANKS.some((b) => b.code === code)
}

/** 코드 → 한글 은행명 */
export function getBankLabel(code: string): string {
  const found = BBK_VBANK_BANKS.find((b) => b.code === code)
  return found?.name ?? code
}
