# BBK 공간케어 앱 — Claude 작업 지침

## 절대 규칙 (위반 금지)

### 1. 코드 작성 후 반드시 git commit + push

파일을 생성하거나 수정한 후에는 **반드시** 아래 순서로 커밋해야 합니다:

```bash
git add -A
git commit -m "feat/fix/chore: 변경 내용 한 줄 요약"
git push origin master
```

- 기능 하나가 완성될 때마다 커밋 (세션 끝까지 미루지 말 것)
- 커밋 없이 세션을 끝내면 작업 내용이 영구 유실될 수 있음
- 여러 파일을 수정했다면 관련된 것끼리 묶어서 커밋

### 2. 커밋 메시지 형식

```
feat: 새 기능 추가
fix: 버그 수정
chore: 설정, 환경, 의존성 변경
refactor: 기능 변경 없는 코드 정리
design: UI/UX 변경
```

---

## 프로젝트 개요

**서비스명**: BBK 공간케어 관리 앱  
**배포 URL**: https://bbk-app.vercel.app  
**GitHub**: https://github.com/JORANI0907/bbk-app  
**기술 스택**: Next.js 14 App Router + TypeScript + Tailwind CSS + Supabase + Vercel

### 포털 구조 (3개)
| 포털 | 경로 | 대상 |
|------|------|------|
| 관리자 | `/admin/*` | 관리자, 직원(worker) |
| 작업자 | `/worker/*` | 현장 작업자 |
| 고객 | `/customer/*` | 고객사 |

---

## 서비스 타입 규칙 (중요)

- **정기딥케어**: 정기 청소 (딥 클리닝)
- **정기엔드케어**: 정기 청소 (엔드 클리닝)
- **1회성케어**: 단발성 청소
- ❌ "정기케어"라는 표현 사용 금지

---

## DB 주요 테이블

| 테이블 | 용도 |
|--------|------|
| `service_applications` | 서비스 신청/계약 (서비스관리) |
| `customers` | 고객사 정보 |
| `workers` | 작업자 정보 |
| `work_assignments` | 작업자 배정 |
| `service_schedules` | 배정 일정 |
| `inventory_items` | 재고 항목 |
| `inventory_transactions` | 재고 입출고 |

---

## Supabase 설정

- **URL**: https://andmmbxhtufwvtsgdhti.supabase.co
- **Project ID**: andmmbxhtufwvtsgdhti
- 서버사이드: `createServiceClient()` from `@/lib/supabase/server`
- 클라이언트사이드: `createClient()` from `@/lib/supabase/client`

---

## 자동화

- Make 시나리오 사용 (Vercel cron 대신)
- teamId: 2567117

---

## 알림 (SMS)

- Solapi API 사용
- 발신번호: 15229597

---

## UI / 디자인 시스템 필수 참조 문서

**새 화면 추가·기존 화면 수정·컴포넌트 작성 시 아래 두 문서를 반드시 먼저 읽고 작업한다.**

| 문서 | 경로 | 내용 |
|------|------|------|
| 공통 디자인 시스템 | `apps/CLAUDE.md` (섹션: 공통 디자인 시스템 규칙) | 8pt grid, 타이포그래피, shadow 5단계, 둥글기, 색상 토큰, 한글 폰트, 모바일 규칙 |
| UI 완성도 계획 | `docs/UI_REFINEMENT_PLAN.md` | 3개 포털 Phase별 실행 계획, 절대 규칙, 성공 기준 |

### 핵심 디자인 토큰 요약 (암기)

```
색상   : text-text-primary/secondary/tertiary
        bg-surface / bg-surface-sunken
        border-border-subtle / border-border / border-border-strong
        bg-brand-600 (주요 액션), text-brand-600 (링크)
        text-state-success/warning/danger/info + bg-state-*-bg

Shadow : shadow-flat(평면) shadow-soft(카드기본) shadow-card(hover)
         shadow-pop(모달/드롭다운) shadow-modal(풀스크린)

둥글기 : 카드 rounded-2xl | 버튼 rounded-lg | 입력 rounded-md

간격   : 8pt grid — p-4(모바일 카드) p-6(데스크톱) gap-5(섹션)
```

