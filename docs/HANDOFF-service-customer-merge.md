# 서비스관리 → 고객관리 통합 리팩터링 핸드오프

> **작업 컨텍스트**: BBK 청소 서비스 앱(`apps/bbk-app`)에서 "서비스관리 탭"과 "고객관리 탭"을 통합하는 대규모 리팩터링. 데이터·API·UI 전반에 걸친 다단계 작업. 이 문서만 읽으면 다른 터미널에서 이어서 진행 가능.

---

## 프로젝트 기본 정보

- **작업 디렉토리**: `C:\Users\user\BBK-Workspace\apps\bbk-app`
- **스택**: Next.js 14 App Router + TypeScript + Tailwind + Supabase
- **Supabase Project ID**: `andmmbxhtufwvtsgdhti`
- **Supabase URL**: `https://andmmbxhtufwvtsgdhti.supabase.co`
- **배포 URL**: https://app.bbkorea.co.kr
- **로컬 개발**: `npm run dev` (기본 3000 포트, 사용 중이면 3001+)
- **TypeScript 체크**: `npx tsc --noEmit --pretty`

---

## 사용자의 최종 목표

1. **서비스관리 탭 삭제** — 기능은 고객관리 탭에 흡수
2. **고객관리 탭의 1회성케어 DB → 고객DB이력 탭 이관** (이관 완료)
3. **서비스관리 탭의 1회성케어 → 고객관리 탭 이동** (이동 완료)
4. **정기엔드/정기딥/1회성 각각을 고객DB이력 탭으로 이관 가능한 버튼** (완료)
5. **배정관리 탭은 유지**, 상태창 분리(작업상태/결제상태)
6. **완료 체크 후 30일 초과 시 이력 자동 이동** (이 로직은 대신 수동 이관 방식으로 대체됨)

---

## 완료된 작업 (Phase 1 ~ 5-I)

### Phase 1: 배정관리 UX 개선 (`src/app/admin/schedule/page.tsx`)
- 상태 뱃지 이중화: 작업상태(파랑) + 결제상태(초록/주황) 나란히
- 완료 체크박스 (각 행 우측): 낙관적 업데이트 + 자동 저장
- 필터 UI 두 축 분리: 작업상태 필터 · 결제상태 필터 (AND 조합)

### Phase 2: 고객관리 이번달 일정 아코디언 (`src/components/admin/customers/`)
- 신규 훅 `useAutoSave` (`src/hooks/useAutoSave.ts`): debounce 700ms 자동 저장, 낙관적 업데이트
- `MonthlyScheduleSection.tsx`: 월 이동 + 데이터 fetch
- `ScheduleAccordionRow.tsx`: 접힘/펼침 편집 (담당자·작업자·시공일자·상태·금액·케어범위·관리자요청·메모)
- 담당자·작업자는 정직원+인턴+일용직 3종 필터

### Phase 3: 컴포넌트 분리 및 이력 페이지
- `customers/page.tsx` (2128줄) → `src/components/admin/customers/CustomersManagementView.tsx`로 분리
- `applications/page.tsx` (2409줄) → `src/components/admin/applications/ServiceManagementView.tsx`로 분리
- 두 페이지 파일은 `'use client'` + 얇은 wrapper (Next.js clientModules 오류 방지)
- Props: `embedded?`, `forceCustomerType?/forceServiceType?`, `archivedView?`
- 신규 라우트: `/admin/customer-history` (`src/app/admin/customer-history/page.tsx`)
- 사이드바 `Sidebar.tsx`에 "고객DB이력" 메뉴 추가

### Phase 4: 이관 시스템 (soft archive)
- **DB 마이그레이션 (프로덕션 반영 완료)**:
  ```sql
  ALTER TABLE customers ADD COLUMN archived_at TIMESTAMPTZ, archived_by UUID;
  ALTER TABLE service_applications ADD COLUMN archived_at TIMESTAMPTZ, archived_by UUID;
  CREATE INDEX idx_customers_active WHERE archived_at IS NULL;
  CREATE INDEX idx_customers_archived WHERE archived_at IS NOT NULL;
  -- (service_applications도 동일 인덱스)
  ```
