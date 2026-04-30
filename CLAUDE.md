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
- 발신번호: 0317594877

---

## UI 작업 시 필수 준수 (디자인 시스템)

UI/UX 변경 작업 시 아래 두 문서를 **반드시 먼저 읽고** 작업한다.

1. `docs/UI_REFINEMENT_PLAN.md` — 3개 포털 UI 완성도 개선 단계별 계획
2. `apps/CLAUDE.md` — 공통 디자인 시스템 규칙 (BBK 전체 앱 공통)

### 핵심 금지 사항 (UI 작업 중)
- 기능·로직·라우트·props 시그니처 변경 금지
- 임의값(`text-[13px]`, `rounded-[9px]`) 사용 금지 → 토큰만 사용
- raw `<button>`, raw `<input>` 사용 금지 → `<Button>`, `<Input>` 컴포넌트 사용
- 하드코딩 색 신규 도입 금지 → 시멘틱 토큰(`text-text-secondary` 등) 사용
- 페이지마다 다른 카드 둥글기/shadow 사용 금지 → `rounded-2xl shadow-soft` 통일

### 기능 회귀 발생 시
즉시 작업 중단 → 사용자에게 보고 → 같은 Phase 내 변경분 revert.

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
