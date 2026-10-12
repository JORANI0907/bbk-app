/**
 * 가상계좌 발급 시 고객이 선택할 수 있는 은행 목록 (BBK 메이저 12개).
 *
 * PortOne V2 공식 Bank enum 중 KG이니시스가 지원하고 BBK가 노출하기로 결정한 범위.
 * - 전체(70+)를 노출하지 않는 이유: 선택지 과다 → 결제 포기율 상승 + "내 거래은행이 없네" 이탈.
 * - 메이저 12개로 한국 가상계좌 입금의 95%+ 커버.
 *
 * 확장 시: 아래 배열에 { code, name } 추가. code 는 PortOne Bank enum 값과 정확히 일치해야 함.
 * (node_modules/@portone/browser-sdk/dist/v2/entity/Bank.d.ts 참고)
 */
export const BBK_VBANK_BANKS = [
  { code: 'KOOKMIN_BANK',             name: '국민은행'     },
  { code: 'SHINHAN_BANK',             name: '신한은행'     },
  { code: 'WOORI_BANK',               name: '우리은행'     },
  { code: 'HANA_BANK',                name: '하나은행'     },
  { code: 'INDUSTRIAL_BANK_OF_KOREA', name: '기업은행'     },
  { code: 'NH_NONGHYUP_BANK',         name: 'NH농협은행'   },
  { code: 'KAKAO_BANK',               name: '카카오뱅크'   },
  { code: 'TOSS_BANK',                name: '토스뱅크'     },
  { code: 'EPOST',                    name: '우체국'       },
  { code: 'SUHYUP_BANK',              name: '수협은행'     },
  { code: 'KFCC',                     name: '새마을금고'   },
  { code: 'SC_BANK_KOREA',            name: 'SC제일은행'   },
] as const

export type BBKVBankCode = typeof BBK_VBANK_BANKS[number]['code']

export const DEFAULT_VBANK_CODE: BBKVBankCode = 'KOOKMIN_BANK'

/** 코드가 BBK 지원 은행인지 검증 */
export function isValidBBKVBankCode(code: string): code is BBKVBankCode {
  return BBK_VBANK_BANKS.some((b) => b.code === code)
}

/** 코드 → 한글 은행명 */
export function getBankLabel(code: string): string {
  const found = BBK_VBANK_BANKS.find((b) => b.code === code)
  return found?.name ?? code
}
