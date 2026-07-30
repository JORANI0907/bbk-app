# BBK 운영 시스템 Phase 1 v2 구현 계획서

> 원본 SPEC: `SPEC_운영시스템.md`
> 작성: 2026-07-30 (v1) · 재작성: 2026-07-31 (v2)
> 상태: 승인 대기

이 문서는 SPEC을 BBK 앱 **기존 자산에 최대한 얹어** 실행하기 위한 재설계 계획서다.
v1은 SPEC 스키마를 그대로 신설했다가 `/admin/live`·WorkPanel 등 기존 기능과 대량 중복이 발견되어 폐기됐다.
v2는 매핑 매트릭스를 먼저 세우고, 진짜 신설이 필요한 것과 기존 확장으로 처리할 것을 명확히 구분한다.

---

## 0. 원칙과 게이트

### 0.1 v2 재설계 3원칙
1. **중복 금지**: BBK 앱에 이미 있는 기능은 재사용·확장. 이름만 다른 새 테이블·화면 만들지 않음.
2. **얇게 얹기**: 새 개념만 신설하고, 나머지는 기존 페이지에 2~3개 필드·버튼만 추가.
3. **관리자 통제 유지**: SPEC "관리자가 유일한 통제 지점" 원칙은 v2에서도 그대로.

### 0.2 하네스 원칙
`~/.claude/rules/common/agent-harness.md` 준수. S2 주간 공지 AI 초안은 4-Layer 완비 후 배포.

### 0.3 배포 게이팅
로컬 완료 → 사용자 "배포하자" 명시 승인 → 커밋+push+Slack. 각 S 단위로 배포.

### 0.4 기존 인프라 재사용 (Zod·새 라이브러리 미도입)
Session/DB/Storage/Push/Slack/Solapi/Anthropic SDK 모두 기존. 수동 검증만.

---

## 1. BBK 앱 매핑 매트릭스 (이 문서의 핵심)

### 1.1 SPEC 데이터 모델 → BBK 앱 대응

| SPEC 개체 | BBK 앱 기존 | 판정 | 조치 |
|---|---|---|---|
| `daily_checks` | `/admin/live` + `WorkPanel` + `service_applications.work_started_at/completed_at` | **완전 중복** | v1 신설분 DROP 완료 (035). 필드 2개만 추가 |
| `sites` | `customers` (정기딥/엔드) | **재사용** | 별도 sites 없음. `customer_id`로 대체 |
| `services` | `customer_type` + `service_type` | **재사용** | services_ops DROP 완료 |
| `safety_incidents` | `/admin/incidents` | **재사용** | type='safety' 값으로 통합 |
| `weekly_notices` | `/admin/notices` (016 + 028 audience) | **확장** | audience `'admin_weekly'` 추가 + 3줄 라인 확장 |
| `monthly_meetings` | `/admin/reports` (월간 보고서) | **확장** | 별도 컬럼 그룹 신설 or 기존 리포트 확장 |
| `claims` | `/admin/incidents` (경위서, IncidentReport) | **확장** | type='customer_claim' 추가 + is_rework |
| `cash_snapshots` | `/admin/finance` | **확장** | 재무 대시보드에 주간 스냅샷 섹션 추가 |
| `deadlines` | 없음 | **신설** | 임박 항목 리스트 (계약 만료·세무 등) |
| `quarterly_interviews` | 없음 | **신설** | 분기 개인 면담 |
| `company_intent` | 없음 | **신설** | 대표 의도 3줄 (단일 행) |
| `functions` | 없음 | **신설** | 내부 7 + 외부 8 (시드) |
| `standards` | 없음 (`contract_templates`는 다른 개념) | **신설** | 규정 문서 관리 |
| `metrics_config` | 없음 | **신설** | 지표 설정 |

### 1.2 SPEC 화면 → BBK 앱 대응

