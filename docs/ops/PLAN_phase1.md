# BBK 운영 시스템 Phase 1 구현 계획서

> 원본 SPEC: `docs/ops/SPEC_운영시스템.md`
> 작성: 2026-07-30
> 상태: 승인 대기

이 문서는 SPEC을 이 저장소의 기존 인프라·컨벤션·게이팅 규칙에 얹어 프로덕션 수준으로 실행하기 위한 상세 계획서다.
개발 도중에도 이 문서를 헌법으로 삼고, 벗어나야 할 때는 이 문서를 먼저 갱신하고 나서 코드를 바꾼다.

---

## 0. 원칙과 게이트

### 0.1 3대 원칙
1. **입력이 목표다.** 화면은 최소, 데이터 수집이 실패하면 전부 실패다.
2. **죽은 지표를 만들지 않는다.** 근거 데이터가 없는 규칙은 `alive=false`로 시드.
3. **관리자가 유일한 통제 지점이다.** 알림 발송·상태 매핑·활성 스위치는 관리 페이지에서 조정 가능.

### 0.2 하네스 원칙 (`~/.claude/rules/common/agent-harness.md` 준수)
- AI 초안(S2)은 Layer 1~4 전부 정의 후 배포. Rubric 없이 배포 금지.
- 루프 탈출 조건: 재시도 최대 2회, 100자 초과 시 truncate + warning.
- Human-in-the-loop: 대표가 편집·발행 직접 클릭 없이 자동 발송 절대 금지.

### 0.3 배포 게이팅 (BBK 워크스페이스 규칙)
- 코드 수정은 로컬만. `git push` 는 사용자 "배포하자" 명시 승인 후.
- 각 S(S1~S5) 단위로 마이그레이션+API+UI 묶어서 배포.
- 배포 후 Slack 알림 필수.

### 0.4 기존 인프라 재사용 (신규 라이브러리 도입 금지)
| 필요 | 재사용 대상 |
|---|---|
| 인증·세션 | `getServerSession()` |
| DB | `createServiceClient()` |
| 알림 발송 | `dispatch(type, ctx)` + `notification_templates` |
| Slack 로깅 | `sendSlack()` |
| Web Push | `sendPushToUsers()` |
| 파일 업로드 | Supabase Storage + `browser-image-compression` |
| AI 호출 | `@anthropic-ai/sdk` |
| Toast | `react-hot-toast` |
| UI 프리미티브 | `<Button>` `<Input>` `<Card>` `<Badge>` `<EmptyState>` `<SectionHeader>` + 신규 `<StatusBadge>` `<HeroNumberCard>` |

**입력 검증**: Zod 미도입 결정 → 수동 검증 함수(`validators.ts`) 로 시작. 나중에 도입 필요성 커지면 별도 phase.

---

## 1. 데이터 모델 (마이그레이션 3개)

### 1.1 `supabase/migrations/032_ops_settings.sql`

설정성 데이터 (변경 드묾). 5개 테이블 + 시드.

#### `company_intent` (단일 행 강제)
- `id int PRIMARY KEY CHECK (id = 1)` — 항상 1행만 존재
- `purpose text NOT NULL`
- `intent_1 / _2 / _3 text NOT NULL`
- `intent_1_tradeoff / _2 / _3 text` (nullable — 초기 미입력 허용)
- `never_1 / _2 / _3 text`
- `always_1 / _2 / _3 text`
- `year int NOT NULL DEFAULT extract(year from now())`
- `safe_days_start_date date NOT NULL DEFAULT current_date` **[신규 추가]**
- `updated_at timestamptz DEFAULT now()`
- **트리거**: BEFORE UPDATE → `updated_at = now()`
- **정합성**: `INSERT` 시 `id = 1` 이 이미 존재하면 실패 → 항상 UPSERT 사용

#### `services_ops`
- 기존 `service_applications`·`customers.customer_type`과 이름 충돌 방지 위해 `services_ops` 로 명명
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `name text NOT NULL UNIQUE`
- `customer_type text` (nullable)
- `price_model text NOT NULL CHECK (price_model IN ('monthly','per_job','annual'))`
- `cost_rate numeric(5,4)` (0~1)
- `contract_months int`
- `direction text NOT NULL CHECK (direction IN ('grow','keep','shrink')) DEFAULT 'keep'`
- `active bool NOT NULL DEFAULT true`
- `sort_order int DEFAULT 0`
- **시드 3행**: 정기딥케어(monthly, grow) / 정기엔드케어(monthly, grow) / 1회성케어(per_job, keep)

#### `functions` (내부 7 + 외부 8 고정)
- `code text PRIMARY KEY CHECK (code ~ '^(IN[1-7]|EX[1-8])$')`
- `kind text NOT NULL CHECK (kind IN ('internal','external'))`
- `name text NOT NULL`
- `owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL`
- `backup_user_id uuid REFERENCES users(id) ON DELETE SET NULL`
- `sort_order int NOT NULL`
- **시드**: SPEC 2.2절 리스트 그대로 15행

