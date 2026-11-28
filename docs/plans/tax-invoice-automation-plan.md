# 홈택스 전자세금계산서 자동 발행 계획

작성일: 2026-11-28 (대표 결정 반영판)
상태: 계획 확정, 구현 전
관련 화면: `/admin/tax-invoice` (세금계산서 발행), `/admin/tax-invoice/suppliers`

---

## 0. 한 문장 목표

관리자가 세금계산서 화면에서 대상을 체크하고 **버튼 한 번**으로 국세청에 발행하고, 결과를 앱이 자동 기록한다. 홈택스 CSV 업로드는 예비 경로로 남긴다.

### 대표 결정 (2026-11-28)

| 항목 | 결정 |
|---|---|
| 중간 연결 서비스 | **볼타(Bolta)** |
| 발행 방식 | 1회성·정기 **모두 관리자 원클릭**. 완전 자동(무인) 발행은 하지 않음 |
| 진입점 | **고객관리 탭**의 체크박스 + "홈택스" 버튼 → 모달에서 **CSV 생성** 또는 **볼타 발행** 선택 (2026-11-28 대표 지시: 세금계산서 탭은 더 이상 사용 안 함, 같은 모달을 그 탭에도 붙여 둠) |
| 작성일자 | **모두 입금일 기준**. 관리자가 직접 버튼을 누르므로 날짜 판단은 사람이 함 |
| 카드 결제 고객의 세금계산서 요구 | 기존 수동 경로 그대로 |

---

## 1. 지금 상태 (이미 있는 것)

앱에는 세금계산서 작업 흐름이 거의 다 만들어져 있다. 빠진 것은 **마지막 한 단계**뿐이다.

```
[후보 추출] → [초안 편집] → ["계산서" 버튼 → Google Sheets 저장] → [홈택스에 사람이 업로드] → [발행완료 버튼 → 상태 갱신 + 고객 알림]
                                  ↑ 여기에 모달을 넣고 "볼타 발행" 갈림길을 추가한다
```

| 구성 요소 | 위치 | 비고 |
|---|---|---|
| 후보 추출 API | `src/app/api/admin/tax-invoice/candidates/route.ts` | 1회성 = 신청서 1건, 정기 = 청구서 1건 단위 |
| 초안 저장 | `tax_invoice_drafts` 테이블 | 공급받는자·품목·작성일자·영수/청구 구분 보관 |
| CSV 생성 | `handleDownloadCsv` (page.tsx) + `src/lib/hometax-csv.ts` | 작성일자를 **오늘**로 찍음 → 입금일로 바꿔야 함 |
| 발행완료 처리 | `src/app/api/admin/tax-invoice/mark-issued/route.ts` | 상태 갱신 + 고객 문자/메일. 볼타 웹훅이 이 로직을 재사용 |
| 공급자 프리셋 | `tax_invoice_suppliers` | 법인(398-81-04260) 기본값 |
| 결제수단 규칙 | `src/lib/payment-methods.ts` | `NO_INVOICE_METHODS` = 카드·비과세·플랫폼 |

결제수단별 발행 규칙은 코드에 이미 정해져 있다.

| 결제수단 | 부가세 | 세금계산서 | 볼타 발행 대상 |
|---|---|---|---|
| 계좌이체 `bank_transfer` | 포함 | 발행 | **대상** |
| 가상계좌 `virtual_account` | 포함 | 발행 | **대상** |
| 카드 `credit_card` | 포함 | 미발행 (카드 매출전표가 증빙) | 제외. 고객 요구 시 기존 수동 |
| 비과세 현금 `cash_untaxed` | 미포함 | 미발행 | 제외 |
| 플랫폼 `platform` | 미포함 | 미발행 | 제외 (레거시) |

---

## 2. 볼타(Bolta) 연동 요점

홈택스는 외부 프로그램이 직접 발행하는 공개 API가 없다. 국세청 인가 ASP인 볼타를 거친다.

