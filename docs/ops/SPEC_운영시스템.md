# BBK 운영 시스템 SPEC

버전 0.1 · 2026-07-29 작성 · Phase 1 범위 확정본

---

## 0. 이 문서의 목적과 경계

### 무엇을 만드는가

10인 이하 · 현장 분산 조직의 운영 규정을 앱에서 돌리기 위한 시스템.

### Phase 1의 진짜 목적은 대시보드가 아니라 데이터 수집이다

대시보드에 표시할 지표 17개가 아직 검증되지 않았다. 3개월 실제 운영을 거치면 그중 절반은
아무도 채우지 않거나, 채워도 판단에 쓰이지 않아서 죽는다.

따라서 Phase 1은 **입력을 받는 것**이 목적이고, 화면은 최소한만 만든다.
데이터가 3개월 쌓인 뒤에 Phase 2에서 대시보드를 완성한다.

**이 순서를 지키지 않으면 죽은 지표가 화면에 영원히 남는다.**

### 범위

| 구분 | Phase 1 (지금) | Phase 2 (3개월 뒤) |
|---|---|---|
| 입력 화면 | 전부 구현 | 유지 |
| 대시보드 | 최소 4블록만 | 전체 7블록 |
| 지표 판정 | 하드코딩 금지, 설정 테이블 | 검증된 지표만 활성화 |
| AI | 주간 공지 초안 1개 | 월간 회의자료 생성 추가 |

---

## 1. 개념 구조 (5층)

시스템의 모든 데이터는 이 5층 중 하나에 속한다. 어느 층에도 속하지 않는 데이터는 만들지 않는다.

| 층 | 이름 | 성격 | 변경 빈도 |
|---|---|---|---|
| 1 | 의도 | 존재 이유, 올해 목표, 대표 의도 3줄 | 연 1회 |
| 2 | 서비스 | 판매 품목, 단가 구조, 원가율 | 분기 1회 |
| 3 | 기능 | 내부 7 / 외부 8, 담당자 | 반기 1회 |
| 4 | 규칙·표준 | 각 기능의 필수 문서와 갱신 주기 | 수시 |
| 5 | 지표·주기 | 무엇으로 판단하는가 | 월 1회 |

**대시보드는 별도 기능이 아니라 5층의 출력물이다.** 화면을 바꾸려면 5층 설정을 바꾼다.

---

## 2. 데이터 모델

타입은 개념 표기다. 실제 타입은 BBK 앱의 기존 컨벤션을 따른다.

### 2.1 층 1~2 (설정성 데이터, 변경 드묾)

#### `company_intent` — 단일 행

| 필드 | 타입 | 설명 |
|---|---|---|
| id | pk | 항상 1행만 유지 |
| purpose | text | 존재 이유 한 문장 (규정 제1조와 동일) |
| intent_1 / intent_2 / intent_3 | text | 대표 의도 3줄 |
| intent_1_tradeoff / _2 / _3 | text | 각각 "그래서 포기하는 것" |
| never_1 / never_2 / never_3 | text | 규정 제2조 절대 하지 않는 것 |
| always_1 / always_2 / always_3 | text | 규정 제3조 무조건 지키는 것 |
| year | int | 적용 연도 |
| updated_at | datetime | |

> `intent_1~3`은 대시보드 최상단 배너에 항상 표시된다. 현장에서 대표에게 물어볼 수 없을 때의 판단 기준이다.

#### `services`

| 필드 | 타입 | 설명 |
|---|---|---|
| id | pk | |
| name | text | 서비스명 |
| customer_type | text | 대상 고객 |
| price_model | enum | `monthly` / `per_job` / `annual` |
| cost_rate | decimal | 원가율 (0~1). **인건비는 급여의 1.2배로 계산** |
| contract_months | int | 표준 계약 기간 |
| direction | enum | `grow` / `keep` / `shrink` |
| active | bool | |

#### `clients` / `sites`

| clients | | |
|---|---|---|
| id | pk | |
| name | text | 고객사명 |
| contact | text | |