#### `standards`
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `function_code text NOT NULL REFERENCES functions(code) ON DELETE CASCADE`
- `doc_name text NOT NULL`
- `max_pages text` (`1장`, `1줄` 등 자유 표기)
- `cycle text NOT NULL CHECK (cycle IN ('daily','weekly','monthly','quarterly','yearly','on_event'))`
- `stale_after_days int NOT NULL`
- `last_updated_at timestamptz` (nullable — null=미보유=우선과제)
- `file_url text`
- **인덱스**: `(function_code)`, `(last_updated_at)`

#### `metrics_config`
- `key text PRIMARY KEY` (`claims_count`, `cash_balance` 등)
- `function_code text NOT NULL REFERENCES functions(code) ON DELETE CASCADE`
- `label text NOT NULL`
- `unit text NOT NULL`
- `target_value numeric` (nullable)
- `direction text NOT NULL CHECK (direction IN ('higher_better','lower_better'))`
- `cycle text NOT NULL CHECK (cycle IN ('daily','weekly','monthly','quarterly'))`
- `show_on_dashboard bool NOT NULL DEFAULT false`
- `alive bool NOT NULL DEFAULT true`
- `sort_order int DEFAULT 0`
- `calculation text NOT NULL DEFAULT 'manual' CHECK (calculation IN ('auto','manual'))` **[신규 추가]**
- **시드 17행** (SPEC 2.3절). `show_on_dashboard=true`는 Phase 1 표시 대상 8개만.
- **`alive=false` 초기 시드**: `contract_coverage`(근거 데이터 없음), `days_since_training`(근거 없음), `bep_progress`(근거 없음). 나머지 14개는 alive.

### 1.2 `supabase/migrations/033_ops_records.sql`

운영 기록 (자주 씀). 9개 테이블.

#### `sites` (Q1 옵션 A · 재검토 후 정기 고객 1:1 강화)
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `customer_id uuid NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE` — 정기 고객 1:1
- `service_id uuid REFERENCES services_ops(id) ON DELETE SET NULL`
- `name text NOT NULL`
- `contract_start date`
- `contract_end date`
- `status text NOT NULL CHECK (status IN ('active','ended','churned')) DEFAULT 'active'`
- `assigned_worker_ids uuid[] DEFAULT '{}'` (사이트 상시 배정 — work_assignments 회차 배정과 별개)
- `created_at timestamptz DEFAULT now()`
- **인덱스**: UNIQUE(customer_id) 자동, `(status, contract_end) WHERE status='active'` (D-60 스캔)
- **트리거 3종**:
  1. `sites_upsert_contract_deadline` — contract_end 갱신 시 `deadlines` D-60 자동 upsert (SPEC §3 IN3)
  2. `customers_upsert_recurring_site` — customer_type∈정기딥/엔드 UPDATE 시 sites 자동 upsert (관리 UX 균열 방지)
  3. 034 실행 시 기존 정기 고객 백필 (ON CONFLICT DO NOTHING)
- **1회성케어는 대상 아님**: 매 방문이 별개라 sites 매핑 없음. daily_checks도 정기만.

