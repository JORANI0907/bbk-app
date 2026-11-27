// 2026-11-27 3단계: 컴팩트 정기 서비스 계약서 v5 (1종) — contract_templates 에 insert.
//   본문 10조 + 별지 「계약 내용」 + 지점 목록 + 서명. 절차 조항은 CP-01, 숫자는 CP-03·CP-05 가 주인.
//   규정 변수 {{규정버전:CP-03}} {{준거문서표}} {{서비스유형}} 은 contract-regulation-vars 에서 치환. (조문 인용 {{규정:CODE:N}} 은 2026-11-27 대표 지시로 쓰지 않음 — 참조만 하고 서명 전 열람으로 갈음)
//   치환 기능이 배포되기 전까지 is_active=false 로 넣는다 (관리자 양식 목록에서 선택 불가).
// 실행: node scripts/contract-template-v5-compact.mjs           → 미리보기(HTML 파일 저장)만
//       node scripts/contract-template-v5-compact.mjs --apply   → DB insert (같은 이름 있으면 갱신)
//       node scripts/contract-template-v5-compact.mjs --apply --activate → is_active=true
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'

config({ path: '.env.local', override: true })
const APPLY = process.argv.includes('--apply')
const ACTIVATE = process.argv.includes('--activate')

const NAME = '정기 서비스 계약서 v5 (컴팩트)'
const p = (t) => `<p>${t}</p>`
const art = (title, lines) => [p(`<strong>${title}</strong>`), ...lines.map((l) => (l.startsWith('<') ? l : p(l)))].join('')
const td = (t, strong = false) => `<td><p>${strong ? `<strong>${t}</strong>` : t}</p></td>`
const kv = (rows) => `<table><tbody>${rows.map(([k, v]) => `<tr>${td(k, true)}${td(v)}</tr>`).join('')}</tbody></table>`
const FILL = '(계약 체결 시 기재)'

const STYLE = `<style>
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css');
body{max-width:800px;margin:0 auto;padding:40px 32px;font-family:'Pretendard Variable',Pretendard,-apple-system,sans-serif;font-size:14px;line-height:1.8;color:#1a1a1a;background:#fff;}
h1{text-align:center;font-size:20px;font-weight:700;margin-bottom:8px;}
h2{font-size:15px;font-weight:700;margin-top:24px;margin-bottom:6px;}
p{margin:6px 0;}
table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px;}
td{border:1px solid #ccc;padding:8px 12px;vertical-align:top;}
hr{border:none;border-top:1px solid #e0e0e0;margin:24px 0;}
blockquote{border-left:3px solid #ddd;margin:12px 0;padding:4px 16px;color:#555;background:#fafafa;}
.check{border:1px solid #ccc;border-radius:8px;padding:12px 16px;margin:12px 0;background:#f7f8fa;}
</style>`