| SPEC | BBK 앱 기존 | v2 조치 |
|---|---|---|
| S1 일일 확인 | `/admin/live` (3열 관제) + `WorkPanel` (시작/완료 버튼) | live 카드에 [반응] 버튼 1개, service_applications에 컬럼 2개 |
| S2 주간 공지 | `/admin/notices` | 이 화면에 "사내 주간 공지" 세그먼트 추가 + AI 초안 버튼 |
| S3 월간 회의 | `/admin/reports` | 월간 회의 기록 폼 추가 (매출/남는 돈 CHECK) |
| S4 클레임 | `/admin/incidents` | 유형 셀렉트에 '고객 클레임' 추가 + is_rework 체크박스 |
| S5 대시보드 | `/admin` (홈) | 상단에 대표 의도 배너 + 심장박동 4타일 + 이달 숫자 5타일 추가 |

### 1.3 진짜 신설되는 새 화면 (4개만)

- `/admin/ops/settings/intent` — 대표 의도 3줄 편집
- `/admin/ops/settings/metrics` — metrics_config 관리
- `/admin/ops/settings/functions` — 15개 기능 담당 지정 · standards 등록
- `/admin/ops/interviews` — 분기 면담 기록 리스트

**설정은 사이드바 "앱관리" 그룹에 합류** (신규 그룹 안 만듦).

---

## 2. 데이터 모델 (v2)

### 2.1 완전 신설 (마이그레이션 036)

- `company_intent` (단일 행 강제, `id=1 CHECK`)
- `standards` — regulations 관리
- `metrics_config` — 지표 설정
- `functions` — 15행 시드
- `weekly_notices` — v1 그대로 (신설), notices와 별개 (line1/2/3 100자 CHECK)
- `monthly_meetings` — v1 그대로 (신설), reports와 별개 (revenue/net_profit CHECK)
- `quarterly_interviews`
- `deadlines` (source='manual' 만, 자동 D-60은 이후 phase)
- `cash_snapshots`

(※ v1에서 이미 apply 후 유지된 10개 테이블 = 그대로 사용. 신설 마이그레이션 불필요.
   035에서 DROP 된 것: daily_checks, sites, safety_incidents, services_ops)

### 2.2 기존 테이블 확장 (마이그레이션 036 예정)

#### `service_applications`
- `admin_reacted_by uuid REFERENCES users(id) ON DELETE SET NULL`
- `admin_reacted_at timestamptz`

#### `incidents` (사고/클레임 통합)
- `type` 컬럼 CHECK 확장: 기존 세트에 `'customer_claim'` 추가
- `is_rework boolean DEFAULT false` (클레임에서 재작업 발생 여부)

#### `notices` (사내 주간 공지 통합 or 별도?)
- **판단**: notices는 title/content(자유 서식)라 SPEC의 3줄 CHECK와 구조 다름
- **결정**: `weekly_notices`는 **별도 신설** (이미 있는 스키마 유지). notices는 사내 주간 공지에 사용 안 함
- notices 확장 없음

**즉 확장 대상은 실제로 2개 컬럼(service_applications) + 2개 컬럼(incidents)만.**

### 2.3 마이그레이션 036 파일 개요

```sql
-- 036_ops_v2_extend.sql
ALTER TABLE service_applications
  ADD COLUMN IF NOT EXISTS admin_reacted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_reacted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_service_applications_no_reaction
  ON service_applications (work_completed_at)
  WHERE work_completed_at IS NOT NULL AND admin_reacted_by IS NULL;

-- incidents 확장
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS is_rework boolean NOT NULL DEFAULT false;
-- incidents.type 은 기존 CHECK 확장 (기존 값 유지 + customer_claim 추가)
-- (실제 CHECK 문법은 기존 정의 확인 후 결정)
```

---

## 3. UI 명세 (v2)

