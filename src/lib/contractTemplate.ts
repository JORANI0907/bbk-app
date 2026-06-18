/**
 * 범빌드코리아 딥케어 청소 구독 서비스 계약서 템플릿
 * 변수 치환 및 HTML 렌더링
 */

export interface ContractVariables {
  contractYear: string
  contractMonth: string
  contractDay: string
  customerBusinessName: string
  customerBusinessNumber: string
  customerOwnerName: string
  customerAddress: string
  customerPhone: string
  customerEmail: string
  servicePlan: string
  visitOption: string
  monthlyPrice: string
  annualPrice: string
  contractStartDate: string
  contractEndDate: string
  selectedItemsList: string
}

const CONTRACT_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css');
  body {
    max-width: 800px;
    margin: 0 auto;
    padding: 40px 32px;
    font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
    font-size: 14px;
    line-height: 1.8;
    color: #1a1a1a;
    background: #fff;
  }
  h1 {
    text-align: center;
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 8px;
    letter-spacing: -0.3px;
  }
  .subtitle {
    text-align: center;
    font-size: 13px;
    color: #555;
    margin-bottom: 32px;
  }
  .article-title {
    font-weight: 700;
    font-size: 14px;
    margin-top: 24px;
    margin-bottom: 6px;
  }
  .article-content {
    margin-left: 12px;
    color: #333;
  }
  .article-content p {
    margin: 4px 0;
  }
  .parties-section {
    margin-top: 40px;
    display: flex;
    gap: 32px;
    flex-wrap: wrap;
  }
  .party-block {
    flex: 1;
    min-width: 280px;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 20px;
  }
  .party-title {
    font-weight: 700;
    font-size: 15px;
    margin-bottom: 12px;
    color: #1a1a1a;
    border-bottom: 1px solid #eee;
    padding-bottom: 8px;
  }
  .party-row {
    display: flex;
    gap: 8px;
    margin: 5px 0;
    font-size: 13px;
  }
  .party-label {
    color: #666;
    min-width: 80px;
    flex-shrink: 0;
  }
  .party-value {
    color: #1a1a1a;
    font-weight: 500;
  }
  .contract-info-box {
    background: #f8f8f8;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 32px;
  }
  .contract-info-row {
    display: flex;
    gap: 12px;
    margin: 6px 0;
    font-size: 13px;
  }
  .contract-info-label {
    color: #666;
    min-width: 120px;
    flex-shrink: 0;
  }
  .contract-info-value {
    font-weight: 600;
    color: #1a1a1a;
  }
  .date-section {
    text-align: center;
    margin-top: 32px;
    font-size: 15px;
    font-weight: 600;
    color: #333;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
    font-size: 13px;
  }
  th {
    background: #f0f0f0;
    border: 1px solid #ccc;
    padding: 8px 12px;
    text-align: left;
    font-weight: 600;
  }
  td {
    border: 1px solid #ccc;
    padding: 8px 12px;
    vertical-align: top;
  }
  .highlight {
    color: #1a56db;
    font-weight: 600;
  }
  hr {
    border: none;
    border-top: 1px solid #e0e0e0;
    margin: 24px 0;
  }
</style>
</head>
<body>

<h1>범빌드코리아 딥케어 청소 구독 서비스 계약서</h1>
<p class="subtitle">
  본 계약은 범빌드코리아(이하 "갑")와 고객(이하 "을") 간에 상업용 주방 및 시설물에 대한<br>
  전문 딥케어 청소 서비스의 제공과 이용에 관하여 다음과 같이 합의한다.
</p>