| 항목 | 내용 |
|---|---|
| 발행 API | `POST https://xapi.bolta.io/v1/taxInvoices/issue`, API 키 Basic 인증 |
| 필수 필드 | `date`, `purpose`(영수 RECEIPT / 청구 CLAIM), `taxType`(TAXABLE), `supplier`, `supplied`(사업자번호 10자리·상호·대표자·담당자 이메일 1~2명), `items` 1~16개 |
| 중복 방지 | 헤더 `Bolta-Client-Reference-Id`. 한 번 쓴 값은 재사용 불가(400). 응답 못 받으면 재전송 금지, `/issue/status?clientReferenceId=` 로 조회 |
| 결과 통지 | 웹훅 `TAX_INVOICE_ISSUANCE_SUCCESS` / `FAILURE`. Standard Webhooks 규격 HMAC-SHA256 서명, 10초 내 2xx 응답, 실패 시 최대 8회 재시도 |
| 테스트 | `test_` 키는 국세청 미전송·무료. `live_` 키만 실제 전송 |
| 요금 | 최소 사용료 없음, 1포인트 = 1원 건당 과금. 정확한 단가는 가입 후 확인 |
| Make 모듈 | 있음 (`전자(세금)계산서 발행 요청`). 이번 계획에서는 쓰지 않고 예비로 둠 |

### 공동인증서

- 볼타는 "사업자용 인증서"를 요구한다. 범용 법인 인증서로 등록 가능.
- 등록은 볼타 웹 콘솔에서 한 번. 결과 코드 `0000` 확인.
- 만료 2027-06. 갱신 후 **볼타에 재등록**해야 발행이 계속된다. 앱에 만료일을 저장해 D-30, D-7 Slack 알림.

---

## 3. 화면 흐름: "계산서" 버튼 → 발행 방식 선택 모달

현재 버튼은 모달 없이 바로 Sheets 저장으로 간다. 이 버튼에 모달을 붙인다.

```
체크박스 선택 → [계산서 (N)] 클릭
   ↓
┌─ 발행 방식 선택 모달 ─────────────────────────────┐
│ 선택 N건 · 공급가액 합계 · 세액 합계                   │
│                                                      │
│ 행별 미리보기 (표)                                    │
│  상호 | 사업자번호 | 공급가액 | 세액 | 작성일자(입금일) | 상태 │
│  - 입금일 없음 → 경고 배지, 오늘 날짜로 대체 + 수정 가능   │
│  - 발행 기한(다음 달 10일) 지난 건 → 빨간 경고            │
│  - 필수 정보 누락 → 발행 버튼 비활성, 편집 링크          │
│                                                      │
│ [홈택스 CSV 생성]  (기존 동작, Sheets 저장)             │
│ [볼타로 발행 ▶]    (Button primary, 확인 한 번 더)      │
└──────────────────────────────────────────────────────┘
   ↓ 볼타 발행
앱 → 볼타 issue 호출 → 행 상태 '요청됨' (노란 배지)
   ↓ 볼타 웹훅
앱 → 상태 '발행완료' + 국세청 승인번호 → 기존 mark-issued 로직 → 고객 알림 → Slack
```

- 모달의 상태 배지는 파스텔 톤(`bg-state-*-bg text-state-*`). 주요 액션 버튼은 공용 `<Button variant="primary">` 한 개만.
- "발행완료" 버튼은 CSV 경로용으로 그대로 둔다. 볼타 경로는 웹훅이 자동으로 발행완료 처리하므로 누를 필요가 없다.
- 볼타 발행 후 "취소" 버튼은 앱 상태만 되돌린다. 국세청에 이미 전송된 건은 **수정세금계산서**가 필요하므로 모달에 안내 문구를 띄운다(4단계에서 API화 검토).

### 작성일자 = 입금일

| 구분 | 입금일 출처 | 비고 |
|---|---|---|
| 정기 청구서 | `service_billings.paid_date` | 후보 API에 `paid_date` 추가 필요 (현재 미포함) |
| 1회성 | `service_applications.balance_paid_at` (잔금) | 없으면 `payment_confirmed_at` |
| 둘 다 없음 | 오늘 날짜 | 모달에서 경고 표시 + 직접 수정 가능 |

