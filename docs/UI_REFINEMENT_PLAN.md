# BBK 앱 UI 완성도 개선 계획 (3개 포털 통합)

> **목적**: 관리자/작업자/고객 3개 포털의 UI 완성도를 프로덕션 수준으로 끌어올린다.
> **모델**: 본 계획은 Sonnet이 단계별로 실행하는 것을 전제로 한다.
> **최우선 원칙**: **기능을 절대 변경·제거하지 않는다.** 스타일·레이아웃·간격·비율만 손댄다.

---

## 0. 절대 규칙 (위반 시 작업 중단)

| 번호 | 규칙 |
|------|------|
| R-1 | API 호출, props 시그니처, 라우트, 폼 동작, 데이터 흐름은 **절대 변경 금지** |
| R-2 | 컴포넌트의 export 이름·인터페이스·동작은 그대로 유지 |
| R-3 | 비즈니스 로직(handleSubmit, fetch, useEffect 의존성 등) 수정 금지 |
| R-4 | 텍스트 문구는 "줄바꿈/공백 정리"를 제외하고 변경 금지 (서비스 명칭 규칙 준수: 정기딥케어/정기엔드케어/1회성케어) |
| R-5 | 새 라이브러리 도입 시 기존 패키지로 가능한지 먼저 확인 (가장 가벼운 솔루션 우선) |
| R-6 | 작업 단위마다 git commit (CLAUDE.md 규칙) |
| R-7 | 작업 중 기능 회귀가 의심되면 즉시 멈추고 사용자에게 보고 |

---

## 1. 디자인 원칙 (모든 화면에 공통 적용)

### 1.1 비율 (Ratio)

- **8pt grid 시스템**: 모든 간격은 `4 / 8 / 12 / 16 / 24 / 32 / 48`px 중 하나
- **카드 내부 패딩**: 모바일 `16px(p-4)`, 데스크톱 `24px(p-6)`
- **섹션 간 간격**: 모바일 `20px(gap-5)`, 데스크톱 `24px(gap-6)`
- **콘텐츠 최대 너비**:
  - 고객 포털 (모바일 전용 톤): `max-w-lg(512px)`
  - 작업자 포털 (모바일 우선): `max-w-xl(576px)`
  - 관리자 포털 (데스크톱 우선): `max-w-7xl(1280px)` 또는 `max-w-full`
- **카드 가로:세로 비율**: 데이터 카드는 `5:3 ~ 16:9`, 기능 단축 카드는 `1:1`

### 1.2 글자 비율 (Typography Scale)

기준 비율: **1.125 (Major Second)** → 한글 가독성에 안정적

| 토큰 | px | 사용처 |
|------|----|----|
| `text-xs` | 12 | 보조 메타(타임스탬프, 캡션) |
| `text-sm` | 14 | **본문 기본값** (모바일/데스크톱 공통) |
| `text-base` | 16 | 강조 본문, 입력 필드 |
| `text-lg` | 18 | 카드 제목, 작은 섹션 헤더 |
| `text-xl` | 20 | 페이지 서브 타이틀 |
| `text-2xl` | 24 | 페이지 메인 타이틀(모바일) |
| `text-3xl` | 30 | 데스크톱 메인 타이틀 |

**금지**: `text-[13px]` 같은 임의값. **반드시 토큰만 사용**.

### 1.3 줄높이 (Line-height) — 한글 가독성 핵심

| 클래스 | 값 | 사용처 |
|--------|----|----|
| `leading-tight` | 1.25 | 큰 제목(text-xl 이상) |
| `leading-snug` | 1.375 | 카드 제목, 라벨 |
| `leading-normal` | 1.5 | **본문 한글 기본값** |
| `leading-relaxed` | 1.625 | 긴 설명문, 공지사항 본문 |

**한글은 1.5 이상이 표준**. 영문 기준의 1.2~1.3은 한글에서 답답해 보임.

### 1.4 줄바꿈 (Line break)

- 한글 단어 잘림 방지: 긴 한글 라벨에는 `break-keep` 클래스 적용 (Tailwind plugin 추가 필요)
- 제목 균형: 페이지 메인 타이틀에 `text-balance` 적용 (이미 globals.css에 정의됨)
- 줄바꿈 강제 위치: `<br />`로 명시 (예: "안녕하세요,<br/>OOO님")
- 말줄임표: 한 줄 `truncate`, 여러 줄 `line-clamp-2`

### 1.5 음영 (Shadow)

5단계 토큰화. **카드는 한 가지 shadow만 사용**한다(혼재 금지).