#### `daily_checks`
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE`
- `user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT`
- `type text NOT NULL CHECK (type IN ('start','end'))`
- `note text NOT NULL DEFAULT '특이사항 없음'`
- `photo_url text`
- `checked_at timestamptz NOT NULL DEFAULT now()`
- `reacted_by uuid REFERENCES users(id) ON DELETE SET NULL`
- `reacted_at timestamptz`
- **UNIQUE**: `(site_id, user_id, type, date(checked_at AT TIME ZONE 'Asia/Seoul'))` — 같은 사이트·같은 유형 하루 1건 (연속 재등록 방지)
- **인덱스**: `(checked_at DESC)`, `(reacted_by, checked_at) WHERE reacted_by IS NULL` (24h 무반응 스캔용 부분 인덱스)

#### `weekly_notices`
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `week_start date NOT NULL UNIQUE` — 해당 주 월요일 (한 주 1건 강제)
- `line1 / line2 / line3 text NOT NULL CHECK (char_length(...) <= 100)` — DB 레벨 100자 강제
- `author_id uuid NOT NULL REFERENCES users(id)`
- `ai_draft_used bool NOT NULL DEFAULT false`
- `published_at timestamptz`
- `created_at timestamptz DEFAULT now()`
- `updated_at timestamptz DEFAULT now()`

#### `monthly_meetings`
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `month date NOT NULL UNIQUE` — 해당 월 1일 (한 달 1건)
- `held_at timestamptz`
- `attendee_count int NOT NULL DEFAULT 0`
- `total_count int NOT NULL DEFAULT 0`
- `jobs_count int NOT NULL DEFAULT 0`
- `claims_count int NOT NULL DEFAULT 0`
- `rework_count int NOT NULL DEFAULT 0`
- `churn_count int NOT NULL DEFAULT 0`
- `renewal_rate numeric(5,2)`
- `revenue bigint`
- `net_profit bigint`
- **CHECK 제약** (SPEC 검증 규칙 DB 레벨 강제): `((revenue IS NULL) OR (net_profit IS NOT NULL))`
- `praised_user_id uuid REFERENCES users(id) ON DELETE SET NULL`
- `praise_reason text`
- `fix_item text` — 1건만 허용 (컬럼 1개)
- `fix_owner_id uuid REFERENCES users(id) ON DELETE SET NULL`
- `fix_due date`
- `fix_result text CHECK (fix_result IN ('pending','done','dropped')) DEFAULT 'pending'`
- `photo_url text`
- `decision_1 / _2 / _3 text`

#### `quarterly_interviews`
- `id uuid PK`
- `quarter text NOT NULL` (`2026Q3` 형식)
- `user_id uuid NOT NULL REFERENCES users(id)`
- `held_at timestamptz NOT NULL`
- `q1_hardest / q2_wish / q3_future text`
- `company_action text`
- `notified_at timestamptz`
- **UNIQUE**: `(quarter, user_id)` — 분기당 사람당 1건

#### `claims`
- `id uuid PK`
- `site_id uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT`
- `occurred_at timestamptz NOT NULL`
- `content text NOT NULL`
- `category text`
- `cause text`
- `is_rework bool NOT NULL DEFAULT false`
- `resolved_at timestamptz`
- `logged_by uuid NOT NULL REFERENCES users(id)`
- **인덱스**: `(occurred_at DESC)`, `(resolved_at) WHERE resolved_at IS NULL` (미해결 부분 인덱스)

#### `cash_snapshots`
- `id uuid PK`
- `as_of date NOT NULL UNIQUE`
- `balance / receivables_total / receivables_over90 / next30_outflow bigint`
- `logged_by uuid REFERENCES users(id)`

#### `deadlines`
- `id uuid PK`
- `title text NOT NULL`
- `due_date date NOT NULL`
- `category text NOT NULL CHECK (category IN ('규정','세무','영업','법인','인허가','안전'))`
- `consequence text NOT NULL`
- `source text NOT NULL CHECK (source IN ('manual','auto')) DEFAULT 'manual'`
- `related_site_id uuid REFERENCES sites(id) ON DELETE SET NULL` **[auto 생성 시 역참조용]**
- `done_at timestamptz`
- **인덱스**: `(due_date, done_at)` — 임박 리스트 조회

#### `safety_incidents` **[Q4 신규]**
- `id uuid PK`
- `occurred_at timestamptz NOT NULL DEFAULT now()`
- `site_id uuid REFERENCES sites(id) ON DELETE SET NULL`
- `note text`
- `logged_by uuid NOT NULL REFERENCES users(id)`

### 1.3 `supabase/migrations/034_ops_rls_and_triggers.sql`

RLS 정책 + 자동 트리거.

#### RLS 정책 매트릭스

| 테이블 | admin | worker | customer | franchise_hq |
|---|---|---|---|---|
| `company_intent` | ALL | SELECT | - | - |
| `services_ops` | ALL | SELECT | - | - |
| `functions` | ALL | SELECT | - | - |
| `standards` | ALL | SELECT | - | - |
| `metrics_config` | ALL | SELECT | - | - |
| `sites` | ALL | SELECT (assigned) | - | SELECT (franchise) |
| `daily_checks` | ALL | INSERT+SELECT (own site) | - | - |
| `weekly_notices` | ALL | SELECT | SELECT (published_at IS NOT NULL) | - |
| `monthly_meetings` | ALL | SELECT (subset) | - | - |
| `quarterly_interviews` | ALL | SELECT (own) | - | - |
| `claims` | ALL | INSERT+SELECT (own site) | - | - |
| `cash_snapshots` | ALL | - | - | - |
| `deadlines` | ALL | SELECT | - | - |
| `safety_incidents` | ALL | INSERT+SELECT | - | - |

- 서버 사이드 (Next API 라우트) 는 `createServiceClient()` 로 RLS bypass — 세션 role 로 게이팅.
- 클라이언트 사이드는 RLS 로 이중 방어.

#### 자동 트리거
1. `daily_checks_prevent_backdate` — `checked_at` 이 서버 now()보다 미래이면 reject.
2. `sites_deadline_upsert` — `sites.contract_end` UPDATE 시 `deadlines` D-60 upsert.
3. `updated_at_touch` — 표준 트리거를 모든 테이블에 부착.
4. `weekly_notices_immutable_after_publish` — `published_at IS NOT NULL` 상태에서 `line1/2/3` 수정 시 reject (편집 이력 남기려면 별도 UI).

#### 인덱스 요약
```
sites(customer_id)
sites(status, contract_end) WHERE status = 'active'
daily_checks(checked_at DESC)
daily_checks(reacted_by, checked_at) WHERE reacted_by IS NULL
daily_checks UNIQUE (site_id, user_id, type, date(checked_at AT TIME ZONE 'Asia/Seoul'))
weekly_notices UNIQUE (week_start)
monthly_meetings UNIQUE (month)
quarterly_interviews UNIQUE (quarter, user_id)
claims(occurred_at DESC)
claims(resolved_at) WHERE resolved_at IS NULL
deadlines(due_date, done_at)
cash_snapshots UNIQUE (as_of)
```

### 1.4 마이그레이션 실행 순서
1. `mcp__supabase__apply_migration` name=`phase1_ops_settings`
2. `mcp__supabase__apply_migration` name=`phase1_ops_records`
3. `mcp__supabase__apply_migration` name=`phase1_ops_rls_and_triggers`
4. 각 단계 후 `list_tables` 로 스키마 확인.

### 1.5 롤백 시나리오
- 마이그레이션 파일 각각 `-- ROLLBACK` 섹션 주석으로 DROP 명령 명시.
- Supabase는 down 자동 없음 → 별도 `9xx_ops_rollback.sql` 준비만 (실행은 사용자 승인).

---

## 2. API 계약

전 라우트 공통 규약:
- 응답: `{ ok: true, ... }` 또는 `{ ok: false, error: string, code?: string }`
- 인증 실패: 401, 권한 부족: 403, 검증 실패: 400, 정합성 위반: 409, 서버 오류: 500
- 모든 write 라우트는 `notification_history` 또는 `agent_activity_logs` 에 감사 로그 남김
- 모든 write는 KST 시간대 명시 저장 (기존 유틸 재사용)

### 2.1 daily_checks (S1)
| 메서드 | 경로 | 역할 | 검증 |
|---|---|---|---|
| POST | `/api/ops/daily-checks` | worker/admin | site_id 존재, type in [start,end], note ≤ 500자, 오늘 중복 시 409 |
| GET | `/api/ops/daily-checks?date=YYYY-MM-DD` | admin 전체 / worker own | 기본 오늘 KST |
| POST | `/api/ops/daily-checks/[id]/react` | admin | `reacted_by = session.userId`, `reacted_at = now()`; 이미 reacted면 409 |

**응답 예시** (POST):
```json
{ "ok": true, "id": "uuid", "photo_url": null, "checked_at": "2026-07-30T..." }
```

**엣지 케이스**:
- 사진 업로드 실패 → note만 저장, 사용자에게 "사진 재업로드 필요" 토스트
- 오프라인 → 로컬 storage 큐잉 (Phase 1 스코프: 재전송 필요 안내만, 자동 sync는 Phase 2)

### 2.2 weekly_notices (S2)
| 메서드 | 경로 | 역할 |
|---|---|---|
| POST | `/api/admin/ops/weekly-notices` | admin — 신규 초안 저장 |
| PATCH | `/api/admin/ops/weekly-notices/[id]` | admin — 편집 (미발행 상태만) |
| POST | `/api/admin/ops/weekly-notices/[id]/publish` | admin — 발행 (published_at 세팅, 이후 immutable) |
| POST | `/api/admin/ops/weekly-notices/ai-draft` | admin — 이번 주 초안 생성 |
| GET | `/api/admin/ops/weekly-notices?limit=N` | admin+worker+customer |

**검증**:
- `week_start` 이 월요일이 아니면 자동 보정 (KST 기준)
- 각 라인 char_length > 100 이면 400
- 이미 이번 주 발행 존재 시 POST 409

### 2.3 monthly_meetings (S3)
| POST/PATCH | `/api/admin/ops/monthly-meetings` | 매출/남는 돈 세트 검증 |
| GET | `/api/admin/ops/monthly-meetings?year=YYYY` | 연간 조회 |

**검증** (SPEC 검증 규칙 강제):
- `revenue != null && net_profit == null` → 400 `{ code: 'REVENUE_WITHOUT_NET_PROFIT' }`
- `fix_item` 있는데 `fix_owner_id` 또는 `fix_due` 없음 → 400
- `photo_url` 필수 (SPEC "사진 1장이 전부")

### 2.4 claims (S4)
| POST | `/api/ops/claims` | admin/worker (own site) |
| PATCH | `/api/ops/claims/[id]` | resolved_at, cause 등 편집 |
| GET | `/api/ops/claims?status=unresolved&site_id=?` | 미해결 상단 정렬 |

### 2.5 dashboard (S5)
| GET | `/api/admin/ops/dashboard` | 4블록 통합 응답 |

**응답 스키마**:
```json
{
  "ok": true,
  "intent": { "purpose": "...", "intent_1": "...", "intent_2": "...", "intent_3": "..." },
  "heartbeat": {
    "daily_check_today": { "value": 5, "total": 8, "rate": 0.625 },
    "weekly_notice_published": true,
    "days_until_meeting": 4,
    "safe_days": 42
  },
  "month_numbers": {
    "jobs_count": 12, "claims_count": 1, "rework_count": 0,
    "churn_count": 0, "renewal_rate": 0.85
  },
  "deadlines": [
    { "id": "uuid", "title": "...", "due_date": "2026-08-15", "category": "안전", "days_left": 16 }
  ]
}
```

**성능**: 4블록 순차 쿼리 4~6개. 응답 목표 < 500ms. 필요 시 Postgres materialized view 신설 검토 (Phase 2).

### 2.6 설정 API
| GET/PATCH | `/api/admin/ops/company-intent` | 대표만 |
| GET/PATCH | `/api/admin/ops/metrics-config` | show_on_dashboard·alive 토글 |
| GET/PATCH | `/api/admin/ops/functions` | owner/backup 지정 |
| GET/POST/PATCH | `/api/admin/ops/standards` | 문서 등록·갱신 |

### 2.7 관측 API
| GET | `/api/admin/ops/metrics-health` | Phase 2 진입 판단용 — 각 지표의 3개월 입력 충실도 |

**응답**:
```json
[{
  "key": "daily_check_rate",
  "label": "일일 확인 제출률",
  "expected_count": 90,
  "actual_count": 87,
  "ratio": 0.967,
  "last_input_at": "2026-10-28",
  "alive_recommendation": "keep"
}, ...]
```

---

## 3. UI 명세

### 3.1 신규 프리미티브 2개
- `<StatusBadge variant="normal|caution|warning|danger" label />` — SPEC 4.2 도형+색+텍스트 세트, `aria-label` 필수
- `<HeroNumberCard value label unit trend? />` — 히어로 숫자 1개

기존 프리미티브(`Button`, `Card`, `Input`, `Badge`, `EmptyState`, `SectionHeader`) 그대로 재사용.

### 3.2 S1 모바일 UI (`/worker/ops/daily-check`)
- 로그인 후 첫 화면 (worker layout default redirect 조건 추가)
- **오늘 방문 예정** 담당 sites 카드 리스트 (sites.assigned_worker_ids @> [session.userId] AND 오늘자 service_schedules 존재)
- 각 카드: 사이트명, `[시작]` `[종료]` 버튼 각 44×88px (Apple HIG)
- 특이사항: 기본값 `특이사항 없음` 프리셋된 텍스트 (사용자가 지우고 입력)
- 사진: 클릭 시 파일 피커 → `browser-image-compression` (max 1MB) → Supabase Storage `ops-photos/daily/{yyyymm}/{uuid}.jpg`
- **완료 성공 애니메이션**: `translateY(0)` → 초록 체크 아이콘 200ms
- **엣지**: 오늘 이미 등록된 유형은 카드에 `● 완료` 배지 + 버튼 비활성 (중복 방지)
- **오프라인**: navigator.onLine=false 시 토스트 "네트워크 확인 후 재시도" (Phase 1는 sync 큐 없이 안내만)
- 접근성: 색만 아닌 아이콘+라벨 병기, 대비 WCAG AA

### 3.3 S1 관리자 UI (`/admin/ops/daily-checks`)
- 오늘 KST 목록 (최신순), 각 항목:
  - 사이트 · 작성자 · 유형 배지 · 사진 썸네일(있으면)
  - `[반응]` 버튼 (이미 반응했으면 `✓ 반응함 · 김대표 · 15:32` 표시)
- 24h 무반응 항목은 `▲ 미반응 24h+` 배지 강조
- 필터: 사이트별, 유형별, 반응여부

### 3.4 S2 주간 공지 (`/admin/ops/notices`)
- 헤더: 이번 주 (월~일) · 미발행/발행 상태
- 3줄 편집기: 각 라인 100자 카운터 (색 변화: <80녹, 80-99황, 100적)
- 100자 초과 입력 즉시 차단 (`onChange` 검증)
- `[AI 초안 생성]` 버튼: 로딩 중 스켈레톤 3줄, 실패 시 재시도 버튼
- `[저장]` (미발행 초안), `[발행]` (published_at 세팅, 발행 후 편집 잠금)
- 발행 후 편집 시도 → 확인 다이얼로그 "발행된 공지는 편집할 수 없습니다. 새 공지로 대체하시겠어요?"
- 하단: 최근 8주 공지 리스트 (읽기 전용)

### 3.5 S3 월간 회의 (`/admin/ops/meetings`)
- 이달 회의 카드 (미개최면 `[회의 기록 등록]` 버튼)
- 폼:
  - 1단계 지표 5개 (건수/클레임/재작업/이탈/재계약률) — 기본 노출
  - 2단계 지표 2개 (매출/남는 돈) — `[매출·손익 공개]` 토글로 노출
  - 매출만 입력 후 저장 시 → 클라이언트 검증 + 서버 검증 이중 방어, 명시 에러 "매출을 공개하려면 남는 돈도 함께 입력해야 합니다"
  - 고칠 것 1건 (담당자, 마감일 필수)
  - 결정사항 3줄
  - 사진 1장 필수 업로드 (Supabase Storage)
- 저장 후 대시보드에 즉시 반영

### 3.6 S4 클레임 (`/admin/ops/claims`)
- 미해결 상단 고정 리스트 + 전체 목록 (occurred_at DESC)
- `[+ 새 클레임]` 버튼 → 모달
  - 사이트 선택 (worker는 own site만)
  - 내용 (필수, textarea)
  - `[X] 재작업 발생` 체크박스
- 항목 클릭 → 사이드 패널: cause, category 편집 + `[해결 처리]` 버튼

### 3.7 S5 대시보드 (`/admin/ops`)
- 최상단: `<IntentBanner>` — 대표 의도 3줄 (배경 브랜드 gradient)
- 심장박동 4타일 (2×2 grid on mobile, 1×4 on desktop):
  - 오늘 현장 확인 (`5/8` 형식 + StatusBadge)
  - 이번 주 공지 (`● 발행` / `▲ 미발행`)
  - 다음 월간회의 D-day (`D-4`)
  - 연속 무사고 일수 (`42일`)
- 이달의 숫자 5타일: 건수/클레임/재작업/이탈/재계약률
- 임박 항목 리스트 (due_date ASC, 상위 5개, 카테고리별 색상)
- `[더보기]` 링크로 각 화면 이동

### 3.8 사이드바 (`src/components/admin/Sidebar.tsx`)
- 신규 그룹 "운영 시스템" 홈 아래 삽입
- admin: 대시보드/일일확인반응/주간공지/월간회의/클레임/설정
- worker: 대시보드/클레임(등록만)

### 3.9 접근성·모바일
- 터치 타겟 44×44px 이상
- 색만으로 상태 표현 금지 → StatusBadge 사용
- 한글 leading-normal 이상 필수
- 다크 모드 별도 값 (SPEC 4.2 규칙)

---

## 4. 지표 계산 명세 (`src/lib/ops/metrics.ts`)

각 metrics_config.key 와 매핑되는 함수. 자동 지표만 함수 정의, 수동 지표는 DB 조회.

| key | 자동/수동 | 계산 |
|---|---|---|
| `daily_check_rate` | 자동 | 오늘 KST 완료된 site 수 / **오늘 방문 예정 active sites** 수 (분모는 service_schedules 오늘자 조인) |
| `claims_count` | 자동 | 이달 claims WHERE date_trunc('month', occurred_at) = current month |
| `rework_count` | 자동 | 위 + is_rework=true |
| `notice_rate` | 자동 | 최근 4주 published 수 / 4 |
| `meeting_rate` | 자동 | 최근 3개월 held_at IS NOT NULL / 3 |
| `safe_days` | 자동 | GREATEST(0, current_date - COALESCE(MAX(safety_incidents.occurred_at::date), company_intent.safe_days_start_date)) |
| `jobs_backlog`, `new_inquiries`, `ontime_rate`, `churn_count`, `renewal_rate` | 수동 | monthly_meetings 최신 행 |
| `cash_balance`, `receivables_90`, `next30_outflow` | 수동 | cash_snapshots 최신 as_of |
| `contract_coverage`, `days_since_training`, `bep_progress` | 수동 (alive=false) | Phase 2 |

**각 함수 signature**:
```typescript
export async function calcDailyCheckRate(client: SupabaseClient): Promise<{ value: number; expected: number; kstDate: string }>
```

**캐싱**: Phase 1은 캐싱 없음 (실시간). 대시보드 응답 > 500ms 되면 Phase 2에서 5분 in-memory cache.

---

## 5. AI 초안 하네스 (S2 · Layer 1~4)

### 5.1 Layer 1 — Input
**시스템 프롬프트** (2,000토큰 이내):
```
[ROLE]
너는 BBK 공간케어 대표의 주간 공지 초안 작성자다. 대표는 매주 금요일에 3줄 공지를 발행한다.