입금일이 지난달이면 발행 기한(다음 달 10일)을 넘길 수 있다. 모달에서 기한 초과를 빨갛게 표시하되, 발행 여부는 관리자가 결정한다.

---

## 4. Make의 역할 (축소)

발행 자체는 사람이 버튼으로 하므로 Make는 **알림 담당**만 한다. 기존 cron 컨벤션(Bearer `CRON_SECRET`, KST) 그대로.

| 시나리오 | 주기 | 호출 대상 | 내용 |
|---|---|---|---|
| 미발행 경고 | 매월 7일 09:00 | `GET /api/cron/tax-invoice/pending-report` | 기한 D-3 미발행 후보 수·금액을 Slack으로 |
| 요청됨 정체 점검 | 매일 09:00 | `GET /api/cron/tax-invoice/stuck-check` | '요청됨' 상태 1시간 이상 → 볼타 status 조회로 보정, 실패면 Slack |
| 인증서 만료 알림 | 매일 09:00 | `GET /api/cron/tax-invoice/cert-check` | D-30, D-7 Slack |

생성 후 `scenarios_activate` 필수.

---

## 5. 데이터 변경

### 5-1. `tax_invoice_drafts` 컬럼 추가

| 컬럼 | 타입 | 용도 |
|---|---|---|
| `issue_status` | text default 'draft' | `draft` / `requested` / `issued` / `failed` |
| `issue_attempts` | integer | 요청 시도 횟수 (중복 방지 키에 포함) |
| `client_reference_id` | text unique | 볼타 중복 방지 키 (`bbk-{source}-{source_id}-{시도번호}`) |
| `bolta_issuance_key` | text unique | 볼타 issuanceKey. 웹훅 매칭 키 |
| `tax_invoice_url` | text | 볼타 계산서 보기 링크 (성공 웹훅에서 수신) |
| `requested_at` / `issued_at` | timestamptz | 요청·발행 시각 |
| `failure_code` / `failure_message` | text | 실패 사유 |
| `written_date` | 기존 컬럼 | 모달에서 확정한 입금일을 여기에 저장 |

국세청 승인번호는 볼타 응답·웹훅에 없어 저장하지 않는다 (2026-11-28 문서 확인).

### 5-2. 새 테이블 `tax_invoice_events`

웹훅 원본 저장과 멱등 처리. `webhook_id` unique, `event_type`, `draft_id`, `payload jsonb`, `received_at`.

### 5-3. 새 테이블 `tax_invoice_certificates`

`label`, `issuer`, `expires_at`, `registered_to`('bolta'), `notified_d30_at`, `notified_d7_at`.

`customers.tax_invoice_auto` 같은 자동 발행 플래그는 **만들지 않는다** (완전 자동 미채택).

---

## 6. 코드 변경 (파일 단위)

| 파일 | 역할 | 예상 줄수 |
|---|---|---|
| `src/lib/bolta/client.ts` | 볼타 REST 호출 (issue, status 조회), Basic 인증, try/catch | ~120 |
| `src/lib/bolta/mapper.ts` | 초안 → 볼타 요청 본문 변환 (공급자·공급받는자·품목, 작성일자) | ~100 |
| `src/lib/bolta/webhook.ts` | Standard Webhooks HMAC-SHA256 서명 검증 | ~40 |
| `src/lib/tax-invoice-issue.ts` | 선택 건 검증 + 발행 요청 + 상태 전환 (모달 "볼타로 발행"이 호출) | ~150 |
| `src/app/api/admin/tax-invoice/issue/route.ts` | POST: 선택 건 발행 요청 | ~60 |
| `src/app/api/webhooks/bolta/route.ts` | 웹훅 수신 → `tax_invoice_events` 기록 → 상태 갱신 → mark-issued 로직 재사용 | ~100 |
| `src/app/api/cron/tax-invoice/{pending-report,stuck-check,cert-check}/route.ts` | Make 알림 3종 | 각 ~50 |
| `src/app/admin/tax-invoice/IssueModeModal.tsx` | 발행 방식 선택 모달 (미리보기·입금일 수정·CSV/볼타 분기) | ~250 |
| `src/app/admin/tax-invoice/page.tsx` | "계산서" 버튼 → 모달 열기. `handleDownloadCsv`는 모달 안으로 이동. 상태 배지 추가 | 수정 (1,006줄 → 모달 분리로 줄어듦) |
| `src/app/api/admin/tax-invoice/candidates/route.ts` | 정기 행에 `paid_date` 추가 | 소폭 |
| `src/lib/payment-methods.ts` | 변경 없음 | - |