### 3.1 S1 — `/admin/live` [반응] 버튼 추가
- 각 완료 카드에 [반응] 버튼 (관리자만)
- 클릭 시 `POST /api/admin/live/react` → `admin_reacted_by/at` 세팅
- 이미 반응된 카드는 `✓ 김대표 · 15:32` 표시
- 24h 미반응은 `▲` 오렌지 배지 강조

### 3.2 S2 — `/admin/notices` 확장
- 상단 세그먼트: `공지 · 이벤트 · **주간 공지**` 3개 (신규 세그먼트)
- 주간 공지 모드: 3줄 편집 (각 100자 하드 제한 · 카운터)
- [AI 초안 생성] 버튼 → Anthropic haiku 4.5로 요약 생성
- 발행 시 published_at 세팅. 이후 편집 시 발행 취소 → 편집 흐름

### 3.3 S3 — `/admin/reports` 월간 회의 폼
- 리포트 페이지 상단 or 별도 탭에 "이달 회의 기록" 카드 신규
- 폼: 참석 N/M, 5개 지표, 매출/남는 돈 (토글로 노출), 결정사항 3줄, 고칠 것 1건, 사진 1장
- 저장 시 monthly_meetings 신규 테이블에 저장
- 매출만 입력 시 서버 CHECK 위반 → 명시 에러

### 3.4 S4 — `/admin/incidents` 클레임 통합
- 유형 셀렉트에 `고객 클레임` 항목 추가
- 이 유형 선택 시 `☐ 재작업 발생` 체크박스 노출
- 미해결 필터로 별도 조회 가능

### 3.5 S5 — `/admin` 홈 확장
- 최상단: `<IntentBanner>` — 대표 의도 3줄 (신규 프리미티브)
- 그 아래: 심장박동 4타일 (일일확인률·이번주공지·다음회의D-day·연속무사고일수)
- 그 아래: 이달의 숫자 5타일 (건수/클레임/재작업/이탈/재계약률)
- 그 아래: 임박 항목 리스트 (deadlines top 5)
- 기존 홈 콘텐츠는 그 아래로 밀림

### 3.6 신규 관리 화면 4개
| 경로 | 내용 |
|---|---|
| `/admin/ops/settings/intent` | 대표 의도 편집 (single row upsert) |
| `/admin/ops/settings/metrics` | metrics_config on/off + alive 토글 |
| `/admin/ops/settings/functions` | 15개 기능 담당·문서 관리 |
| `/admin/ops/interviews` | 분기 면담 리스트·등록 |

사이드바 "앱관리" 그룹에 4개 링크 추가 (신규 그룹 안 만듦).

### 3.7 신규 프리미티브
- `<StatusBadge variant="normal|caution|warning|danger" />` — SPEC 4.2 색+아이콘+라벨 세트
- `<HeroNumberCard value label unit trend? />` — 히어로 숫자
- `<IntentBanner intent1 intent2 intent3 />` — 홈 상단 배너

---

## 4. API 계약 (v2)

응답 규약: `{ ok: true, ... }` 또는 `{ ok: false, error, code? }`

### 4.1 S1 (live 반응)
- `POST /api/admin/live/react` `{ application_id }` → 관리자만, `{ ok, application_id, reacted_at }`
- 이미 반응됨 시 409 `ALREADY_REACTED`

### 4.2 S2 (주간 공지)
- `POST /api/admin/weekly-notices` — 신규 초안 저장
- `PATCH /api/admin/weekly-notices/[id]` — 편집 (미발행만)
- `POST /api/admin/weekly-notices/[id]/publish`
- `POST /api/admin/weekly-notices/ai-draft` — Anthropic 호출
- `GET /api/admin/weekly-notices?limit=N`

### 4.3 S3 (월간 회의)
- `POST/PATCH /api/admin/monthly-meetings` — 매출/남는 돈 CHECK 검증
- `GET /api/admin/monthly-meetings?year=YYYY`

### 4.4 S4 (클레임)
- 기존 `/api/admin/incidents/*` 라우트에 type='customer_claim' 처리 추가만

