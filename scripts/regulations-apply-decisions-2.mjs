// 2026-11-23 대표 결정 2차: ① 위약금은 예약금(기납부액) 한도 ② 회사 사정 취소 시 환불·대체일정으로 책임 한정
// ③ 계약서 일정 변경 기한 10일→7일(계약서는 별도 SQL) ④ 고객 대표 연락처 1522-9597 통일
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const DIR = 'scripts/regulations-seed'
const load = (c) => JSON.parse(readFileSync(`${DIR}/${c}.json`, 'utf8'))
const save = (c, s) => writeFileSync(`${DIR}/${c}.json`, JSON.stringify(s, null, 2) + '\n')
const replaceOnce = (html, from, to) => {
  if (!html.includes(from)) throw new Error(`문구 없음: ${from.slice(0, 40)}`)
  return html.replace(from, to)
}

// ① ② CP-03
const cp03 = load('CP-03')
cp03.html_body = replaceOnce(cp03.html_body,
  '② 위약금은 서비스 요금을 기준으로 계산합니다. 이용자가 서비스 요금의 일부만 결제한 경우에는 결제한 금액에서 위약금을 공제하고, 위약금이 결제한 금액보다 크면 그 차액을 청구할 수 있습니다. [확인: 1차 결제(예약금)만 받은 경우 차액 청구 여부]',
  '② 위약금은 서비스 요금을 기준으로 계산하되, 이용자가 이미 결제한 금액(예약금 등)을 한도로 합니다. 위약금이 결제한 금액보다 크더라도 그 차액은 청구하지 않습니다.')
cp03.html_body = replaceOnce(cp03.html_body,
  '② 회사 사정으로 남은 일수 6일 이하에 취소하여 이용자에게 손해가 생긴 경우, 회사는 이용자와 협의하여 배상합니다. [확인: 공정위 소비자분쟁해결기준과 같이 제3조와 같은 비율로 배상할지 여부]',
  '② 회사 사정으로 취소하는 경우 회사의 책임은 결제 금액의 전액 환불 또는 이용자가 동의한 대체 일정의 제공으로 한정하며, 그 밖의 손해는 배상하지 않습니다. 다만 회사의 고의 또는 중대한 과실로 인한 손해는 그러하지 않습니다.')
cp03.review_notes = cp03.review_notes
  .replace(/\[확인\] 제3조 ②:[^\n]*\n/, '[결정 2026-11-23] 제3조 ②: 위약금은 기납부액(예약금) 한도, 차액 미청구.\n')
  .replace(/\[확인\] 제7조 ②:[^\n]*\n/, '[결정 2026-11-23] 제7조 ②: 회사 사정 취소는 환불·대체 일정으로 책임 한정(고의·중과실 제외 — 약관규제법 제7조 때문에 예외 문구 필수).\n')
  .replace(/계약서 ver4 제7조 ②는 "10일 전"이라 이 정책\(7일\)과 다름 — 다음 계약서 개정 때 7일로 맞출지 결정\./, '계약서 ver4 제7조 ②는 7일로 맞춤(2026-11-23 양식 2종·잇퍼스트 초안 수정).')
  .replace(/\[확인\] 연락처:[^\n]*$/, '[결정 2026-11-23] 고객 대표 연락처 1522-9597로 통일(OP-06·08·09·11·12 반영).')
save('CP-03', cp03)

// ① OP-06
const op06 = load('OP-06')
op06.html_body = replaceOnce(op06.html_body,
  '② 위약금은 해당 서비스 요금(부가세 포함)을 기준으로 계산하며, 예약금 등 기납부액에서 공제한다. [확인: 위약금이 기납부액을 넘을 때 차액 청구 여부]',
  '② 위약금은 해당 서비스 요금(부가세 포함)을 기준으로 계산하되 예약금 등 기납부액을 한도로 하며, 차액은 청구하지 아니한다.')
save('OP-06', op06)

// ④ 고객 대면 규정의 연락처 통일
const PHONE_OLD = /031-759-4877\s*\/\s*010-5434-4877|031-759-4877/g
for (const f of readdirSync(DIR).filter((n) => /^(OP|CP)-\d+\.json$/.test(n))) {
  const code = f.replace('.json', '')
  const s = load(code)
  if (!PHONE_OLD.test(s.html_body)) continue
  PHONE_OLD.lastIndex = 0
  s.html_body = s.html_body.replace(PHONE_OLD, '1522-9597')
  s.review_notes = `[결정 2026-11-23] 연락처를 1522-9597로 통일.\n` + (s.review_notes ?? '')
  save(code, s)
  console.log(`${code}: 연락처 교체`)
}
console.log('완료')