| sites | | |
|---|---|---|
| id | pk | |
| client_id | fk | |
| service_id | fk | |
| name | text | 현장명 |
| contract_start | date | |
| contract_end | date | **D-60에 알림 발생** |
| status | enum | `active` / `ended` / `churned` |

### 2.2 층 3~4 (기능과 표준)

#### `functions` — 고정 15행 (내부 7 + 외부 8)

| 필드 | 타입 | 설명 |
|---|---|---|
| code | pk | `IN1`~`IN7`, `EX1`~`EX8` |
| kind | enum | `internal` / `external` |
| name | text | 영업·수주, 현장·납품 등 |
| owner_user_id | fk nullable | 담당 |
| backup_user_id | fk nullable | 백업 |
| sort_order | int | |

시드 데이터 (내부):

```
IN1 영업·수주
IN2 현장·납품
IN3 품질·고객관리
IN4 재무·자금
IN5 인사·노무
IN6 안전·법규
IN7 기획·전략
```

시드 데이터 (외부):

```
EX1 고객   EX2 협력·공급업체   EX3 은행·금융   EX4 세무회계
EX5 노무   EX6 관공서·인허가   EX7 보험        EX8 경쟁사
```

#### `standards` — 4층 필수 문서

| 필드 | 타입 | 설명 |
|---|---|---|
| id | pk | |
| function_code | fk | |
| doc_name | text | 예) 위험요인 점검표 |
| max_pages | text | 예) `1장`, `1줄` |
| cycle | enum | `daily` / `weekly` / `monthly` / `quarterly` / `yearly` / `on_event` |
| stale_after_days | int | 이 일수를 넘기면 기능 신호등이 주의로 바뀐다 |
| last_updated_at | datetime nullable | **null이면 미보유 = 우선 과제** |
| file_url | text nullable | |

> 기능 신호등은 이 테이블의 `last_updated_at`과 `stale_after_days`로 **자동 판정**한다. 수동 입력하지 않는다.

### 2.3 층 5 — 지표 설정 (가장 중요)

#### `metrics_config`

**지표를 코드에 하드코딩하지 마라.** 3개월 뒤 죽은 지표를 코드 수정 없이 끌 수 있어야 한다.

| 필드 | 타입 | 설명 |
|---|---|---|
| key | pk | `claims_count`, `cash_balance` 등 |
| function_code | fk | 어느 기능의 지표인가 |
| label | text | 화면 표시명 |
| unit | text | `건`, `원`, `%`, `일` |
| target_value | decimal nullable | 목표 |
| direction | enum | `higher_better` / `lower_better` |
| cycle | enum | `daily` / `weekly` / `monthly` / `quarterly` |
| show_on_dashboard | bool | Phase 1은 최소 4블록에 해당하는 것만 true |
| alive | bool | 3개월 검증 통과 여부. **기본값 true, 검증 후 수동 조정** |
| sort_order | int | |

시드 지표 17개:

```
IN1  jobs_backlog        수주 잔량            건    monthly
IN1  new_inquiries       신규 문의 건수        건    monthly
IN2  daily_check_rate    일일 확인 제출률      %     daily     [dashboard]
IN2  ontime_rate         납기 준수율          %     monthly
IN3  claims_count        클레임 건수          건    monthly   [dashboard]
IN3  rework_count        재작업 건수          건    monthly   [dashboard]
IN3  churn_count         이탈 고객 수         건    monthly   [dashboard]
IN3  renewal_rate        재계약률             %     quarterly [dashboard]
IN4  cash_balance        통장 현금 잔고        원    weekly    [dashboard]
IN4  receivables_90      90일 초과 미수금      원    weekly    [dashboard]
IN4  next30_outflow      다음 30일 지출 예정   원    weekly    [dashboard]
IN4  bep_progress        손익분기 대비 진행률  %     monthly
IN5  contract_coverage   근로계약서 보유율     %     quarterly
IN6  safe_days           연속 무사고 일수      일    daily     [dashboard]
IN6  days_since_training 안전교육 후 경과일    일    monthly
IN7  notice_rate         주간 공지 발행률      %     weekly    [dashboard]
IN7  meeting_rate        월간 회의 개최율      %     monthly   [dashboard]
```