| 토큰 | CSS | 사용처 |
|------|-----|--------|
| `shadow-flat` | `0 1px 2px 0 rgba(15,23,42,0.04)` | 거의 평면 카드(테두리 강조용) |
| `shadow-soft` | `0 2px 8px -2px rgba(15,23,42,0.06)` | **기본 카드 shadow** |
| `shadow-card` | `0 4px 16px -4px rgba(15,23,42,0.08)` | hover/active 카드 |
| `shadow-pop` | `0 8px 24px -8px rgba(15,23,42,0.12)` | 모달, 팝오버, 드롭다운 |
| `shadow-modal` | `0 16px 40px -8px rgba(15,23,42,0.16)` | 풀스크린 모달 |

**테두리 + shadow 조합 규칙**: `border border-slate-100 shadow-soft` 또는 `border-0 shadow-card` 중 택일. 둘 다 강하면 무거워 보인다.

### 1.6 둥글기 (Border radius)

| 토큰 | px | 사용처 |
|------|----|----|
| `rounded-sm` | 4 | 인라인 코드, 미니 태그 |
| `rounded-md` | 6 | 입력 필드, 작은 버튼 |
| `rounded-lg` | 8 | **버튼 기본값** |
| `rounded-xl` | 12 | 작은 카드, Badge |
| `rounded-2xl` | 16 | **카드 기본값** |
| `rounded-3xl` | 24 | 히어로 배너, 웰컴 카드 |
| `rounded-full` | 999 | 아바타, 칩 버튼 |

**페이지마다 다른 둥글기 혼용 금지**. 카드는 `rounded-2xl`로 통일.

### 1.7 색상 팔레트 (Color)

`tailwind.config.ts`에 다음 시멘틱 토큰을 추가한다 (palette는 brand + slate + state).

```ts
colors: {
  brand: { /* 기존 50-900 유지 */ },
  surface: {
    DEFAULT: '#ffffff',     // 카드 배경
    sunken: '#f8fafc',      // 페이지 배경 (slate-50)
    raised: '#ffffff',      // 모달 배경
    overlay: 'rgba(15,23,42,0.5)', // 오버레이
  },
  text: {
    primary: '#0f172a',     // slate-900
    secondary: '#475569',   // slate-600
    tertiary: '#94a3b8',    // slate-400
    inverse: '#ffffff',
    link: '#2563eb',        // brand-600
  },
  border: {
    DEFAULT: '#e2e8f0',     // slate-200
    subtle: '#f1f5f9',      // slate-100
    strong: '#cbd5e1',      // slate-300
  },
  state: {
    success: '#16a34a',     // green-600
    warning: '#f59e0b',     // amber-500
    danger:  '#dc2626',     // red-600
    info:    '#0284c7',     // sky-600
  },
}
```

페이지 코드에서 `text-gray-700` → `text-text-primary`로 점진 마이그레이션.

### 1.8 한글 폰트

`globals.css`에 **Pretendard** 적용 (CDN 또는 self-host 둘 다 가능).

```css
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css');

body {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont,
               system-ui, Roboto, 'Helvetica Neue', 'Segoe UI',
               'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
  font-feature-settings: 'tnum';
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
```

**효과**: 한글 자간/단어 간격이 즉시 개선됨. 거의 모든 화면이 더 깔끔해 보인다.

---

## 2. 단계별 실행 계획 (Phases)

각 Phase는 독립적으로 커밋 가능. 실패 시 그 Phase만 revert.

### Phase 0 — 디자인 토큰 정립 (인프라)

**파일**:
- `tailwind.config.ts` — colors/spacing/borderRadius/boxShadow/fontSize 토큰 추가
- `src/app/globals.css` — Pretendard 폰트 import, `:root` CSS 변수 정의
- `package.json` — `@tailwindcss/typography`, `tailwind-scrollbar` 등 필요 시만 추가

**검증**:
- 빌드 성공 (`npm run build`)
- 기존 페이지가 시각적으로 거의 동일하게 보임(폰트만 Pretendard로 변함)
- 회귀 테스트: 로그인 → 관리자 홈 → 고객 홈 → 작업자 홈 클릭 가능

**금지**: 이 Phase에서는 **컴포넌트 코드 수정 금지**. 토큰만 정의.

---

### Phase 1 — UI 프리미티브 보강 (`src/components/ui/`)

**기존**:
- `Button.tsx` — variant 추가 정리(primary/secondary/outline/ghost/danger), size sm/md/lg + iconSize 옵션
- `Card.tsx` — `padding`(none/sm/md/lg), `tone`(default/sunken/elevated) prop 추가, 단 default 동작은 그대로
- `Badge.tsx` — 색상 톤을 신규 state 토큰으로 매핑 (현재 사용처 모두 작동)
- `Spinner.tsx` — 사이즈 토큰화