<div class="contract-info-box">
  <div class="contract-info-row"><span class="contract-info-label">서비스 플랜</span><span class="contract-info-value highlight">{{SERVICE_PLAN}}</span></div>
  <div class="contract-info-row"><span class="contract-info-label">방문 주기</span><span class="contract-info-value">{{VISIT_OPTION}}</span></div>
  <div class="contract-info-row"><span class="contract-info-label">월 요금</span><span class="contract-info-value">{{MONTHLY_PRICE}}원 (VAT 포함)</span></div>
  <div class="contract-info-row"><span class="contract-info-label">연간 요금</span><span class="contract-info-value">{{ANNUAL_PRICE}}원 (VAT 포함)</span></div>
  <div class="contract-info-row"><span class="contract-info-label">계약 기간</span><span class="contract-info-value">{{CONTRACT_START_DATE}} ~ {{CONTRACT_END_DATE}}</span></div>
</div>

<p class="article-title">[제1조 목적]</p>
<div class="article-content">
  <p>본 계약은 갑이 을에게 제공하는 딥케어 청소 구독 서비스의 범위, 조건, 의무 및 권리를 명확히 하여 상호 신뢰를 바탕으로 지속적인 서비스 관계를 유지함을 목적으로 한다.</p>
</div>

<p class="article-title">[제2조 서비스 내용]</p>
<div class="article-content">
  <p>① 갑은 을의 사업장 내 주방 및 시설물에 대한 딥케어 청소 서비스를 정기적으로 제공한다.</p>
  <p>② 서비스 플랜: <strong>{{SERVICE_PLAN}}</strong> / 방문 주기: <strong>{{VISIT_OPTION}}</strong></p>
  <p>③ 청소 항목은 별표 1 및 별표 2에 기재된 항목을 기준으로 한다.</p>
  <p>④ 고객이 선택한 청소 품목: {{SELECTED_ITEMS_LIST}}</p>
</div>

<p class="article-title">[제3조 계약 기간]</p>
<div class="article-content">
  <p>① 본 계약의 유효기간은 <strong>{{CONTRACT_START_DATE}}</strong>부터 <strong>{{CONTRACT_END_DATE}}</strong>까지로 한다.</p>
  <p>② 계약 기간 만료 30일 전까지 어느 일방이 서면으로 해지 의사를 표시하지 않으면 동일한 조건으로 1년 자동 연장된다.</p>
</div>

<p class="article-title">[제4조 서비스 요금]</p>
<div class="article-content">
  <p>① 월 요금: <strong>{{MONTHLY_PRICE}}원</strong> (부가세 포함)</p>
  <p>② 연간 요금: <strong>{{ANNUAL_PRICE}}원</strong> (부가세 포함)</p>
  <p>③ 요금은 매월 지정된 결제일에 납부하며, 갑의 청구서 발행 후 7일 이내 결제한다.</p>
  <p>④ 3일 이상 납부 지연 시 갑은 서비스 제공을 일시 중단할 수 있다.</p>
</div>

<p class="article-title">[제5조 서비스 일정 조정]</p>
<div class="article-content">
  <p>① 서비스 일정은 쌍방 협의 하에 변경 가능하며, 변경 요청은 서비스 예정일 3영업일 전까지 통보하여야 한다.</p>
  <p>② 을의 사정으로 인한 일정 변경 시, 갑은 합리적인 범위 내에서 일정을 재조정한다.</p>
  <p>③ 갑의 사정으로 인한 일정 변경 시, 갑은 사전 통보 후 동등한 수준의 서비스를 대체 일정에 제공한다.</p>
</div>

<p class="article-title">[제6조 서비스 품질 보증]</p>
<div class="article-content">
  <p>① 갑은 계약서에 명시된 청소 항목에 대해 전문적이고 성실한 서비스를 제공한다.</p>
  <p>② 서비스 완료 후 24시간 이내 품질 불만이 접수될 경우, 갑은 48시간 내에 재작업 여부를 결정하고 무상으로 보완한다.</p>
  <p>③ 정당한 재작업 요청은 계약 기간 중 월 1회까지 허용된다.</p>
</div>