const body =
  `<h1><strong>범빌드코리아 {{서비스유형}} 서비스 계약서</strong></h1>` +
  p('범빌드코리아 주식회사(이하 "회사")와 <strong>고객사</strong>(이하 "고객")는 별지 「계약 내용」에 적은 서비스의 제공과 이용에 관하여 다음과 같이 계약한다. 이 계약서에 정하지 않은 사항은 제9조의 준거 문서에 따른다.') +
  p('') +
  art('제1조 (계약의 내용)', [
    '① 서비스의 종류, 청소 범위, 방문 주기와 시간, 금액, 결제 방식과 기일, 사업장은 별지 「계약 내용」에 따른다.',
    '② 「계약 내용」과 공동계약 지점 목록은 이 계약의 일부이며, 본문과 다를 때는 「계약 내용」이 우선한다.',
  ]) +
  art('제2조 (계약 기간과 연장)', [
    '① 계약 기간은 「계약 내용」의 시작일부터 종료일까지로 한다.',
    '② 기간 만료 30일 전까지 회사 또는 고객이 다른 의사를 서면으로 밝히지 않으면, 이 계약은 같은 조건으로 1년씩 자동 연장된다.',
    '③ 재계약 조건이 달라지는 경우 회사는 만료 30일 전까지 만료 예정일과 새 조건을 서면(이메일·문자·메신저 포함)으로 알린다.',
  ]) +
  art('제3조 (대금과 결제)', [
    '① 고객은 「계약 내용」에 정한 금액을 정한 방식과 기일에 지급한다. 결제 수단, 증빙 발행, 미납 시 서비스 보류와 해지는 「CP-05 결제 및 예약금 정책」에 따른다.',
    '② 회사는 세금계산서 또는 현금영수증을 발행한다. 세금계산서 발행에는 고객의 사업자등록증 사본이 필요하다.',
    '③ 기간 선납 계약은 「계약 내용」에 정한 기일까지 계약금이 납부되지 않으면 효력이 생기지 않는다.',
  ]) +
  art('제4조 (대금 조정)', [
    '① 최저임금 또는 소비자물가지수가 계약 체결일(또는 직전 조정일) 대비 5% 이상, 청소 세제·소모품 원자재 가격이 20% 이상 오른 경우 회사는 대금 조정을 요청할 수 있다.',
    '② 조정은 분기마다 1회, 직전 대금의 5% 이내로 하며 연간 누적 10%를 넘지 않는다. 회사는 시행 30일 전까지 사유·근거·조정 전후 금액을 서면으로 알린다.',
    '③ 고객은 통지를 받은 날부터 15일 이내에 수용·협의·해지 중 하나를 회신할 수 있고, 회신이 없으면 수용한 것으로 본다. 해지하는 경우 제6조의 차등 정산을 적용하지 않는다.',
    '④ 조정은 시행일 이후 제공하는 서비스에만 적용하고 이미 제공한 서비스나 납부한 대금에 소급하지 않는다.',
  ]) +
  art('제5조 (일정)', [
    '① 작업 일정은 「계약 내용」의 주기에 따라 회사와 고객이 협의하여 확정한다.',
    '② 일정 변경·취소, 그에 따른 위약금, 고객 사정으로 작업할 수 없는 경우(폐문·출입 불가 등)의 처리는 「CP-03 예약 취소·변경 및 환불 정책」에 따른다.',
    '③ 회사 사정으로 작업할 수 없는 경우의 대체 일정과 환불은 「CP-01 서비스 이용약관」에 따른다.',
  ]) +
  art('제6조 (중도 해지와 정산)', [
    '① 회사와 고객은 계약 기간 중 서면으로 이 계약을 해지할 수 있다.',
    '② 고객 사정으로 해지하는 경우 이미 제공한 회차는 {{규정버전:CP-03}}의 해약 정산 기준(차등 적용 단가)으로 다시 계산한다. 고객은 서명 전에 그 기준을 열람하고 확인한다.',
    '③ 선납 계약은 납부한 계약금에서 재계산액을 뺀 잔액을 환불하고, 재계산액이 더 크면 차액을 고객이 지급한다. 후불 계약은 재계산액에서 이미 납부한 금액을 뺀 차액을 고객이 지급한다.',
    '④ 회사는 해지 통지를 받은 날부터 7영업일 이내에 정산서를 보낸다. 환불은 같은 기간 안에, 고객의 추가 지급은 정산서를 받은 날부터 7일 이내에 한다.',
    '⑤ 고객이 결제 기일을 지키지 않거나, 회사 작업자에게 폭언·폭행·성희롱을 하거나, 정당한 사유 없이 2회 연속 작업을 거부하거나, 출입 방법 변경을 알리지 않아 2회 이상 작업이 불가능한 경우 회사는 즉시 해지하고 ②·③항에 따라 정산할 수 있다. 세부 사유는 「CP-01 서비스 이용약관」에 따른다.',
  ]) +
  art('제7조 (품질 보증)', [
    '① 고객은 작업 완료일부터 7일 이내(겉으로 드러나지 않은 하자는 발견일부터 30일 이내)에 품질 이의를 제기할 수 있고, 회사는 3영업일 이내에 무상으로 재작업한다.',
    '② 2회 재작업 후에도 기준에 미달하면 해당 회차 요금을 환불한다. 완료 보고서, 검수, 재작업 범위의 세부는 「CP-01 서비스 이용약관」에 따른다.',
  ]) +
  art('제8조 (책임과 면책)', [
    '① 회사는 회사의 귀책으로 고객의 시설·설비를 파손한 경우 배상한다.',
    '② 경과실로 인한 배상은 회사가 가입한 손해배상책임보험의 보상 한도 안에서 하며, 보험 자기부담금은 회사가 부담한다. 고의 또는 중대한 과실로 인한 손해는 한도 없이 배상한다. 회사는 고객이 요청하면 보험 가입 증명을 제공한다.',
    '③ 노후 시설의 자연 파손, 불가항력, 고객이 알리지 않은 위험 요소 등으로 생긴 손해는 책임지지 않는다. 면책 사유의 세부는 「CP-01 서비스 이용약관」에 따른다.',
    '④ 고객은 작업자의 안전을 위해 필요한 조치를 하며, 그 미비로 작업자가 상해를 입은 경우 책임을 진다.',
  ]) +
  art('제9조 (준거 문서)', [
    '① 아래 문서는 이 계약의 일부이며, 고객은 서명 전에 열람하였음을 확인한다. 문서 사이의 우선순위는 「CP-01 서비스 이용약관」에 따른다.',
    '{{준거문서표}}',
    '② 회사가 준거 문서를 개정하는 경우 시행 30일 전까지 고객에게 알린다. 이미 체결된 이 계약에는 서명 당시의 판이 적용되며, 고객에게 유리한 개정은 고객이 원하면 바로 적용한다.',
  ]) +
  art('제10조 (효력)', [
    '① 이 계약서는 전자문서로 작성하며, 전자서명은 서면 서명과 같은 효력이 있다.',
    '② 일부 조항이 무효가 되어도 나머지 조항은 유효하다.',
    '③ 이 계약의 변경은 회사와 고객의 서면 합의로만 한다.',
    '④ 분쟁은 먼저 협의로 해결하고, 해결되지 않으면 회사 본점 소재지 관할 법원(수원지방법원 성남지원)에 따른다.',
    '⑤ 이 계약 체결 전에 회사와 고객 사이에 있던 같은 서비스에 관한 계약이나 합의는 이 계약으로 대체한다.',
  ]) +
  p('') +
  `<p style="text-align: center;"><strong>계약 체결일: {{오늘날짜}}</strong></p>` +
  `<hr><h2><strong>별지 1 · 계약 내용</strong></h2>` +
  // 아래 변수는 계약서 작성 모달 입력값으로 채워진다 (lib/contract-terms.ts). 비면 "(계약 체결 시 기재)" 가 남아 편집기에서 채운다.
  kv([
    ['서비스 유형', '{{서비스유형}}'],
    ['계약 기간', '{{계약기간}}'],
    ['청소 범위', '{{청소범위}}'],
    ['방문 주기 · 요일 · 시간', '{{방문주기}}'],
    ['회당 공급가액', '{{회당공급가액}}'],
    ['회당 부가세', '{{회당부가세}}'],
    ['회당 총액 (부가세 포함)', '{{회당총액}}'],
    ['결제 방식 · 기일', '{{결제방식}}'],
    ['사업장', '{{사업장}}'],
  ]) +
  p('<strong>별지 2 · 공동계약 지점 목록</strong> (공동계약인 경우에만 기재)') +
  `<table><tbody><tr>${['순번', '지점명', '사업자등록번호', '주소', '방문 예정(회차·범위)'].map((h) => td(h, true)).join('')}</tr>` +
  `<tr>${td('1')}${td(FILL)}${td('')}${td('')}${td('')}</tr><tr>${td('2')}${td('')}${td('')}${td('')}${td('')}</tr></tbody></table>` +
  `<div class="check">` +
  p('<strong>중요 내용 확인</strong> — 고객은 서명 전에 다음 내용을 확인하였다.') +
  p('☐ 계약 기간 만료 30일 전까지 의사표시가 없으면 같은 조건으로 1년 자동 연장된다 (제2조)') +
  p('☐ 중도 해지 시 이미 받은 회차를 차등 적용 단가로 다시 계산하여 정산한다 (제6조)') +
  p('☐ 회사의 경과실 배상은 가입한 배상책임보험의 보상 한도 안에서 한다 (제8조)') +
  p('☐ 준거 문서(이용약관·환불 정책·결제 정책·개인정보처리방침)를 열람하였다 (제9조)') +
  `</div>` +
  `<hr><h2>공급사 【회사】</h2>` +
  kv([
    ['공급사명', '범빌드코리아 주식회사'],
    ['사업자번호', '398-81-04260'],
    ['대표자', '조동환'],
    ['연락처', '1522-9597'],
    ['주소', '경기도 성남시 둔촌대로268번길 22 201호'],
  ]) +
  p('성명(서명): <strong>조동환</strong> {{공급사서명}} &nbsp;&nbsp; 직인: {{공급사직인}}') +
  `<hr><h2>고객사 【고객】</h2>` +
  p(' {{인적사항표}}') +
  `<hr>` +
  p('성명(서명): <strong>{{고객성명}}</strong> {{고객서명}} &nbsp;&nbsp;&nbsp; 직인: {{고객사직인}}')