**신규**:
- `Input.tsx` — text/number/tel/email, `error`, `leadingIcon` 지원
- `Textarea.tsx` — autosize 옵션
- `Select.tsx` — native select 래퍼 (가벼움 우선)
- `SectionHeader.tsx` — 페이지/섹션 제목 통일 (제목 + 부제 + 우측 액션)
- `EmptyState.tsx` — 데이터 없음 화면 통일 (이모지 + 제목 + 보조설명 + CTA)
- `Modal.tsx` — focus trap + ESC 닫기 (이미 사용 중인 패턴이 있다면 그것 우선)

**검증**:
- 새 컴포넌트는 사용처 0개 상태로 추가만 함 (기존 페이지 영향 X)
- Storybook이 없다면 `app/_dev/ui/page.tsx`에 미리보기 페이지 임시 추가(배포 제외)

**금지**: 기존 컴포넌트의 default 동작 변경 금지. 새 prop은 모두 optional.

---

### Phase 2 — 레이아웃 표준화 (3개 포털 layout.tsx)

#### 2.1 관리자 (`src/app/admin/layout.tsx`)
- 메인 컨테이너 패딩 통일: `p-4 md:p-6 lg:p-8`
- 콘텐츠 max-width 적용: `max-w-7xl mx-auto`
- 모바일 하단 네비게이션 영역 안전마진: `pb-24 md:pb-8`
- 사이드바 폭 통일: 데스크톱 `w-60`, 접힘 `w-16`

#### 2.2 작업자 (`src/app/worker/layout.tsx`)
- 모바일 우선: `max-w-xl mx-auto`
- 헤더 sticky + 하단 BottomNav 고정 영역 확보
- 콘텐츠 패딩: `px-4 py-5`

#### 2.3 고객 (`src/app/customer/layout.tsx`) ⭐ 핵심 리디자인
- **목표: 관리자 톤(엘리베이션, 카드 사용 패턴)을 모바일에 맞춰 적용**
- 헤더: 현재 단순 BBK 로고 → 관리자식 "그라데이션 웰컴 + 정보 밀도" 톤으로 카드 레이아웃 도입
- 콘텐츠 max-width: `max-w-lg mx-auto`
- 패딩 통일: `px-4 py-5 gap-5`
- 둥글기: `rounded-3xl`(웰컴) + `rounded-2xl`(카드)로 통일

**검증**: 각 포털 진입 → 사이드바/탭/네비 동작 정상.

---

### Phase 3 — 관리자 포털 페이지 정제

**우선순위 페이지** (사용 빈도 기준):
1. `/admin` (홈) — 웰컴 배너, 공지 카드 그리드 비율 정리
2. `/admin/applications` — 테이블 행 높이/세로 정렬, 필터 영역 간격
3. `/admin/schedule` — 캘린더 셀 비율, 일정 카드 통일
4. `/admin/customers` — 리스트/상세 카드 통일
5. `/admin/workers` — 동일 패턴
6. 그 외 페이지: 같은 토큰만 적용해 단순화

**페이지별 체크리스트** (Sonnet이 매 페이지에 적용):
- [ ] 페이지 최상단 wrapper: `flex flex-col gap-6` (간격 토큰 통일)
- [ ] `SectionHeader`로 제목 통일
- [ ] 카드: `rounded-2xl border border-border-subtle bg-surface shadow-soft`
- [ ] 카드 내부: `p-4 md:p-6`
- [ ] 본문 텍스트: `text-sm text-text-secondary leading-normal`
- [ ] 빈 상태: `EmptyState` 컴포넌트 사용
- [ ] 표 셀 vertical padding: `py-3` (현재 `py-2`/`py-4` 혼재)
- [ ] 액션 버튼은 `Button` 컴포넌트만 사용 (raw `<button>` 금지)
- [ ] 색상 하드코딩 → 시멘틱 토큰 (`text-gray-500` → `text-text-secondary`)

---

### Phase 4 — 작업자 포털 페이지 정제

**페이지**:
- `/worker` — 오늘 일정 카드, 진행 단계 인디케이터 톤 통일
- `/worker/schedule` — 일정 리스트 카드 비율, 모바일 터치 영역 ≥ 44px
- `/worker/attendance` — 출퇴근 버튼 강조 비율 점검
- `/worker/inventory`, `/worker/profile`, `/worker/requests` — 동일 토큰 적용

**모바일 특수 사항**:
- 모든 액션 버튼 최소 44×44px (Apple HIG 기준)
- 카드 active state: `active:scale-[0.98] transition-transform`
- BottomNav와의 안전마진 확보 (`pb-20`)

---

### Phase 5 — 고객 포털 리디자인 ⭐ (가장 큰 변화)

**목표**: 현재의 "예전 모바일 앱" 느낌 → 관리자처럼 "프로덕션 SaaS" 느낌.

