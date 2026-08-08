/**
 * 국민은행 급여이체(obiz) 파일 A열용 은행 대표 코드.
 * 직원관리 UI 드롭다운 · 급여이체 시트 A열에 공통 사용.
 */

export interface BankOption {
  code: string  // 3자리 대표 코드
  name: string  // 표기용 한글명
}

export const BANK_OPTIONS: BankOption[] = [
  { code: '004', name: '국민' },
  { code: '003', name: '기업' },
  { code: '011', name: '농협' },
  { code: '088', name: '신한' },
  { code: '020', name: '우리' },
  { code: '081', name: 'KEB하나' },
  { code: '090', name: '카카오뱅크' },
  { code: '092', name: '토스뱅크' },
  { code: '089', name: '케이뱅크' },
  { code: '071', name: '우체국' },
  { code: '007', name: '수협' },
  { code: '045', name: '새마을금고' },
  { code: '048', name: '신협' },
  { code: '050', name: '저축' },
  { code: '027', name: '씨티' },
  { code: '023', name: 'SC' },
  { code: '039', name: '경남' },
  { code: '034', name: '광주' },
  { code: '031', name: '아이엠뱅크' },
  { code: '032', name: '부산' },
  { code: '002', name: '산업' },
  { code: '037', name: '전북' },
  { code: '035', name: '제주' },
  { code: '054', name: 'HSBC' },
]

// name → code 조회 (레거시 account_number "국민 123..." 파싱 결과 매핑에도 사용)
const NAME_TO_CODE = new Map<string, string>()
for (const b of BANK_OPTIONS) {
  NAME_TO_CODE.set(b.name, b.code)
  NAME_TO_CODE.set(b.name.toLowerCase(), b.code)
  // 자주 붙는 접미사 대응
  NAME_TO_CODE.set(`${b.name}은행`, b.code)
}
// 별칭 · 흔한 오탈자
NAME_TO_CODE.set('KB', '004')
NAME_TO_CODE.set('kb', '004')
NAME_TO_CODE.set('국민은행', '004')
NAME_TO_CODE.set('하나', '081')
NAME_TO_CODE.set('하나은행', '081')
NAME_TO_CODE.set('IBK', '003')
NAME_TO_CODE.set('IBK기업', '003')
NAME_TO_CODE.set('농협은행', '011')
NAME_TO_CODE.set('NH', '011')
NAME_TO_CODE.set('NH농협', '011')
NAME_TO_CODE.set('신한은행', '088')
NAME_TO_CODE.set('우리은행', '020')
NAME_TO_CODE.set('대구', '031')      // 대구은행 → IM(아이엠뱅크)로 변경
NAME_TO_CODE.set('대구은행', '031')
NAME_TO_CODE.set('SC제일', '023')
NAME_TO_CODE.set('제일', '023')
NAME_TO_CODE.set('카카오', '090')
NAME_TO_CODE.set('토스', '092')

export function bankNameToCode(name: string | null | undefined): string | null {
  if (!name) return null
  const trimmed = name.trim()
  return NAME_TO_CODE.get(trimmed) ?? NAME_TO_CODE.get(trimmed.toLowerCase()) ?? null
}