### 4.5 S5 (대시보드)
- `GET /api/admin/ops/dashboard` — 4블록 통합 응답

### 4.6 설정
- `GET/PATCH /api/admin/ops/company-intent`
- `GET/PATCH /api/admin/ops/metrics-config`
- `GET/PATCH /api/admin/ops/functions`
- `GET/POST/PATCH /api/admin/ops/standards`

### 4.7 관측
- `GET /api/admin/ops/metrics-health` — Phase 2 진입 판단용 지표별 3개월 충실도

### 4.8 Cron
- `POST /api/cron/ops/live-no-react-24h` — 매 30분 KST, service_applications 24h 무반응 스캔 → Slack
- `POST /api/cron/ops/friday-notice-alert` — 매 금요일 09/15/18시 KST

---

## 5. 지표 계산 (v2)

| key | 자동/수동 | 계산 |
|---|---|---|
| `daily_check_rate` | 자동 | 오늘 완료된 service_applications 수 / 오늘 예정 총수 (KST) |
| `claims_count` | 자동 | 이달 incidents WHERE type='customer_claim' |
| `rework_count` | 자동 | 위 + is_rework=true |
| `notice_rate` | 자동 | 최근 4주 weekly_notices published 수 / 4 |
| `meeting_rate` | 자동 | 최근 3개월 monthly_meetings held_at IS NOT NULL / 3 |
| `safe_days` | 자동 | current_date - MAX(incidents.occurred_at WHERE type='safety') |
| `jobs_backlog` 외 5개 | 수동 | monthly_meetings 최신 행 |
| `cash_balance` 외 3개 | 수동 | cash_snapshots 최신 as_of |
| `contract_coverage`, `days_since_training`, `bep_progress` | 수동 (alive=false) | Phase 2 |

각 자동 지표는 `src/lib/ops/metrics.ts` 개별 함수.

---

## 6. AI 하네스 (S2 주간 공지 초안)

### 6.1 Layer 1 — Input
프롬프트 4섹션 (ROLE / TASK / FORMAT / CONSTRAINTS). Few-shot 3개 (정상·최소 데이터·사고 발생 케이스).

### 6.2 Layer 2 — Execution
- 모델: `claude-haiku-4-5-20251001`
- max_tokens: 500, temperature: 0.3, timeout: 15초
- retry: JSON 파싱 실패 시 1회 재시도

### 6.3 Layer 3 — Evaluation (Rubric)
- json_valid (필수 필드 3개)
- line_length (각 ≤ 100자, 초과 시 truncate + warning)
- sources_present

### 6.4 Layer 4 — Feedback
- 실패 케이스 `agent_activity_logs`에 저장
- 월 1회 리뷰 → 프롬프트 튜닝

---

## 7. 알림 명세

### 7.1 신규 template code 2개
`notification_templates` INSERT (auto_used=false로 시작):
- `ops_live_no_react_24h`
- `ops_weekly_notice_missing_friday`

### 7.2 Make.com 시나리오 2개 신설
| 시나리오 | 주기 | 호출 |
|---|---|---|
| BBK 운영 - live 반응 24h | 매 30분 (00/30) KST | `POST /api/cron/ops/live-no-react-24h` |
| BBK 운영 - 금요일 공지 알림 | 매 금요일 09/15/18시 KST | `POST /api/cron/ops/friday-notice-alert` |

기존 Slack 통합 훅(Phase 27-AN) 자동 활용.

---

## 8. 테스트 계획 (Vitest, 커버리지 80%)

### 8.1 단위 테스트
- 6개 자동 지표 함수
- monthly_meetings revenue/net_profit CHECK 검증
- weekly_notices 100자 초과 차단
- AI 초안 응답 JSON 파싱
- live 반응 중복 방지 (409)