<p class="article-title">[제7조 갑의 의무]</p>
<div class="article-content">
  <p>① 갑은 약속된 일정에 맞게 서비스를 제공하며, 전문 인력을 배치한다.</p>
  <p>② 갑은 서비스 과정에서 을의 재산을 손상하지 않도록 주의한다.</p>
  <p>③ 갑은 서비스 수행 중 습득한 을의 기업 정보를 외부에 유출하지 않는다.</p>
  <p>④ 갑은 서비스 완료 후 작업 사진과 체크리스트를 디지털 리포트로 제공한다.</p>
</div>

<p class="article-title">[제8조 서비스 제공 장소 및 환경]</p>
<div class="article-content">
  <p>① 을은 서비스 제공 장소에 대한 안전한 접근을 보장하고, 작업에 필요한 환경을 갖추어야 한다.</p>
  <p>② 서비스 장소의 온수, 전기, 개수대 등 기본 시설 이용을 허용하며, 이와 관련한 비용은 을이 부담한다.</p>
  <p>③ 을이 서비스 환경을 제공하지 못할 경우, 해당 방문은 서비스 완료로 처리되지 않으며 추후 재방문 시 추가 비용이 발생할 수 있다.</p>
  <p>④ 위험물질, 과도한 폐수, 구조적 손상 등 정상적인 서비스가 불가한 환경에서는 서비스 제공을 거절할 수 있으며, 이 경우 해당 회차 요금은 환불되지 않는다.</p>
</div>

<p class="article-title">[제9조 을의 의무]</p>
<div class="article-content">
  <p>① 을은 약속된 서비스 일정에 갑의 직원이 작업할 수 있는 환경을 제공한다.</p>
  <p>② 을은 서비스 요금을 기한 내에 납부한다.</p>
  <p>③ 을은 갑의 서비스 직원에 대한 부당한 대우를 하지 않는다.</p>
</div>

<p class="article-title">[제10조 계약 해지]</p>
<div class="article-content">
  <p>① 다음의 경우 계약을 즉시 해지할 수 있다.</p>
  <p>&nbsp;&nbsp;- 일방의 중대한 계약 위반이 있고 7일 이내 시정이 이루어지지 않은 경우</p>
  <p>&nbsp;&nbsp;- 을의 요금 미납이 2회 이상 연속으로 발생한 경우</p>
  <p>&nbsp;&nbsp;- 을이 사업을 폐업하거나 법인이 청산된 경우</p>
  <p>② 을이 계약 기간 중 중도 해지를 원할 경우, 잔여 계약 기간의 20%에 해당하는 위약금이 발생한다.</p>
  <p>③ 갑의 귀책 사유로 계약이 해지될 경우 잔여 기간에 해당하는 요금을 전액 환불한다.</p>
</div>

<p class="article-title">[제11조 손해배상]</p>
<div class="article-content">
  <p>① 갑의 서비스 이행 중 직접적인 과실로 을의 재산에 손해를 끼친 경우, 갑은 실손해액을 배상한다.</p>
  <p>② 단, 을의 고의 또는 과실로 인한 손해, 천재지변, 불가항력적 사유로 인한 손해는 배상 책임에서 제외된다.</p>
  <p>③ 손해배상 청구는 손해 발생일로부터 30일 이내에 서면으로 제기하여야 한다.</p>
</div>

<p class="article-title">[제12조 면책 조항]</p>
<div class="article-content">
  <p>① 갑은 천재지변, 전쟁, 파업, 팬데믹, 정부 지침 등 불가항력적 사유로 서비스 제공이 불가능한 경우 책임을 지지 않는다.</p>
  <p>② 을이 제공한 부정확한 정보로 인해 발생한 문제에 대해 갑은 책임을 지지 않는다.</p>
</div>

<p class="article-title">[제13조 비밀유지]</p>
<div class="article-content">
  <p>① 쌍방은 본 계약의 이행 과정에서 취득한 상대방의 영업비밀, 기업정보, 고객정보 등을 계약 기간 중 및 계약 종료 후 3년간 제3자에게 누설하지 않는다.</p>
  <p>② 비밀유지 의무 위반 시, 위반한 당사자는 상대방이 입은 모든 손해를 배상한다.</p>