### 2.4 운영 기록 (Phase 1의 핵심 입력)

#### `daily_checks` — 일일 현장 확인

규정 제6조. 하루 두 번, 각 한 줄. **작성에 5초를 넘기면 안 된다.**

| 필드 | 타입 | 설명 |
|---|---|---|
| id | pk | |
| site_id | fk | |
| user_id | fk | |
| type | enum | `start` / `end` |
| note | text nullable | 특이사항. 기본값 "특이사항 없음" |
| photo_url | text nullable | |
| checked_at | datetime | |
| reacted_by | fk nullable | **대표/관리자가 반응했는지.** 규정상 무반응은 위반 |
| reacted_at | datetime nullable | |

> `reacted_by`가 null인 채로 24시간이 지나면 대표에게 알림. 규정 제6조 3항이 시스템으로 강제되는 지점이다.

#### `weekly_notices` — 주간 공지 3줄

규정 제7조. 매주 금요일, 대표가 직접.

| 필드 | 타입 | 설명 |
|---|---|---|
| id | pk | |
| week_start | date | 해당 주 월요일 |
| line1 / line2 / line3 | text | 이번 주 있었던 일 / 다음 주 예정 / 고맙거나 짚을 것 |
| author_id | fk | |
| ai_draft_used | bool | AI 초안에서 시작했는지 |
| published_at | datetime nullable | null이면 미발행 |

> **3줄을 넘기는 입력은 UI에서 막는다.** 각 줄 최대 100자. 길어지면 중단되고, 중단은 시작하지 않은 것보다 나쁘다.

#### `monthly_meetings` — 월간 전체회의

규정 제8조. 회의록은 만들지 않는다. 이 한 행과 사진 1장이 전부다.

| 필드 | 타입 | 설명 |
|---|---|---|
| id | pk | |
| month | date | 해당 월 1일 |
| held_at | datetime nullable | null이면 미개최 |
| attendee_count / total_count | int | |
| jobs_count | int | 처리 건수 (1단계 공개 지표) |
| claims / rework / churn_count | int | (1단계) |
| renewal_rate | decimal | (1단계) |
| revenue | bigint nullable | **(2단계) 7개월차 이후 개방** |
| net_profit | bigint nullable | **(2단계) revenue와 반드시 세트** |
| praised_user_id | fk nullable | 이름을 부르며 칭찬 |
| praise_reason | text | |
| fix_item | text | 이번 달 고칠 것. **1건만 허용** |
| fix_owner_id | fk | |
| fix_due | date | |
| fix_result | enum | `pending` / `done` / `dropped` |
| photo_url | text | |
| decision_1 / decision_2 / decision_3 | text | 결정사항 3줄 |

> **검증 규칙:** `revenue`가 입력되었는데 `net_profit`이 비어 있으면 저장을 거부한다.
> 매출만 공개하고 남는 돈을 감추면 투명성이 아니라 오해 생산기가 된다.

#### `quarterly_interviews` — 분기 개인면담

규정 제9조. 질문 3개 고정.

| 필드 | 타입 | 설명 |
|---|---|---|
| id | pk | |
| quarter | text | `2026Q3` |
| user_id | fk | |
| held_at | datetime | |
| q1_hardest | text | 요즘 가장 힘든 것 |
| q2_wish | text | 회사가 하나만 고쳐준다면 |
| q3_future | text | 1년 뒤 하고 싶은 일 |
| company_action | text nullable | 회사 조치 |
| notified_at | datetime nullable | **결과 통보일** |

> `q2_wish`가 있는데 `notified_at`이 90일간 null이면 규정 제14조 실패 조건 3번에 해당한다. 경고를 띄운다.

#### `claims` — 클레임 대장

| 필드 | 타입 | 설명 |
|---|---|---|
| id | pk | |
| site_id | fk | |
| occurred_at | datetime | |
| content | text | 고객이 말한 그대로 |
| category | text nullable | AI 분류 (Phase 2) |
| cause | text nullable | |
| is_rework | bool | 재작업 발생 여부 |
| resolved_at | datetime nullable | |