[TASK]
이번 주 데이터를 요약해 3줄 초안을 만들어라.
1줄: 이번 주 있었던 일 (사실 기반. 없으면 "특이사항 없음")
2줄: 다음 주 예정
3줄: 고맙거나 짚을 것 (이름을 포함할 것)

[FORMAT]
JSON only. 다른 텍스트 절대 출력하지 마라.
{"line1": "...", "line2": "...", "line3": "...", "sources": ["daily_checks:X건", "claims:Y건", ...]}

[CONSTRAINTS]
- 각 줄 100자 이내 (한글 기준, 공백 포함)
- 없는 사실을 만들지 마라. 데이터가 부족하면 부족하다고 써라
- 홍보 문구 금지 ("최선을 다했습니다" 같은 것)
- 3줄을 넘지 마라
```

**컨텍스트 조합** (동적):
- 이번 주 daily_checks (특이사항 != '특이사항 없음' 만, 최대 20건, 사이트명·날짜·note)
- 이번 주 claims (최대 20건, content·is_rework)
- 직전 monthly_meetings.decision_1~3 (참고용)

**Few-shot 예시 3개** (정상/최소데이터/실패 케이스):
```
예시1 - 정상 데이터:
입력: daily_checks 3건, claims 1건 해결됨
출력: {"line1":"이번 주 홍린 딥케어 후 물때 재작업 1건 발생, 조치 완료했습니다. 다른 사이트 특이사항은 없습니다.","line2":"다음 주는 온오프 정기 방문 3건, 신규 견적 방문 2건이 잡혀 있습니다.","line3":"현장 대응 빠르게 해주신 김작업자님 감사합니다.","sources":["daily_checks:3건","claims:1건"]}