- **신규 API**:
  - `POST /api/admin/customers/archive` (bulk 이관) / `DELETE` (bulk 취소)
  - `POST /api/admin/applications/archive` / `DELETE`
- **GET API 확장**: `customers`, `applications` 모두 `?archived=true|false|all` 파라미터
- **UI**: 벌크 체크박스 → "📦 이력으로 이관" 버튼 (고객관리·서비스관리·배정관리 3곳)
- **이력탭**: 3세그먼트(정기엔드/정기딥/1회성) 각각 CustomersManagementView archivedView embed
- **개별 되돌리기 버튼**: 이력탭 상세 사이드바 하단 (Phase 5-G)

### Phase 4-B: 실제 데이터 이관 (SQL 직접 실행)
- **customers.customer_type='1회성케어' → archived**: **224건**
- **service_applications의 1회성 → customers로 마이그레이션**: **204건** (필드 매핑 후, 원본 유지)

### Phase 5-A ~ 5-K: 세부 개선
- **5-A**: 배정관리에 벌크 이관 버튼 추가
- **5-B**: 서비스관리 1회성 데이터 마이그레이션 SQL
- **5-C**: `generate-schedules` API에 `regenerate` 파라미터 (기존 미완료 삭제 후 재생성)
- **5-D**: 저장/생성 분리, 계약일정 밑에 저장·생성 버튼 배치
- **5-E**: **저장/생성 통합 모달** (기간 기반, `mode: 'create' | 'cleanup'`)
- **5-F**: 서비스관리 사이드바 링크 제거 (라우트는 유지)
- **5-G**: 이력탭 상세에서 개별 이관 취소 버튼
- **5-H**: archived_by 감사로그 무결성 (배정관리에도 currentUserId 전달)
- **5-I**: Dead code 정리 (`handleContractSaveAndCleanup`, `autoRegenerateSchedules` 제거)
- **5-J**: `applications/page.tsx`를 `redirect('/admin/customers')`로 처리 — 외부 유입(북마크·과거 Slack 알림) 자동 안내. 서비스관리는 사실상 완전 흡수
- **5-K**: 견적서 PDF 유니크 파일명 이슈 해결 — `generateQuoteNo()`를 분 단위 → **초 + 3자리 랜덤 suffix** (`BBK-D-YYYYMMDDHHMMSS-nnn`). 같은 분 안에 여러 견적서 발송 시 파일이 덮어써지던 문제 근본 해결
- **추가**: `send/route.ts`에 `discount2_amount` 필드 (잔돈 라운딩용 2차 할인) 추가

---

## 핵심 데이터 정책

### `customers` 테이블
- 활성: `archived_at IS NULL AND deleted_at IS NULL`
- 이력: `archived_at IS NOT NULL`
- 삭제: `deleted_at IS NOT NULL` (완전 삭제 아님, soft delete)
- customer_type: `정기딥케어 | 정기엔드케어 | 1회성케어 | 정기딥케어샘플 | 정기엔드케어샘플`

### `service_applications` 테이블
- 신청서/시공 라이프사이클 관리
- 재무·계약서·계산서·PortOne 결제·Drive·Notion 등이 `application_id`로 참조 중
- **소프트 아카이빙 이유**: 이관해도 데이터 위치가 그대로여야 참조 무결성 유지

### `service_billings` 테이블
- 정기딥(연간)/정기엔드(월간) 청구 이력
- customer_id로 참조

---

## 핵심 컴포넌트 재사용 계층