const html = `<!DOCTYPE html>\n<html lang="ko">\n<head>\n<meta charset="UTF-8">\n${STYLE}\n</head>\n<body>\n${body}\n</body>\n</html>`

/** 4단계 B·C·E 가 읽는 설정. 규정 코드만 적고 판은 계약 생성 시점의 발행본으로 고정한다. */
const varConfig = {
  schema: 'v5-compact',
  regulation_refs: ['CP-01', 'CP-02', 'CP-03', 'CP-05'],
  optional_refs: [{ code: 'CP-04', when: 'joint_contract' }],
  regulation_vars: ['{{규정버전:CP-03}}', '{{준거문서표}}', '{{서비스유형}}'],
  key_clauses: [
    { key: 'auto_renew', label: '계약 기간 만료 30일 전까지 의사표시가 없으면 같은 조건으로 1년 자동 연장됩니다 (제2조)' },
    { key: 'termination_settlement', label: '중도 해지 시 이미 받은 회차를 차등 적용 단가로 다시 계산하여 정산합니다 (제6조)' },
    { key: 'liability_cap', label: '회사의 경과실 배상은 가입한 배상책임보험의 보상 한도 안에서 합니다 (제8조)' },
    { key: 'reference_docs', label: '준거 문서(이용약관·환불 정책·결제 정책·개인정보처리방침)를 열람하였습니다 (제9조)' },
  ],
}