</div>

<p class="article-title">[제14조 개인정보 보호]</p>
<div class="article-content">
  <p>① 갑은 서비스 이행을 위해 수집한 을의 개인정보(대표자 성명, 연락처, 주소 등)를 「개인정보 보호법」에 따라 적법하게 처리한다.</p>
  <p>② 수집된 개인정보는 서비스 제공 및 계약 관리 목적으로만 사용하며, 목적 달성 후 즉시 파기한다.</p>
  <p>③ 을은 언제든지 자신의 개인정보에 대한 열람, 수정, 삭제를 요청할 수 있다.</p>
  <p>④ 갑은 을의 동의 없이 개인정보를 제3자에게 제공하지 않는다. 단, 법령에 의한 경우는 예외로 한다.</p>
</div>

<p class="article-title">[제15조 계약 변경]</p>
<div class="article-content">
  <p>① 본 계약의 내용을 변경하기 위해서는 쌍방의 서면 합의가 필요하다.</p>
  <p>② 서비스 항목, 방문 횟수, 요금 등의 변경은 변경 희망일 30일 전에 상대방에게 통보하여야 한다.</p>
</div>

<p class="article-title">[제16조 구독 갱신 및 요금 조정]</p>
<div class="article-content">
  <p>① 계약 갱신 시 요금은 전년도 소비자물가지수 변동분 및 인건비 상승분을 반영하여 조정될 수 있으며, 최대 연 10%를 초과할 수 없다.</p>
  <p>② 요금 조정 내용은 계약 만료 60일 전까지 을에게 서면으로 통보한다.</p>
</div>

<p class="article-title">[제17조 지식재산권]</p>
<div class="article-content">
  <p>① 갑이 개발한 청소 방법론, 서비스 매뉴얼, 소프트웨어 등 지식재산권은 갑에게 귀속된다.</p>
  <p>② 을은 서비스 이행 중 취득한 갑의 지식재산을 무단으로 복제하거나 사용할 수 없다.</p>
</div>

<p class="article-title">[제18조 양도 금지]</p>
<div class="article-content">
  <p>① 쌍방은 상대방의 서면 동의 없이 본 계약상의 권리·의무를 제3자에게 양도하거나 담보로 제공할 수 없다.</p>
</div>

<p class="article-title">[제19조 서비스 중단·재개]</p>
<div class="article-content">
  <p>① 을의 사업장 리모델링, 영업 중단 등의 사유로 서비스 일시 중단을 원할 경우, 1회 최대 3개월까지 중단 가능하며 계약 기간은 그만큼 연장된다.</p>
  <p>② 서비스 중단 신청은 중단 희망일 14일 전까지 서면으로 제출한다.</p>
</div>

<p class="article-title">[제20조 분쟁 해결]</p>
<div class="article-content">
  <p>① 본 계약과 관련하여 분쟁이 발생할 경우, 쌍방은 상호 협의를 통해 해결하도록 노력한다.</p>
  <p>② 협의로 해결되지 않는 경우, 갑의 소재지 관할 법원을 전속 관할 법원으로 한다.</p>
</div>

<p class="article-title">[제21조 준거법]</p>
<div class="article-content">
  <p>① 본 계약은 대한민국 법률에 따라 해석되고 이행된다.</p>
</div>

<p class="article-title">[제22조 기타]</p>
<div class="article-content">
  <p>① 본 계약서에서 명시되지 않은 사항은 관련 법령 및 상관례에 따르며, 쌍방 협의를 통해 결정한다.</p>
  <p>② 본 계약서는 전자적 방식으로 작성 및 서명될 수 있으며, 이는 서면 계약서와 동일한 효력을 가진다.</p>
</div>

<hr>