```
고객DB이력 페이지 (customer-history/page.tsx)
  ↓ embed (archivedView, forceCustomerType='1회성케어')
CustomersManagementView (재사용 가능)
  ↓ mode='cleanup' or 'create' 모달
generate-schedules API (regenerate/cleanup_only/end_day 파라미터)
  ↓
service_applications 테이블
```

**중요**: 두 페이지 파일 모두 `'use client'` 필수 (Next.js clientModules 오류 방지).

---

## 저장/생성 로직 (Phase 5-E 최종)

**저장 버튼 (`mode='cleanup'`)** — 사용자 표현으로 "기존 일정 갈아엎기"
- 계약 정보 저장(customers PATCH)
- 기간 내 각 월별로 `regenerate: true` API 호출
- 미완료 일정(work_status != 'completed') 삭제 후 새 방문일정으로 신규 생성
- 완료된 일정은 보존

**생성 버튼 (`mode='create'`)** — 신규 기간 일정
- 기간 내 각 월별로 신규 생성
- 이미 있는 날짜는 스킵

**API 파라미터**:
- `year`, `month`, `start_day`, `end_day`: 대상 월/기간
- `regenerate: boolean`: 미완료 삭제 후 재생성
- `cleanup_only: boolean`: 미완료 정리만, INSERT 스킵 (지금은 UI에서 안 씀)

---

## 파일 구조 요약

```
apps/bbk-app/
├── src/
│   ├── app/admin/
│   │   ├── customers/page.tsx           # 8줄 wrapper (use client)
│   │   ├── applications/page.tsx        # 8줄 wrapper (use client, 사이드바에서는 숨김)
│   │   ├── schedule/page.tsx            # 배정관리 (Phase 1 UX)
│   │   └── customer-history/page.tsx    # 3세그먼트 이력 페이지
│   ├── app/api/admin/
│   │   ├── customers/
│   │   │   ├── archive/route.ts         # POST=이관, DELETE=취소
│   │   │   └── generate-schedules/route.ts  # regenerate/cleanup_only/end_day
│   │   └── applications/
│   │       ├── archive/route.ts
│   │       └── [id]/assign-worker/route.ts   # Phase 2 (작업자 배정)
│   ├── components/admin/
│   │   ├── customers/
│   │   │   ├── CustomersManagementView.tsx  # 2244줄 (embed 가능)
│   │   │   ├── MonthlyScheduleSection.tsx
│   │   │   └── ScheduleAccordionRow.tsx
│   │   ├── applications/
│   │   │   └── ServiceManagementView.tsx    # 2409줄 (embed 가능)
│   │   └── Sidebar.tsx                  # /admin/applications 링크 제거됨
│   ├── hooks/
│   │   └── useAutoSave.ts               # Phase 2 자동 저장 훅
│   └── ...
└── supabase/migrations/
    ├── 20260718000000_add_payment_status_and_completed_at.sql
    └── (add_archived_columns_for_history_migration은 apply_migration으로 원격 프로덕션 직접 반영)
```

---

## 브라우저 확인 URL

- 로컬: `http://localhost:3000` (dev server 실행 후)
- 프로덕션: `https://app.bbkorea.co.kr`
- 주요 경로:
  - `/admin/customers` — 고객관리 (필터: 1회성/정기딥/정기엔드)
  - `/admin/customer-history` — 고객DB이력 (3세그먼트, archivedView)
  - `/admin/schedule` — 배정관리 (상태 이중 뱃지·완료 체크·필터)
  - `/admin/applications` — 서비스관리 (사이드바 링크 없음, 직접 URL로만 접근)

---

## 남은 작업 옵션

### 옵션 D — 배정관리·고객관리 통합 UX (큰 리팩터링, 필요성 애매)
현재 배정관리(전체 일정 캘린더) vs 고객관리 이번달 아코디언(특정 고객)은 관점이 달라 병행이 자연스러울 수 있음. 사용자 판단 후 착수.

