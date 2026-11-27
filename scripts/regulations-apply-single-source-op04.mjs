// 2026-11-27 단일 출처 정비 — OP-04 고객 서비스 시나리오 안내서에 남아 있던 규칙 숫자 제거.
//   예약금 금액 → CP-05, 클레임 기한 → CP-01, 장기(재계약) 할인율 → 삭제(2026-11-25 재구매 조항 전 양식 삭제 결정과 정합)
// 실행: node scripts/regulations-apply-single-source-op04.mjs → node scripts/seed-regulations.mjs --apply --only OP-04
import { readFileSync, writeFileSync } from 'node:fs'

const F = 'scripts/regulations-seed/OP-04.json'
const s = JSON.parse(readFileSync(F, 'utf8'))
const pairs = [
  ['<p>3. 예약금(80,000원)을 안내하고 입금을 확인한다.</p>', '<p>3. 예약금을 안내하고 입금을 확인한다. 금액과 결제 수단은 「CP-05 결제 및 예약금 정책」에 따른다.</p>'],
  ['<p>① 고객이 시공 후 7일 이내에 클레임을 통지한 경우 회사는 3영업일 이내에 무상으로 재작업한다.</p>', '<p>① 클레임의 통지 기한과 무상 재작업 기한은 「CP-01 서비스 이용약관」의 품질 보증 조항에 따르며, 접수·처리 절차는 「OP-09 클레임·불만 접수 및 처리 절차」에 따른다.</p>'],
  ['<p>① 계약 만료 1개월 전에 고객에게 재계약을 안내한다.</p>', '<p>① 계약서에 정한 자동 연장 통지 기한에 맞춰 고객에게 계약 만료 예정과 재계약 조건을 안내한다.</p>'],
  ['<p>② 재계약 안내 시 장기 할인 혜택(2년차 15%, 3년차 25%)을 함께 안내한다.</p>', '<p>② 재계약 조건(단가·범위·주기)은 계약서 「계약 내용」과 비용 기준 탭에 따르며, 이 안내서에 별도 할인율을 두지 아니한다.</p>'],
]
for (const [from, to] of pairs) {
  if (!s.html_body.includes(from)) throw new Error(`치환 대상 없음: ${from.slice(0, 40)}`)
  s.html_body = s.html_body.split(from).join(to)
}
s.change_summary = '단일 출처 정비 — 예약금 금액·클레임 기한·장기 할인율 삭제, CP-05·CP-01 참조 (2026-11-27 대표 결정)'
s.review_notes = '[2026-11-27] 장기 할인(2년차 15%, 3년차 25%)은 2026-11-25 전 계약서 양식에서 재구매 조항을 삭제한 결정과 맞지 않아 삭제. 재계약 조건은 계약서·비용 기준 탭이 주인.\n' + s.review_notes
writeFileSync(F, JSON.stringify(s, null, 2) + '\n')
console.log('OP-04 정비 완료')
