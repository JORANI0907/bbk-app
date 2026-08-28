# 개발 & 배포 전 자체 테스트 원칙

**작성일**: 2026-08-19
**작성 계기**: 계약서 서명 v2 변수 이슈 6회 반복 배포 실패 — 실제 고객에게 오류가 노출되어 대표가 사과해야 하는 사고 발생.

---

## 0. 절대 원칙

1. **"이론상 됨"은 완료 보고가 아니다.** 실물로 돌려서 결과를 확인한 뒤에만 보고한다.
2. **실제 고객에게 테스트하지 않는다.** 반드시 Supabase MCP + 가상 데이터로 자체 검증.
3. **한 흐름 고치면 나머지 관련 진입점 전수 grep 후 정합 확인.** 시스템에 v1/v2 같은 여러 갈래가 있으면 하나만 고쳤을 때 오히려 정합이 깨진다.
4. **배포 전 실물 SQL 검증 결과가 있어야만 커밋한다.**
5. **완료 보고 조건**: 모든 자체 테스트 통과 + DB에 예상 상태가 반영된 것을 SQL로 확인.
6. **사용자에게 검증을 넘기지 않는다.** 검증은 개발자(AI)의 책임.

---

## 1. 기본 자체 테스트 절차 (모든 기능 공통)

### Step 1: 관련 진입점 전수 grep
- 수정하는 기능이 사용되는 모든 파일/API/화면 검색
- 예: `grep -rn "함수명\|테이블명\|변수명" src/`
- **하나라도 놓치면 정합 파괴 → 반복 실패의 원인**

### Step 2: 가상 데이터로 흐름 시뮬레이션
- Supabase MCP `execute_sql` 로 실제 DB 조회
- 필요 시 test 접두 UUID 로 가상 record 생성 → 검증 → 삭제
- 절대 실제 고객 record 로 실험 금지

### Step 3: 예상 상태 SQL 검증
- 배포 후 새로 만들어질 데이터가 어떤 상태여야 하는지 명시
- SQL 로 그 상태가 실제 반영됐는지 확인
- 실패 시 즉시 재수정, 통과 시에만 완료 보고

### Step 4: 완료 보고
- 완료 보고에는 **검증 SQL과 그 결과**가 함께 있어야 함
- "이론상 됨" 금지

---

## 2. 계약서 관련 흐름 체크리스트 (오늘 사고 사례)

### 계약서 시스템 진입점 (전 6곳 — 하나 고치면 나머지 5곳 정합 확인 필수)

| # | 파일 | 역할 |
|---|------|------|
| 1 | `api/admin/contracts/route.ts` POST | 신규 계약서 생성 |
| 2 | `api/admin/contracts/[id]/route.ts` PATCH | 편집 저장 |
| 3 | `api/admin/contracts/[id]/duplicate/route.ts` | 복제 |
| 4 | `api/contracts/sign/[token]/agree/route.ts` | 고객 서명 |
| 5 | `api/admin/contracts/[id]/admin-sign/route.ts` | 관리자 최종 확인 |
| 6 | `admin/contracts/[id]/page.tsx` | 화면 렌더 + PDF 생성 |

### 계약서 서명 변수 정책

- **v2 한글 변수만 사용**: `{{고객서명}}`, `{{고객사직인}}`, `{{공급사서명}}`, `{{공급사직인}}`, `{{고객성명}}`
- v1 영문 변수(`{{CUSTOMER_SIGNATURE}}` 등)는 하위 호환 shim, 새 코드에서는 사용 금지
- 저장 진입점(POST/PATCH)에서 반드시 `restoreSignaturePlaceholders` 통과

### 필수 검증 SQL (배포 후 실물 확인)

```sql
-- 신규 계약서가 v2 변수를 유지하는지 확인 (통과 조건: has_v2_* = true, dashed_* = false)
SELECT
  id, signing_status, created_at,
  (contract_snapshot->>'html' LIKE '%{{고객서명}}%')       AS has_v2_cust_sig,
  (contract_snapshot->>'html' LIKE '%{{고객사직인}}%')     AS has_v2_cust_stamp,
  (contract_snapshot->>'html' LIKE '%{{공급사서명}}%')     AS has_v2_supp_sig,
  (contract_snapshot->>'html' LIKE '%{{공급사직인}}%')     AS has_v2_supp_stamp,
  (contract_snapshot->>'html' LIKE '%(고객 서명)</span>%') AS dashed_cust_sig,
  (contract_snapshot->>'html' LIKE '%(공급사 서명)</span>%') AS dashed_supp_sig
FROM contracts
WHERE created_at >= NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC;
```