환경변수: `BOLTA_API_KEY`, `BOLTA_WEBHOOK_SECRET`. Vercel 등록, `config/env-registry.md`에 키 이름 등록, `.env.example` 갱신.

---

## 7. 단계별 일정

### 0단계 · 준비 (사람이 하는 일, 1일)

- [ ] 볼타 가입, 법인 범용 인증서 웹 콘솔 등록 (코드 `0000` 확인), 테스트 키·라이브 키 발급
- [ ] 볼타 웹훅 URL 등록: `https://app.bbkorea.co.kr/api/webhooks/bolta`, 시크릿 수령
- [ ] 코드 공급자 fallback(`2987800455`)을 법인 번호로 갱신
- [ ] **레거시 결제수단 정리**: 활성 고객 약 120명이 `현금(계산서 발행 가능)` 같은 옛 한글 값. 영문 enum으로 일괄 변환
- [ ] 가상계좌 고객 306명 중 이메일 없는 31명 보완 (볼타는 담당자 이메일 필수)

### 1단계 · 모달 + 볼타 발행 (3~4일) — **코드 완료 2026-11-28 (로컬, 배포 대기)**

- [x] DB 컬럼·테이블 추가 (5장) — 마이그레이션 `20261128000001_tax_invoice_bolta.sql` 프로덕션 적용 완료
- [x] 볼타 클라이언트·매퍼·웹훅 검증 + 단위 테스트 32개 (`bolta-mapper`, `bolta-webhook`, `tax-invoice-rows`)
- [x] 발행 API `POST /api/admin/tax-invoice/issue` + 웹훅 API `POST /api/webhooks/bolta`
- [x] **고객관리 탭 홈택스 모달** `components/admin/customers/HometaxCsvModal.tsx` 에 볼타 발행 갈래·작성일자(입금일) 칸·상태 배지·요청 상태 확인 추가 (주 진입점)
- [x] 세금계산서 탭에도 같은 기능의 `IssueModeModal.tsx` (보조). 두 모달은 `src/lib/tax-invoice-issue-client.ts` 공용 함수 사용
- [x] 발행완료 처리 로직을 `src/lib/tax-invoice-mark-issued.ts` 로 분리 (버튼·웹훅 공용)
- [x] 공급자 fallback 법인 번호로 갱신
- [ ] 배포 후 볼타 개발자센터에 웹훅 URL 등록 → `BOLTA_WEBHOOK_SECRET` Vercel 등록
- [ ] **테스트 키**로 전체 흐름 20건 검증 (정상 12 · 경계 6 · 실패 2)