<div class="date-section">
  계약 체결일: {{CONTRACT_YEAR}}년 {{CONTRACT_MONTH}}월 {{CONTRACT_DAY}}일
</div>

<div class="parties-section">
  <div class="party-block">
    <div class="party-title">【갑】 서비스 제공자</div>
    <div class="party-row"><span class="party-label">상호</span><span class="party-value">범빌드코리아</span></div>
    <div class="party-row"><span class="party-label">사업자번호</span><span class="party-value">298-78-00455</span></div>
    <div class="party-row"><span class="party-label">대표자</span><span class="party-value">조동환</span></div>
    <div class="party-row"><span class="party-label">주소</span><span class="party-value">경기도 용인시 수지구 수지로 342번길 32, 5층 503호 504호</span></div>
    <div class="party-row"><span class="party-label">연락처</span><span class="party-value">031-759-4877 / 010-5434-4877</span></div>
    <div class="party-row"><span class="party-label">이메일</span><span class="party-value">sunrise@bbkorea.co.kr</span></div>
  </div>

  <div class="party-block">
    <div class="party-title">【을】 서비스 이용자</div>
    <div class="party-row"><span class="party-label">상호</span><span class="party-value">{{CUSTOMER_BUSINESS_NAME}}</span></div>
    <div class="party-row"><span class="party-label">사업자번호</span><span class="party-value">{{CUSTOMER_BUSINESS_NUMBER}}</span></div>
    <div class="party-row"><span class="party-label">대표자</span><span class="party-value">{{CUSTOMER_OWNER_NAME}}</span></div>
    <div class="party-row"><span class="party-label">주소</span><span class="party-value">{{CUSTOMER_ADDRESS}}</span></div>
    <div class="party-row"><span class="party-label">연락처</span><span class="party-value">{{CUSTOMER_PHONE}}</span></div>
    <div class="party-row"><span class="party-label">이메일</span><span class="party-value">{{CUSTOMER_EMAIL}}</span></div>
  </div>
</div>

<hr>

<p class="article-title">[별표 1] 기본 청소 항목</p>
<table>
  <thead>
    <tr><th>구분</th><th>항목</th><th>내용</th></tr>
  </thead>
  <tbody>
    <tr><td>주방후드</td><td>후드 및 필터 청소</td><td>유분·이물질 제거, 필터 세척 또는 교체</td></tr>
    <tr><td>덕트</td><td>덕트 내부 청소</td><td>그리스·먼지 제거, 위생 처리</td></tr>
    <tr><td>바닥</td><td>주방·홀 바닥 청소</td><td>논슬립 처리, 광택, 코팅 포함</td></tr>
    <tr><td>에어컨</td><td>에어컨 필터·코일 세척</td><td>냉각코일, 드레인팬, 송풍팬 포함</td></tr>
    <tr><td>식기세척기</td><td>식기세척기 내부 세척</td><td>스케일·유분 제거, 위생 처리</td></tr>
    <tr><td>그리스트랩</td><td>그리스트랩 청소</td><td>유분·오물 제거, 악취 방지</td></tr>
  </tbody>
</table>

<p class="article-title">[별표 2] 구독 플랜별 방문 횟수</p>
<table>
  <thead>
    <tr><th>플랜</th><th>방문 횟수</th><th>월 요금</th><th>특징</th></tr>
  </thead>
  <tbody>
    <tr><td>3개 순환식</td><td>월 1회</td><td>계약서 명시 금액</td><td>3개 항목 순환 청소</td></tr>
    <tr><td>6개 순환식</td><td>월 2회</td><td>계약서 명시 금액</td><td>6개 항목 순환 청소</td></tr>
    <tr><td>12개 순환식</td><td>월 3회 이상</td><td>계약서 명시 금액</td><td>12개 항목 집중 청소</td></tr>
  </tbody>
</table>