- **완료 조건**: 결과 행에서 `has_v2_*` 모두 `true`, `dashed_*` 모두 `false`.
- 하나라도 어긋나면 배포 취소 · 재수정.

### 서명 완료 계약서 검증 SQL

```sql
-- 서명 완료 시 실제 이미지가 스냅샷에 삽입됐는지 확인
SELECT id,
  (contract_snapshot->>'html' LIKE '%alt="고객 서명"%')   AS has_cust_sig_img,
  (contract_snapshot->>'html' LIKE '%alt="고객사 직인"%') AS has_cust_stamp_img,
  (contract_snapshot->>'html' LIKE '%alt="공급사 서명"%') AS has_supp_sig_img,
  (contract_snapshot->>'html' LIKE '%alt="공급사 직인"%') AS has_supp_stamp_img
FROM contracts
WHERE signing_status = 'completed' AND updated_at >= NOW() - INTERVAL '10 minutes';
```

---

## 3. 알림 발송 흐름 체크리스트

### 하드코딩 문구 금지 원칙

- 모든 자동/반자동 알림은 `notification_templates` 테이블에서 로드
- `renderTemplate` 로 변수 치환 후 발송
- 코드에 문구 하드코딩 시 관리자 화면(문자알림관리)에서 통제 불가 → 감사·회계 리스크

### 필수 검증 SQL

```sql
-- 새 template code 가 등록됐고 활성 상태인지 확인
SELECT code, title, send_mode, is_active, is_locked, applicable_types
FROM notification_templates
WHERE code = '<신규_CODE>';
```

- **완료 조건**: `is_active = true`, `send_mode` 가 의도한 값(auto/semi_auto/manual)

### 변수 카탈로그 등록 확인

- 새 변수 도입 시 `src/lib/notification-variables.ts` 의 `AVAILABLE_VARIABLES` 에 추가
- 등록 안 하면 편집기 팔레트에 노출 안 됨 + `renderTemplate` 이 빈 문자열 반환

---

## 4. DB 스키마 변경 체크리스트

1. `list_tables` 로 기존 구조 확인 (컬럼·타입·제약조건)
2. `apply_migration` 으로 마이그레이션 (직접 SQL 실행 대신)
3. 변경 후 `information_schema.columns` 로 실물 반영 확인
4. RLS 정책 변경 시 anon key 로 실제 조회 테스트

---

## 5. 완료 보고 형식 (표준)

```markdown
✅ 배포 완료 (커밋 <hash>)

## 자체 테스트 결과
- [x] 진입점 <N>곳 전수 grep 완료
- [x] 신규 데이터 예상 상태 SQL 검증 ✅
  - has_v2_cust_sig: true / dashed_cust_sig: false (예상 일치)
- [x] (해당 시) 서명 이미지 삽입 검증 ✅
- [x] (해당 시) 알림 템플릿 활성 확인 ✅

## 파일 변경
- <파일> — <변경 요약>

## Slack 알림 발송됨.
```

**하나라도 실패 시** → 재수정 → 재검증 → 다시 처음부터 이 형식으로 보고.

---

## 6. 반복 실패 사고 회고 (2026-08-19)

**사고 개요**: 계약서 서명 자리에 이미지가 박히지 않는 이슈로 6회 배포. 실제 고객이 서명한 계약서가 공란으로 렌더링되어 대표가 사과. 실제 시간 손실 및 신뢰 손실 발생.

**표면 원인**: v1(영문) → v2(한글) 변수 시스템 마이그레이션이 진입점별로 불완전.

**진짜 원인**:
1. "이론상 됨" 반복 보고로 사용자가 실물 확인 → 실패 발견
2. 6개 진입점 중 매 배포마다 하나씩만 수정 → 다른 진입점에서 반복 실패
3. 개발자가 자체 검증 없이 사용자에게 실물 테스트를 시킴

**재발 방지**: 이 문서의 절차를 엄격히 따를 것. 배포 전 자체 SQL 검증 필수화. 사용자는 승인만 하고 검증은 개발자 책임.

---

*이 문서는 계약서 이슈에서 도출된 학습을 다른 기능 개발에도 적용하기 위해 작성됨. 새로운 반복 실패 사고 발생 시 이 문서 갱신.*