예시2 - 최소 데이터:
입력: daily_checks 0건, claims 0건
출력: {"line1":"이번 주 등록된 특이사항 없음.","line2":"다음 주 정기 일정은 배정관리에서 확인해주세요.","line3":"조용한 한 주였습니다. 모두 수고하셨습니다.","sources":[]}

예시3 - 사고 발생:
입력: safety_incidents 1건 발생
출력: {"line1":"이번 주 아웃백 현장에서 경미한 안전 사고 1건 발생, 무사고 일수 리셋되었습니다.","line2":"다음 주 안전교육 재실시 예정입니다.","line3":"안전 최우선. 모두 조심해주세요.","sources":["safety_incidents:1건"]}
```

### 5.2 Layer 2 — Execution
- 모델: `claude-haiku-4-5-20251001` (빠름, 저렴, 3줄 요약 충분)
- max_tokens: 500 (JSON 응답 여유)
- temperature: 0.3 (일관성 우선)
- retry: 최대 2회 (JSON 파싱 실패 시)
- timeout: 15초
- 실패 시 → 사용자에게 "AI 초안 실패, 직접 작성해주세요" 토스트

### 5.3 Layer 3 — Evaluation (Rubric)
서버에서 응답 파싱 후 검증:
```yaml
rubric:
  - item: json_valid
    max: 1
    condition: JSON.parse 성공 + 필수 필드 3개 존재
    fail_action: retry (1회) → fallback
  - item: line_length
    max: 3 (줄당 1점)
    condition: 각 줄 ≤ 100자
    fail_action: 초과분 truncate + warnings에 명시
  - item: sources_present
    max: 1
    condition: sources 배열 존재
    fail_action: 빈 배열로 대체