### ~~옵션 J — 서비스관리 라우트 완전 삭제~~ **→ Phase 5-J로 대체 완료**
- `applications/page.tsx`가 `redirect('/admin/customers')`로 바뀌어 사실상 흡수 완료
- 완전 파일 삭제는 필요 시에만 (라우트 자체가 안전한 자동 리다이렉트라 위험도 없음)

### 옵션 K — 브라우저 실사용 검증 (지속 대기)
실제 흐름 확인 후 발견되는 이슈만 조정. 사용자 피드백 기반으로 즉시 대응.
- 최근 대응 사례: 견적서 PDF 이력이 하나만 열리던 문제 → Phase 5-K로 해결

---

## 주의사항

### 인코딩 문제 (Windows 터미널)
- Windows 기본 CP949 → UTF-8로 변경 필요
- `C:\Users\user\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1`에 이미 설정 파일 생성됨:
  ```powershell
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  [System.Console]::InputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
  chcp 65001 > $null
  ```
- 새 PowerShell 세션부터 자동 적용

### Next.js dev server 캐시 문제
- `.next` 캐시 손상 시 "clientModules undefined" 또는 404 error 발생
- 해결: `npm run dev`는 `rimraf .next && next dev`로 자동 초기화
- 이전 dev server 인스턴스가 포트 잡고 있으면 정리 필요:
  ```powershell
  Get-NetTCPConnection -LocalPort 3000,3001,3002 -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique | ForEach-Object {
      Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
  ```

### 데이터 안전성
- **모든 이관은 soft archive** (`archived_at`만 세팅, 데이터 위치 그대로)
- **재무·계약서·PortOne·Drive·Notion 참조 무결성 유지**
- 이관된 데이터는 이력탭에서 조회·편집·되돌리기 가능

---

## 명령어 참고

```bash
# 개발 서버 실행 (0port 자동 정리)
cd C:\Users\user\BBK-Workspace\apps\bbk-app
npm run dev

# TypeScript 체크
npx tsc --noEmit --pretty

# 배포 (사용자 지시 시)
git add -A
git commit -m "feat: 통합 리팩터링"
git push origin master
# → Vercel 자동 배포

# Slack 알림 (BBK 규칙: 모든 완료 작업 시 필수)
curl -s -X POST -H 'Content-type: application/json' \
  --data '{"text":"✅ *작업완료* | 내용"}' \
  "$SLACK_WEBHOOK_URL"  # ~/.claude/CLAUDE.md 참조 (secret scanning 차단으로 URL 리터럴 대신 변수 사용)
```

---

## 다른 터미널에서 이어받기 (권장 순서)

1. 새 PowerShell 창 열기 (UTF-8 자동 적용됨)
2. `cd C:\Users\user\BBK-Workspace\apps\bbk-app`
3. `npm run dev` (background 권장)
4. Claude Code 실행: `claude`
5. 첫 프롬프트: **"docs/HANDOFF-service-customer-merge.md 읽고 컨텍스트 파악해줘"**
6. 그 후 원하는 작업 지시

---

## 사용자 요구사항 히스토리 (핵심 결정만)

- "1회성케어, 정기딥케어, 정기엔드케어 필터클릭 있고 검색창 하나 필터 위에 있고 아래에는 리스트만" → 검색창 필터 위로 이동, 3개 필터만 (샘플계정 제거)
- "고객관리 DB에 1회성케어 있는거 이관" → 224건 SQL 이관 실행
- "저장 = 기존 일정 갈아엎기" (일요일→토요일 변경 시 일요일 삭제되고 토요일 생성돼야 함) → `regenerate` 모드 적용
- "저장, 생성 버튼 계약일정 밑에 우측 나란히 작게" → UI 재배치 완료
- "기간 기반 모달" → Phase 5-E에서 시작일+종료일 date input, 여러 월 순회

---

**최종 업데이트**: 2026-07-21 · Phase 5-K까지 완료 · TypeScript 통과 · 커밋 안 함 (사용자 지시: 로컬에서만 진행)