</body>
</html>`

// ─── 변수 설정 타입 ──────────────────────────────────────────────────────────

export interface VarConfig {
  label: string
  mode: 'auto' | 'manual'
  autoField?: string
}

export type TemplateVarConfigMap = Record<string, VarConfig>

// 자동 매핑 가능한 필드 목록 (key: autoField 값, value: 화면 표시 라벨)
export const AUTO_FILL_FIELDS: Record<string, string> = {
  'customer.business_name': '고객사명',
  'customer.business_number': '사업자번호',
  'customer.contact_name': '담당자명',
  'customer.contact_phone': '연락처',
  'customer.email': '이메일',
  'customer.address': '주소 (전체)',
  'customer.billing_amount': '청구 금액',
  'customer.supply_amount': '공급가액',
  'customer.vat': '부가세',
  'customer.deposit': '예약금 (선금)',
  'customer.balance': '잔금',
  'customer.contract_start_date': '계약 시작일 (고객 DB)',
  'customer.contract_end_date': '계약 종료일 (고객 DB)',
  'customer.memo': '메모',
  'contract.monthly_price': '월 요금',
  'contract.annual_price': '연간 요금',
  'contract.start_date': '계약 시작일',
  'contract.end_date': '계약 종료일',
  'system.today_year': '오늘 연도',
  'system.today_month': '오늘 월',
  'system.today_day': '오늘 일',
  // 계약 진행 과정에서 자동 처리 (DB 매핑 아님)
  'contract.selected_items_list': '서비스 항목 (계약 생성 시 입력)',
  'signing.customer_signature': '고객 서명 (전자서명)',
  'signing.admin_signature': '관리자 서명 (전자서명)',
  'signing.customer_signer_name': '고객 서명자 성명 (서명 시 입력)',
}

// 계약 진행 과정에서 자동 채워지는 필드 — DB 자동 매핑과 구분
export const PROCESS_AUTO_FIELDS = new Set([
  'contract.selected_items_list',
  'signing.customer_signature',
  'signing.admin_signature',
  'signing.customer_signer_name',
])

/**
 * autoField 경로를 실제 값으로 resolve
 */
export function resolveAutoField(
  field: string,
  customer: Record<string, unknown>,
  contract: Record<string, unknown>,
): string {
  const today = new Date()
  const selectedItems = contract.selected_items as string[] | null

  const map: Record<string, string> = {
    'customer.business_name': String(customer.business_name ?? ''),
    'customer.business_number': String(customer.business_number ?? ''),
    'customer.contact_name': String(customer.contact_name ?? ''),
    'customer.contact_phone': String(customer.contact_phone ?? ''),
    'customer.email': String(customer.email ?? ''),
    'customer.address': [customer.address, customer.address_detail].filter(Boolean).join(' '),
    'customer.billing_amount': customer.billing_amount != null
      ? Number(customer.billing_amount).toLocaleString('ko-KR')
      : '',
    'customer.supply_amount': String(customer.supply_amount ?? ''),
    'customer.vat': String(customer.vat ?? ''),
    'customer.deposit': String(customer.deposit ?? ''),
    'customer.balance': String(customer.balance ?? ''),
    'customer.contract_start_date': String(customer.contract_start_date ?? ''),
    'customer.contract_end_date': String(customer.contract_end_date ?? ''),
    'customer.memo': String(customer.memo ?? ''),
    'contract.monthly_price': contract.monthly_price != null
      ? Number(contract.monthly_price).toLocaleString('ko-KR')
      : '',
    'contract.annual_price': contract.annual_price != null
      ? Number(contract.annual_price).toLocaleString('ko-KR')
      : '',
    'contract.start_date': String(contract.start_date ?? ''),
    'contract.end_date': String(contract.end_date ?? ''),
    'contract.selected_items_list': selectedItems && selectedItems.length > 0
      ? `<ul>${selectedItems.map(i => `<li>${i}</li>`).join('')}</ul>`
      : '',
    'system.today_year': String(today.getFullYear()),
    'system.today_month': String(today.getMonth() + 1).padStart(2, '0'),
    'system.today_day': String(today.getDate()).padStart(2, '0'),
  }

  return map[field] ?? ''
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * 템플릿 변수를 실제 값으로 치환하여 HTML 문자열 반환
 */
export function renderContract(variables: ContractVariables): string {
  return CONTRACT_HTML_TEMPLATE
    .replace(/{{CONTRACT_YEAR}}/g, variables.contractYear)
    .replace(/{{CONTRACT_MONTH}}/g, variables.contractMonth)
    .replace(/{{CONTRACT_DAY}}/g, variables.contractDay)
    .replace(/{{CUSTOMER_BUSINESS_NAME}}/g, variables.customerBusinessName)
    .replace(/{{CUSTOMER_BUSINESS_NUMBER}}/g, variables.customerBusinessNumber)
    .replace(/{{CUSTOMER_OWNER_NAME}}/g, variables.customerOwnerName)
    .replace(/{{CUSTOMER_ADDRESS}}/g, variables.customerAddress)
    .replace(/{{CUSTOMER_PHONE}}/g, variables.customerPhone)
    .replace(/{{CUSTOMER_EMAIL}}/g, variables.customerEmail)
    .replace(/{{SERVICE_PLAN}}/g, variables.servicePlan)
    .replace(/{{VISIT_OPTION}}/g, variables.visitOption)
    .replace(/{{MONTHLY_PRICE}}/g, variables.monthlyPrice)
    .replace(/{{ANNUAL_PRICE}}/g, variables.annualPrice)
    .replace(/{{CONTRACT_START_DATE}}/g, variables.contractStartDate)
    .replace(/{{CONTRACT_END_DATE}}/g, variables.contractEndDate)
    .replace(/{{SELECTED_ITEMS_LIST}}/g, variables.selectedItemsList)
}

// 변수 목록 — 자동 입력 여부 포함
export const TEMPLATE_KNOWN_VARS: Record<string, { label: string; auto: boolean }> = {
  CONTRACT_YEAR: { label: '계약 연도', auto: true },
  CONTRACT_MONTH: { label: '계약 월', auto: true },
  CONTRACT_DAY: { label: '계약 일', auto: true },
  CUSTOMER_BUSINESS_NAME: { label: '고객사명', auto: true },
  CUSTOMER_BUSINESS_NUMBER: { label: '사업자번호', auto: true },
  CUSTOMER_OWNER_NAME: { label: '담당자명', auto: true },
  CUSTOMER_ADDRESS: { label: '주소', auto: true },
  CUSTOMER_PHONE: { label: '전화번호', auto: true },
  CUSTOMER_EMAIL: { label: '이메일', auto: true },
  MONTHLY_PRICE: { label: '월 요금', auto: false },
  ANNUAL_PRICE: { label: '연간 요금', auto: false },
  CONTRACT_START_DATE: { label: '계약 시작일', auto: false },
  CONTRACT_END_DATE: { label: '계약 종료일', auto: false },
  SERVICE_SCOPE: { label: '서비스 범위', auto: false },
  SELECTED_ITEMS_LIST: { label: '서비스 항목 (HTML 목록)', auto: false },
  CUSTOMER_SIGNATURE: { label: '고객 서명', auto: true },
  ADMIN_SIGNATURE: { label: '관리자 서명', auto: true },
  CUSTOMER_SIGNER_NAME: { label: '고객 서명자 성명', auto: true },
}

// 미리보기용 샘플값
export const TEMPLATE_PREVIEW_VALUES: Record<string, string> = {
  CONTRACT_YEAR: '2025',
  CONTRACT_MONTH: '01',
  CONTRACT_DAY: '15',
  CUSTOMER_BUSINESS_NAME: '(주)샘플회사',
  CUSTOMER_BUSINESS_NUMBER: '000-00-00000',
  CUSTOMER_OWNER_NAME: '홍길동',
  CUSTOMER_ADDRESS: '서울특별시 강남구 테헤란로 123',
  CUSTOMER_PHONE: '010-0000-0000',
  CUSTOMER_EMAIL: 'sample@company.com',
  MONTHLY_PRICE: '238,000',
  ANNUAL_PRICE: '2,856,000',
  CONTRACT_START_DATE: '2025-01-15',
  CONTRACT_END_DATE: '2026-01-14',
  SERVICE_SCOPE: '주방후드 청소, 바닥 왁스 코팅',
  SELECTED_ITEMS_LIST: '<ul><li>주방후드 청소</li><li>바닥 왁스 코팅</li></ul>',
  CUSTOMER_SIGNATURE: '<div style="display:block;width:180px;height:70px;margin:8px 0;border:1px dashed #bbb;border-radius:6px;text-align:center;line-height:70px;color:#ccc;font-size:11px;font-family:sans-serif;">(고객 서명)</div>',
  ADMIN_SIGNATURE: '<div style="display:block;width:180px;height:70px;margin:8px 0;border:1px dashed #bbb;border-radius:6px;text-align:center;line-height:70px;color:#ccc;font-size:11px;font-family:sans-serif;">(관리자 서명)</div>',
  CUSTOMER_SIGNER_NAME: '홍길동',
}

/**
 * 템플릿 HTML + 변수 맵으로 렌더링 ({{VAR_NAME}} 형식 치환)
 */
export function renderTemplateWithVars(
  htmlBody: string,
  vars: Record<string, string>,
): string {
  return htmlBody.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => vars[key] ?? match)
}

/**
 * 템플릿 HTML에서 변수명 추출
 */
export function extractTemplateVars(htmlBody: string): string[] {
  const matches = Array.from(htmlBody.matchAll(/\{\{([A-Z0-9_]+)\}\}/g))
  return Array.from(new Set(matches.map((m) => m[1])))}


/**
 * customers / contracts DB 레코드로부터 ContractVariables 추출
 */
export function extractVariablesFromCustomer(
  customer: Record<string, unknown>,
  contract: Record<string, unknown>,
): ContractVariables {
  const now = new Date()
  const contractDate = contract.created_at
    ? new Date(contract.created_at as string)
    : now

  const startDate = (contract.start_date as string | null) ?? ''
  const endDate = (contract.end_date as string | null) ?? ''

  const monthlyPrice = (contract.monthly_price as number | null) ?? 0
  const annualPrice = (contract.annual_price as number | null) ?? monthlyPrice * 12

  const selectedItems = (contract.selected_items as string[] | null) ?? []
  const selectedItemsList =
    selectedItems.length > 0
      ? `<ul>${selectedItems.map((item) => `<li>${item}</li>`).join('')}</ul>`
      : '<ul><li>계약 내용에 따름</li></ul>'

  return {
    contractYear: String(contractDate.getFullYear()),
    contractMonth: String(contractDate.getMonth() + 1).padStart(2, '0'),
    contractDay: String(contractDate.getDate()).padStart(2, '0'),
    customerBusinessName: (customer.business_name as string | null) ?? '',
    customerBusinessNumber: (customer.business_number as string | null) ?? '',
    customerOwnerName: (customer.contact_name as string | null) ?? '',
    customerAddress: [
      customer.address as string | null,
      customer.address_detail as string | null,
    ]
      .filter(Boolean)
      .join(' '),
    customerPhone: (customer.contact_phone as string | null) ?? '',
    customerEmail: (customer.email as string | null) ?? '',
    servicePlan: (contract.subscription_plan as string | null) ?? '',
    visitOption: (contract.visit_frequency as string | null) ?? '',
    monthlyPrice: monthlyPrice.toLocaleString('ko-KR'),
    annualPrice: annualPrice.toLocaleString('ko-KR'),
    contractStartDate: startDate,
    contractEndDate: endDate,
    selectedItemsList,
  }
}