구현 메모:
- 볼타 응답에는 국세청 승인번호가 없다. 대신 `issuanceKey` 와 `taxInvoiceUrl` 을 저장한다. 웹훅 매칭 키는 `bolta_issuance_key`.
- 볼타 응답을 못 받은 건은 `requested` 상태를 유지하고 "확인 필요" 표시만 한다. 재요청하면 중복 발행될 수 있어 자동 재시도는 하지 않는다 (3단계 stuck-check 가 상태 조회로 보정).
- 웹훅은 테스트 키 10~30초, 라이브 약 10분 뒤에 온다. 그동안 화면에는 "볼타 요청됨" 배지가 보인다.
- 코드 리뷰 반영(2026-11-28): 동시 클릭 중복 발행 방지는 조건부 update 선점(`claimRequested`)으로, 실패 처리는 자기 시도(client_reference_id)만 덮어쓰도록. 5xx·429·본문 이상은 실패로 확정하지 않고 상태 조회로 보정. 웹훅은 `tax_invoice_events.processed_at` 으로 "기록됨"과 "처리됨"을 분리해 처리 중 실패하면 재전송 때 다시 처리하고, 초안을 못 찾으면 500 으로 재전송을 유도. 멈춘 "요청됨" 건은 모달의 **요청 상태 확인** 버튼(`PATCH /api/admin/tax-invoice/issue`)으로 접수 여부를 확정하며, 30분 지나도 접수 기록이 없으면 재요청 가능으로 풀린다.
- 서버는 발행 전 원본(청구서·신청서)이 존재하고 아직 미발행인지 다시 확인하고, 과세 건은 품목별 세액이 공급가액의 10% ±10원인지 검사한다.

### 2단계 · 라이브 전환, 관찰 (2주)

- 라이브 키 전환. 처음 1주는 하루 5건 이내로 발행
- 매일 Slack: 요청 N건 / 발행 N건 / 실패 N건
- 2주간 실패 0건, 국세청 승인번호 100% 기록 확인

### 3단계 · Make 알림 3종 (1~2일)

- 미발행 경고(매월 7일), 요청됨 정체 점검(매일), 인증서 만료 알림(매일)

### 4단계 · 선택 (추후)

- 수정세금계산서 API (환불·금액 변경·취소)
- 개인 고객 계좌이체 건 현금영수증 발행
- 볼타 발행 목록 ↔ 앱 기록 월말 대조 리포트

---

## 8. 평가 기준과 지표 (배포 게이트)

| 지표 | 합격 기준 |
|---|---|
| 테스트 키 20건 매핑 정확도 | 공급가액·세액·사업자번호·이메일·작성일자 20/20 일치 |
| 웹훅 수신율 | 요청 대비 100% (미수신은 status 조회로 보정) |
| 중복 발행 | 0건 (같은 초안 2회 요청 시 차단 확인) |
| 입금일 대체 | 입금일 없는 건은 모달에 경고가 뜨고 수정 가능 |
| 실패 처리 | 실패 건은 `failed` 상태 + Slack 알림 + 화면 배지 |

합격 못 하면 모달의 "볼타로 발행" 버튼만 숨기고 CSV 경로로 되돌아간다(코드 삭제 없음).

---

## 9. 오류 처리 계층

| 단계 | 상황 | 동작 |
|---|---|---|
| 1 재시도 | 볼타 응답 없음(타임아웃) | 재전송 금지. `status?clientReferenceId=` 조회로 결과 확정 |
| 2 대체 경로 | 볼타 장애 | 같은 모달에서 "홈택스 CSV 생성" 선택 |
| 3 보고 | 필수 필드 누락 | 모달에서 발행 버튼 비활성, 편집 링크 |
| 4 롤백 | 잘못 발행 | 수정세금계산서(취소) 수동 발행, 앱 상태 `failed` 전환 |
| 5 사람 개입 | 인증서 만료·키 오류 | Slack 즉시 알림, 모달에 발행 불가 사유 표시 |

---

## 10. 결정 완료 (2026-11-28)

1. ASP: 볼타
2. 발행 방식: 1회성·정기 모두 관리자 원클릭. 기존 "계산서" 버튼에 모달을 붙여 CSV / 볼타 분기
3. 작성일자: 입금일. 없으면 오늘로 대체하고 모달에서 수정
4. 카드 결제 고객의 세금계산서 요구: 기존 수동 경로 유지

---

## 참고

- 볼타 API 문서: https://docs.bolta.io (issue, certificate-registration, webhook-events)
- 볼타 Make 모듈: https://apps.make.com/bolta
- 발행 기한·가산세: 공급일 다음 달 10일, 지연 발급 가산세 (국세청 안내 기준)