### 8.2 통합 테스트
- `POST /api/admin/live/react` 정상·중복·권한 없음
- `POST /api/admin/monthly-meetings` REVENUE_WITHOUT_NET_PROFIT
- `GET /api/admin/ops/dashboard` 응답 shape

---

## 9. 성능·보안 체크리스트

### 9.1 성능
- [ ] 대시보드 API < 500ms
- [ ] 부분 인덱스로 24h 스캔 최적화 (`idx_service_applications_no_reaction`)
- [ ] AI 초안 응답 캐싱 (같은 주 재요청 방지)

### 9.2 보안
- [ ] 모든 write 라우트 `getServerSession().role` 게이팅
- [ ] AI 응답 HTML/script sanitize
- [ ] Cron 라우트 `WEBHOOK_SECRET` 헤더 검증
- [ ] AI 초안 rate limit (사용자당 5회/분)
- [ ] 개인정보(전화·주소) AI 컨텍스트 미포함

---

## 10. 배포 순서 (v2 게이팅)

| 배포 | 스코프 | 검증 |
|---|---|---|
| 1. 마이그레이션 | 036 (신규 8개 테이블 + service_applications·incidents 확장) | 시드 개수, 컬럼 존재 확인 |
| 2. S1 (live 반응) | API 1 + live 카드 버튼 + cron 1 | 반응 클릭 → DB 반영, 24h 후 Slack |
| 3. S5 (홈 배너) | dashboard API + admin 홈 확장 + IntentBanner 프리미티브 + 설정 4개 | 데이터 표시, 설정 편집 |
| 4. S2 (주간 공지) | API + notices 페이지 세그먼트 + AI 초안 | 초안 생성 → 편집 → 발행 → 편집 잠금 |
| 5. S3+S4 (월간회의·클레임) | API + reports·incidents 확장 | 매출 검증, 클레임 등록 |

각 배포 후 Slack 알림 필수.

---

## 11. Phase 2 진입 기준 (SPEC 6)

3개월 후 `/api/admin/ops/metrics-health` 실행:
- 각 alive=true 지표의 3개월 입력 충실도 조회
- ratio < 0.5 지표는 alive=false 로 조정
- 대표가 3개월 매주 대시보드 확인 여부 (usage log)

---

## 12. 열린 이슈

### 12.1 대시보드_목업.html 미확보
SPEC 4.2 텍스트 규칙 + StatusBadge 프리미티브로 구현 가능. 파일 확보 시 픽셀 조정.

### 12.2 엑셀 병행 백필 (SPEC 7)
Phase 1 배포 완료 후 대표와 협의.

### 12.3 회사_운영규정.docx / 운영_체계도.docx
필요 시 사용자 요청.

---

## 13. v1 대비 v2 변경 요약

**폐기된 것 (v1 대비)**:
- 신설 daily_checks·sites·safety_incidents·services_ops 테이블 → DROP 완료 (035)
- worker/admin/ops daily-check UI 8개 파일 → 삭제 완료
- 사이드바 "운영 시스템" 신규 그룹 → 롤백 완료
- 032/033/034 는 그대로 유지 (신설 6개 테이블 여전히 유용)

**추가된 것 (v2)**:
- `service_applications` 2컬럼 (admin_reacted_*)
- `incidents` 1컬럼 (is_rework) + type CHECK 확장
- 대시보드·설정 4개 신규 화면 (기존 "앱관리" 그룹에 합류)

---

## 14. 착수 승인

이 v2 계획서를 개발의 헌법으로 확정.

승인 시:
1. 이 문서 갱신·커밋 (`docs/ops/PLAN_phase1.md`)
2. 이전 세션에 커밋된 032/033/034 는 그대로 유지 (필요 테이블은 남아 있음)
3. 마이그레이션 036 (v2 확장) 로컬 작성 → apply → 커밋
4. S1'부터 코드 작성 (계약서 §10 순서)

**계획서 v2 검토·수정할 지점 있으신가요?** 없으면 "착수" 승인 주세요.