#### `cash_snapshots` — 주 1회 수동 입력

| 필드 | 타입 |
|---|---|
| as_of | date |
| balance | bigint |
| receivables_total | bigint |
| receivables_over90 | bigint |
| next30_outflow | bigint |

#### `deadlines` — 임박 항목

| 필드 | 타입 | 설명 |
|---|---|---|
| id | pk | |
| title | text | |
| due_date | date | |
| category | enum | `규정` / `세무` / `영업` / `법인` / `인허가` / `안전` |
| consequence | text | 놓치면 무슨 일이 생기는가 |
| source | enum | `manual` / `auto` (계약 만료는 sites에서 자동 생성) |
| done_at | datetime nullable | |

---

## 3. 기능 신호등 판정 규칙

`functions` 각 행의 상태는 아래 규칙으로 **자동 계산**한다. 수동 입력 필드를 만들지 마라.

우선순위: 위험 > 경고 > 주의 > 정상. 하나라도 걸리면 더 심한 쪽을 표시한다.

| 기능 | 위험 | 경고 | 주의 |
|---|---|---|---|
| IN1 영업·수주 | 수주 잔량 0 | — | 다음 달 예정 물량이 손익분기 미만 |
| IN2 현장·납품 | 오늘 확인 제출률 50% 미만 | — | 미확인 1건 이상 |
| IN3 품질·고객관리 | 이번 달 이탈 1건 이상 | 클레임 3건 이상 | 계약 만료 D-60 이내 존재 |
| IN4 재무·자금 | next30_outflow > balance | 90일 초과 미수금 존재 | 미수금이 월매출 초과 |
| IN5 인사·노무 | 근로계약서 미비 1건 이상 | — | 4대보험 신고 누락 의심 |
| IN6 안전·법규 | 사고 발생 | 안전교육 후 90일 초과 | 교육 후 60일 초과 |
| IN7 기획·전략 | 주간 공지 2주 연속 미발행 | 월간 회의 2개월 미개최 | 이번 주 공지 미발행 |

> IN7의 위험 조건과 IN4의 위험 조건은 규정 제14조 실패 조건과 직결된다. 발생 시 대표에게 즉시 알림.

---

## 4. 화면 정의

### 4.1 Phase 1 구현 대상

#### S1. 일일 현장 확인 (모바일 우선, 최우선 구현)

- 로그인 후 첫 화면. 오늘 담당 현장이 카드로 뜬다
- 버튼 두 개: `시작` / `종료`. 탭 한 번에 기록 완료
- 특이사항은 선택 입력. 기본값 "특이사항 없음"
- 사진 첨부 선택
- **목표: 3탭 이내, 5초 이내 완료**
- 대표 계정에서는 오늘 올라온 확인 목록이 보이고, 각 항목에 반응 버튼

#### S2. 주간 공지 작성 (대표 전용)

- 3줄 입력. 각 줄 100자 제한, 초과 입력 차단
- `AI 초안 생성` 버튼: 이번 주 daily_checks / claims / monthly_meetings를 요약해 3줄 초안 제시
- 초안은 반드시 편집 가능. 대표가 손대지 않고 발행하는 것도 허용하되 `ai_draft_used=true` 기록
- 금요일 오전 미작성 시 대표에게 알림. 미발행으로 주가 넘어가면 IN7 상태 악화

#### S3. 월간 회의 기록

- 1단계 지표 입력란(건수·클레임·재작업·이탈·재계약률)이 기본 노출
- 2단계 지표(매출·남는 돈)는 설정에서 켜야 보인다. 기본은 숨김
- 매출 입력 시 남는 돈이 비면 저장 차단 (2.4절 검증 규칙)
- 고칠 것은 1건만 입력 가능. 담당자와 마감일 필수
- 결정사항 3줄 + 사진 1장

#### S4. 클레임 등록

- 현장 선택 → 내용 입력 → 저장. 재작업 여부 체크박스
- 목록에서 미해결 건 상단 고정