const plain = html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, '')
const articles = (body.match(/<strong>제\d+조/g) ?? []).length
console.log(`${NAME}: 본문 ${articles}개 조, 전체 ${plain.replace(/\s+/g, '').length}자 (현행 ver4 약 12,700자)`)

mkdirSync('scripts/_contract-v5-out', { recursive: true })
writeFileSync('scripts/_contract-v5-out/v5-compact.html', html)
console.log('미리보기 저장: scripts/_contract-v5-out/v5-compact.html')

if (!APPLY) { console.log('(dry-run) --apply 로 DB 반영'); process.exit(0) }

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const row = {
  name: NAME,
  description: '2026-11-27 압축판. 본문 10조 + 별지. 절차는 CP-01, 숫자는 CP-03·CP-05 참조. 규정 변수 치환(4단계 B) 배포 후 활성화.',
  html_body: html,
  var_config: varConfig,
  custom_vars: {},
  party_type: 'customer',
  is_active: ACTIVATE,
}
const { data: existing, error: qErr } = await supabase.from('contract_templates').select('id').eq('name', NAME).maybeSingle()
if (qErr) throw new Error(qErr.message)
const res = existing
  ? await supabase.from('contract_templates').update({ ...row, updated_at: new Date().toISOString() }).eq('id', existing.id).select('id').single()
  : await supabase.from('contract_templates').insert(row).select('id').single()
if (res.error) throw new Error(res.error.message)
console.log(`${existing ? '갱신' : '생성'} ${NAME} → ${res.data.id} (is_active=${ACTIVATE})`)