### 코드 작성 규칙 (신규 화면·컴포넌트)
- raw `<button>` 금지 → `<Button>` 컴포넌트 (`src/components/ui/Button.tsx`)
- raw `<input>` / `<textarea>` / `<select>` 금지 → `<Input>` / `<Textarea>` / `<Select>`
- 빈 상태 → `<EmptyState>` 컴포넌트
- 페이지·섹션 제목 → `<SectionHeader>` 컴포넌트
- 하드코딩 색 (`text-gray-500`, `bg-blue-100` 등) 신규 도입 금지 → 시멘틱 토큰만
- 임의 px 값 (`text-[13px]`, `rounded-[9px]`) 금지 → Tailwind 토큰만

### 기능 회귀 발생 시
즉시 작업 중단 → 사용자에게 보고 → 해당 변경분 revert.

---

## 현재 알려진 미구현 항목 (재개발 필요)

아래 페이지들은 사이드바 메뉴는 있으나 파일이 없음:

- `/admin/reports` — 월간보고서
- `/admin/attendance` — 출퇴근관리
- `/admin/incidents` — 경위서
- `/admin/requests` — 요청관리
- `/admin/invoices` — 세금계산서
- `/admin/notices` — 공지·이벤트관리
- `/admin/automation` — 자동화관리
- `/admin/nav-settings` — 하단 메뉴 설정
- `/admin/permissions` — 탭 권한 설정
- `/admin/account` — 계정관리(직원)
- `/worker/requests` — 요청하기(직원)

---

## 코드 컨벤션

- 파일당 최대 800줄
- 불변성 유지 (객체 직접 변경 금지, spread 사용)
- API 라우트: `src/app/api/` 아래에 `route.ts`
- 컴포넌트: `src/components/` 아래에 도메인별 분류
- 환경변수: `.env.local` (커밋 금지, `.gitignore`에 포함됨)

---

## 계약서·회사규정 단일 출처 원칙 (2026-11-27 대표 결정, 필수)

모든 계약서와 행정 처리는 회사규정(`/admin/regulations`)을 바탕으로 한다. 아래를 어기는 수정은 하지 않는다.

1. **규칙 하나에 주인 문서 하나.** 일수·%·금액·기한 같은 숫자는 주인 문서에만 적는다. 주인 목록은 `docs/regulations/rule-registry.md`. 숫자를 바꿀 때는 그 표에서 주인 문서를 찾아 **그 한 곳만** 고친다.
2. **다른 문서는 가리키기만 한다.** `「예약 취소·변경 및 환불 정책」에 따른다`처럼 문서 이름으로 가리키고, 숫자·조건·조 번호를 다시 적지 않는다. (조 번호는 바뀌므로 금지)
3. **계약서 양식에는 규정 내용을 붙여 넣지 않는다.** 양식은 `{{규정버전:CP-03}}` `{{준거문서표}}` `{{서비스유형}}` 변수로 규정을 가리키고, 계약 생성 시 발행본으로 채워 `contract_snapshot.regulation_docs`에 판을 고정한다(`src/lib/contract-regulation-vars*.ts`). 조문 인용 변수 `{{규정:CODE:N}}`는 쓰지 않는다.
4. **고객에게는 코드(CP-xx)를 보이지 않는다.** 고객 화면·계약서·PDF 별첨은 제목만(`formatRegulationTitle`, `stripRegulationCodes`). 관리자 화면은 코드 유지.
5. **규정은 공개하지 않는다.** 계약하는 고객만 서명 링크 안에서 열람(끝까지 읽어야 확인)하고, 완료 PDF 별첨으로 교부한다. 공개 페이지·포털 상시 노출 금지.
6. **원고의 원본은 파일.** 규정 원고는 `scripts/regulations-seed/*.json`, 양식은 `scripts/contract-template-v5-compact.mjs`. DB를 직접 고치지 말고 파일을 고친 뒤 스크립트로 반영한다. 폐지한 규정은 `_retired/`로 옮기고 DB는 `status='retired', deleted_at`.
7. **고치고 나면 중복 검사.** 규정·양식을 바꾼 뒤 본문에서 `80,000` `3일 이내` `7일 이내` `계약서 제N조` 같은 숫자·조 번호가 주인 문서 밖에 다시 생기지 않았는지 훑는다(2단계에서 쓴 grep 방식). 중복이 보이면 레지스트리 기준으로 한쪽을 지우고 가리키기로 바꾼다.
8. **계약 조건(금액·주기·결제)은 작성 모달이 원본.** 모달 입력 → `customer_info` → 별지 「계약 내용」 변수 + 서명 화면 계약 정보 (`src/lib/contract-terms.ts`). 계약서 HTML에 직접 숫자를 타이핑하지 않는다.