pass_threshold: 5 (7점 만점)
on_fail: fallback text ("이번 주 초안 생성 실패. 직접 작성해주세요.")
```

### 5.4 Layer 4 — Feedback
- 실패 케이스 저장: `agent_activity_logs` 테이블 재활용 (기존 존재 확인 완료 — `023_agent_activity_logs.sql`)
- 각 실패에 category (`L1_json`, `L2_length`, `L3_hallucination`) 태깅
- 대표가 발행 시 원본 초안과 diff 저장 (`ai_draft_used=true` 만으로 부족 → `original_draft jsonb` 필드 추가 검토)

**월 1회 리뷰 (Phase 2)**: 실패 케이스 15분 검토 → 프롬프트 튜닝

---

## 6. 알림 명세 (기존 인프라 재사용)

### 6.1 신규 template code 2개
`notification_templates` 신규 삽입 (관리자가 관리 페이지에서 auto_used 토글로 통제):

| code | 카테고리 | body 예시 | 발송 채널 |
|---|---|---|---|
| `ops_daily_check_no_react_24h` | 시스템 | `[BBK 운영] 오늘 아침 홍린 현장 확인이 24시간째 반응 대기 중입니다.` | Slack + Push |
| `ops_weekly_notice_missing_friday` | 시스템 | `[BBK 운영] 이번 주 주간 공지가 아직 발행되지 않았습니다.` | Slack + Push |

### 6.2 Cron 트리거 (Make.com 시나리오 3개 신설)
| 시나리오명 | 시각 (KST) | 호출 |
|---|---|---|
| BBK 운영 - 일일 확인 24h 무반응 | 매 30분 (00/30) KST | `POST /api/cron/ops/daily-check-alerts` |
| BBK 운영 - 금요일 공지 미작성 | 매 금요일 09/15/18시 | `POST /api/cron/ops/friday-notice-alert` |
| BBK 운영 - 계약 D-60 자동 (선택) | 매일 06시 | `POST /api/cron/ops/contract-d60-scan` (sites → deadlines auto upsert) |

각 cron 라우트는 기존 웹훅 시크릿 검증 재사용.

### 6.3 Phase 27-AN Slack 통합 훅 자동 활용
모든 발송이 `saveNotificationHistory` 를 거치므로 Slack 로그가 자동으로 남음. 별도 로깅 코드 없음.

---

## 7. 테스트 계획 (Vitest, 커버리지 목표 80%)

### 7.1 단위 테스트 (필수)
| 파일 | 대상 |
|---|---|
| `tests/ops/metrics.test.ts` | 6개 자동 지표 함수 (fixture 데이터로) |
| `tests/ops/monthly-meeting-validation.test.ts` | revenue/net_profit 세트 검증 |
| `tests/ops/weekly-notice-length.test.ts` | 100자 초과 차단 |
| `tests/ops/ai-draft-parse.test.ts` | AI 응답 JSON 파싱, retry, fallback |
| `tests/ops/functions-status.test.ts` | 기능 신호등 자동 판정 (7개 IN 규칙) |

### 7.2 API 통합 테스트 (핵심 라우트)
| 라우트 | 시나리오 |
|---|---|
| `POST /api/ops/daily-checks` | 정상, 중복(409), 권한 없음(403), 사진 실패 |
| `POST /api/admin/ops/monthly-meetings` | 매출만 입력 시 REVENUE_WITHOUT_NET_PROFIT |
| `POST /api/admin/ops/weekly-notices/publish` | 발행 후 편집 시도 (트리거 reject) |
| `GET /api/admin/ops/dashboard` | 4블록 응답 shape 검증, < 500ms |

### 7.3 E2E (Playwright, 나중에)
- 워커: 로그인 → 담당 사이트 카드 → 시작 → 완료까지 3탭
- 대표: 로그인 → 대시보드 → 반응 클릭 → 상태 갱신

---

## 8. 성능·보안 체크리스트

### 8.1 성능
- [ ] 대시보드 API < 500ms (측정: `curl -w`)
- [ ] daily_checks 목록 pagination (limit=50 default, cursor 방식)
- [ ] 부분 인덱스 (`WHERE reacted_by IS NULL`) 로 24h 스캔 최적화
- [ ] 이미지 압축 클라이언트 사이드 (< 1MB) → Supabase Storage bandwidth 절약

### 8.2 보안
- [ ] 모든 write 라우트 role 게이팅 (`getServerSession().role`)
- [ ] AI 응답에서 script/HTML 태그 sanitize (weekly_notices 저장 전)
- [ ] 파일 업로드 MIME 검증 (image/jpeg, image/png, image/webp 만 허용, max 5MB)
- [ ] Cron 라우트 `WEBHOOK_SECRET` 헤더 검증
- [ ] AI 초안 rate limit (사용자당 5회/분) — Vercel 기본 rate limit + in-memory counter
- [ ] RLS 활성화 + service_role 사용 지점 문서화 (`docs/ops/RLS_MATRIX.md`)
- [ ] .env 하드코딩 금지 (기존 CLAUDE.md 규칙 준수)

### 8.3 관측
- [ ] 모든 write는 `notification_history` 또는 `agent_activity_logs` 감사 로그
- [ ] AI 실패 로그 → `agent_activity_logs` (category=`ai_draft_fail`)
- [ ] Slack 발송 실패는 fire-and-forget, 메인 응답에 영향 없음 (Phase 27-AN 원칙)
- [ ] Vercel logs 확인 절차 문서 (`docs/ops/RUNBOOK.md` 신설 예정)

---

## 9. 배포 순서 (게이팅 준수)

**5개 배포 묶음**. 각 배포 후 관리자님이 검증 → 다음 phase 승인.

| 배포 | 커밋 스코프 | 검증 방법 |
|---|---|---|
| 1. 마이그레이션 | 032/033/034 + 백필(정기 고객→sites) | Supabase Studio 에서 테이블 존재 확인, 시드 데이터 확인, 정기 고객 수 = sites 수 검증 |
| 1b. 알림 template 추가 | 035_ops_notification_templates.sql (S2 배포 직전) | ops_daily_check_no_react_24h · ops_weekly_notice_missing_friday 2개 template INSERT |
| 2. S1 (daily_checks) | API + 모바일 UI + 관리자 리스트 + cron | 워커 계정으로 등록, 관리자 계정으로 반응, 24h 후 Slack 알림 |
| 3. S2 (weekly_notices + AI) | API + UI + cron + AI 초안 | 초안 생성 → 편집 → 발행 → 편집 잠금 확인 |
| 4. S3+S4 (monthly_meetings, claims) | API + UI | 매출만 입력 시 저장 거부 확인, 클레임 등록 |
| 5. S5 (dashboard + settings) | dashboard API + UI + 사이드바 수정 | 4블록 데이터 실측, metrics on/off 토글 |

각 배포 후 Slack 알림 필수 (Phase 27-AN 규칙).

---

## 10. Phase 2 진입 기준 (SPEC 6절)

Phase 1 배포 후 3개월 실측 후 아래 조건 통과 시 Phase 2 착수:
- [ ] `/api/admin/ops/metrics-health` 실행
- [ ] 각 alive=true 지표의 3개월 입력 충실도 확인
- [ ] ratio < 0.5 지표 → `alive=false` 로 조정 (관리 페이지)
- [ ] 대표가 3개월 동안 매주 1회 이상 대시보드 열었는지 (usage log 필요 — Phase 1 스코프 밖 or 별도 phase)

---

## 11. 열린 이슈 (착수 전 사용자 확인)

### 11.1 대시보드_목업.html
현재 확인 불가. 없이 진행 가능하나 파일 위치 확인 시 즉시 반영.

### 11.2 엑셀 병행 백필 (SPEC 7절)
Phase 1 배포 완료 후 대표와 협의:
- 옵션 A: CSV 업로드 UI 신설 (`/admin/ops/settings/import`)
- 옵션 B: SQL 수동 백필

### 11.3 회사_운영규정.docx / 운영_체계도.docx
현재 다운로드 폴더에 없음. 필요 시 사용자에게 요청.

---

## 12. 착수 전 최종 승인 요청

**이 계획서를 개발의 헌법으로 삼는다.**

승인 시 아래 순서로 진행:
1. 이 문서를 git 추적 대상으로 커밋 (`docs/ops/PLAN_phase1.md`, `docs/ops/SPEC_운영시스템.md`)
2. 마이그레이션 3개 SQL 파일 작성
3. `mcp__supabase__apply_migration` 실행
4. S1 코드 작성
5. 로컬 검증 → 배포 승인 요청 → 커밋 → push → Slack 알림
6. S2 ~ S5 반복

**계획 검토·수정할 지점 있으신가요?** 있다면 지금 지적 → 문서 갱신. 없으면 "착수" 승인 주세요.