**페이지**:
- `/customer` (홈)
  - 웰컴 배너: 그라데이션 카드 유지하되, 관리자 홈처럼 "정보 밀도 + 시계/날짜 표시" 도입(고객 버전에 맞게 축소)
  - "다음 서비스" 카드: `rounded-2xl shadow-soft`로 통일, 내부 좌우 정렬 정리(현재 `pt-4 pb-1`/`pb-4` 비대칭 정리)
  - 빠른 이동 그리드: 2열 1:1 → 4개 슬롯으로 확장 가능한 구조로
  - 최근 완료 서비스: 카드 패딩 `p-4` 통일, 우측 chevron 색상 토큰화
- `/customer/schedule` — 일정 카드 비율 통일, D-day 강조 톤 정리
- `/customer/requests` — 요청 폼 입력 필드를 `Input`/`Textarea` 컴포넌트로
- `/customer/reports` — 리포트 카드(BeforeAfterSlider) 비율 정리
- `/customer/mypage` — 프로필/연락처/계약 정보 섹션 카드화

**검증**:
- 모바일 360px / 414px / iPad 768px 3가지 폭에서 깨지지 않음
- 다크모드는 추후 작업 (현재는 라이트모드만)
- 데이터 0건 상태에서도 EmptyState가 자연스럽게 표시

---

### Phase 6 — 모바일 반응형 검증

**디바이스 매트릭스**:
| 폭 | 기기 예시 | 점검 포인트 |
|----|-----------|-----|
| 360px | 작은 안드로이드 | 한 줄 텍스트 잘림, 가로 스크롤 |
| 390px | iPhone 13 mini | 안전 영역 |
| 414px | iPhone 14 Plus | 카드 비율 |
| 768px | iPad mini | 사이드바 표시 시점 |
| 1024px | iPad / 작은 노트북 | 그리드 분기점 |
| 1440px | 데스크톱 | 콘텐츠 max-width 동작 |

**도구**: Playwright 자동 스크린샷 비교 (회귀 시각 검증).

---

### Phase 7 — 회귀 검증 + 배포

- TypeScript 타입체크: `npx tsc --noEmit` 0 오류
- Lint: `npm run lint` 0 오류
- 빌드: `npm run build` 성공
- 핵심 사용자 플로우 수동 검증:
  1. 로그인 → 각 역할별 홈 진입
  2. 관리자: 신청 1건 생성 → 일정 배정 → 작업자 확인
  3. 작업자: 출퇴근 체크 → 일정 보기 → 사진 업로드
  4. 고객: 다음 일정 확인 → 요청 등록 → 리포트 보기
- 커밋 & 배포 (CLAUDE.md 규칙: feat / fix / design / refactor)

---

## 3. 실행 순서 권장 (Sonnet 세션 분할)

| 세션 | Phase | 예상 변경 파일 수 | 위험도 |
|------|-------|------------------|--------|
| 1 | Phase 0 + 1 | ~15 | 🟢 낮음 |
| 2 | Phase 2 | 3 (layout.tsx 3개) | 🟡 중간 |
| 3 | Phase 5 (고객) | ~10 | 🟡 중간 (시각 변화 큼) |
| 4 | Phase 4 (작업자) | ~12 | 🟢 낮음 |
| 5 | Phase 3 (관리자) | ~30 | 🟡 중간 (양 많음) |
| 6 | Phase 6 + 7 | 검증만 | 🟢 낮음 |

각 세션 끝에 **반드시 git commit + push** (CLAUDE.md 규칙).

---

## 4. 의도적 제외 항목

다음은 이번 작업 범위 **밖**:
- 다크모드 (별도 프로젝트로 분리)
- 새 페이지/기능 추가
- 데이터 모델 변경
- 라이브러리 마이그레이션 (예: react-query 도입)
- 애니메이션 라이브러리 추가 (framer-motion 등)
- 접근성 풀 패스 검사 (별도 a11y 프로젝트)

---

## 5. 성공 기준 (Definition of Done)

- [ ] 3개 포털 모두에서 카드 둥글기/shadow/패딩이 토큰화되어 있다
- [ ] 한글 본문이 Pretendard로 렌더링된다
- [ ] 모든 버튼이 `<Button>` 컴포넌트를 사용한다 (`grep -r '<button' src/app` 결과가 손에 꼽힌다)
- [ ] 빈 상태 화면이 모두 `EmptyState`로 통일되어 있다
- [ ] 고객 포털이 "관리자 포털과 같은 회사 앱"으로 보인다
- [ ] 모든 모바일 폭(360/390/414)에서 가로 스크롤이 발생하지 않는다
- [ ] 기능 회귀 0건