#### S5. 최소 대시보드 (Phase 1은 4블록만)

Phase 1에서 표시할 것:

1. 대표 의도 배너 (`company_intent.intent_1~3`)
2. 심장박동 4타일: 오늘 현장 확인 / 이번 주 공지 발행 여부 / 다음 월간회의 D-day / 연속 무사고
3. 이달의 숫자 5타일: 건수 / 클레임 / 재작업 / 이탈 / 재계약률
4. 임박 항목 리스트

**Phase 1에서 만들지 않을 것:** 현금 히어로 블록, 손익분기 게이지, 기능 신호등 7개.
데이터가 없어서 전부 빈 화면이 된다. Phase 2로 미룬다.

### 4.2 시각 참고

`대시보드_목업.html`을 브라우저로 열어 확인한다. 레이아웃·색·상태 표기 규칙이 그대로 들어 있다.

준수할 것:

- 상태는 색만으로 표현하지 않는다. 반드시 도형 기호 + 텍스트 라벨을 함께 쓴다 (`● 정상`, `▲ 주의`, `◆ 위험`)
- 히어로 숫자는 화면당 하나만
- 다크 모드는 자동 반전이 아니라 별도 값으로 정의

---

## 5. AI 기능

### Phase 1 — 주간 공지 초안 생성 하나만

입력: 해당 주의 `daily_checks`(특이사항이 있는 것만), `claims`, 직전 `monthly_meetings`

출력: 3줄. 각 100자 이내

```
1줄: 이번 주 있었던 일 (사실 기반. 없으면 "특이사항 없음"이라고 쓴다)
2줄: 다음 주 예정
3줄: 고맙거나 짚을 것 (이름을 포함할 것)
```

제약:

- 없는 사실을 만들지 않는다. 데이터가 부족하면 부족하다고 쓴다
- 과장하지 않는다. 홍보 문구를 쓰지 않는다
- 3줄을 넘기지 않는다

### Phase 2 — 월간 회의자료 생성

3개월 데이터가 쌓인 뒤 착수. 지금 만들지 마라.

### 에이전트 구조

**기능별 에이전트 팀을 만들지 마라.** 10인 회사에 7개 팀은 과설계다.
에이전트 하나에 도구 몇 개를 붙이는 형태로 시작하고, 한 개가 감당하지 못하는 시점에 쪼갠다.

---

## 6. Phase 1 완료 기준

아래가 전부 되면 완료다.

- [ ] 현장 직원이 휴대폰에서 3탭 이내로 시작/종료 기록을 남길 수 있다
- [ ] 대표가 오늘 올라온 확인 목록을 보고 반응할 수 있다
- [ ] 24시간 무반응 항목에 대해 대표에게 알림이 간다
- [ ] 대표가 주간 공지 3줄을 작성·발행할 수 있고, AI 초안 버튼이 동작한다
- [ ] 금요일 미작성 시 알림이 간다
- [ ] 월간 회의 기록을 1행으로 저장할 수 있고, 매출만 입력하면 저장이 거부된다
- [ ] 클레임을 등록하고 목록에서 볼 수 있다
- [ ] 최소 대시보드 4블록이 실제 데이터로 그려진다
- [ ] `metrics_config` 테이블이 존재하고, `show_on_dashboard`를 끄면 화면에서 사라진다
- [ ] 3개월 뒤 지표별 입력 충실도를 뽑을 수 있는 조회가 있다

마지막 항목이 Phase 2 진입 판단의 근거가 된다. 빠뜨리지 마라.

---

## 7. 참고 문서

| 파일 | 내용 |
|---|---|
| `회사_운영규정.docx` | 규정 원문. 조항 번호가 이 SPEC의 근거다 |
| `운영_체계도.docx` | 5층 구조 전체와 빈칸 양식 |
| `대시보드_목업.html` | 화면 시각 참고 |
| `연간_운영캘린더.xlsx` | 3개월간 엑셀로 병행 운영할 대상 |

Phase 1 개발 중에도 엑셀 운영은 계속한다. 앱이 완성될 때까지 데이터가 끊기면 안 된다.
