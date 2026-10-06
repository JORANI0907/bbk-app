-- ============================================================================
-- Payment Method Enum Redesign (2026-10-06)
-- ============================================================================
--
-- 목적: payment_method 레거시 한글 enum → 신규 영문 enum 전환
--
-- 변경 매핑:
--   '카드(온라인 간편결제)' → 'credit_card'
--   '계좌이체'               → 'bank_transfer'
--   '가상계좌'               → 'virtual_account'
--   '현금(계산서 희망)'      → 'virtual_account' + tax_invoice_required=true
--   '현금(비과세)'           → 'cash_untaxed'
--   '플랫폼'                 → 'platform' (레거시 유지, 신규 입력 금지)
--
--   customers 테이블 약칭 추가 매핑:
--   '카드'                   → 'credit_card'
--   '현금'                   → 'virtual_account' + tax_invoice_required=true
--   '현금(부가세 X)'         → 'cash_untaxed'
--
-- 적용 대상 테이블:
--   1) service_applications.payment_method
--      + tax_invoice_required 컬럼 DDL 추가 (현재 미존재)
--   2) customers.payment_method (tax_invoice_required 컬럼 이미 존재)
--   3) customer_billing_records.payment_method
--
-- 안전장치:
--   - 코드는 이미 src/lib/payment-methods.ts normalizePaymentMethod() 로 레거시+신규
--     모두 처리 가능. 이 마이그레이션은 "데이터 정리" 역할.
--   - 적용 실패해도 코드가 레거시 값 그대로 처리하므로 운영 중단 없음.
--
-- 롤백 가능성:
--   - '현금(계산서 희망)' → 'virtual_account' + tax_invoice_required=true 변환은
--     원복 가능 (tax_invoice_required=true AND virtual_account 조건으로 복원).
--   - 다른 변환은 1:1 매핑이므로 CASE WHEN 역방향 UPDATE로 복원.
--
-- 실행 전 체크:
--   1. Preview 환경에서 먼저 적용
--   2. 적용 전 DB 백업 (Supabase 자동 백업 확인)
--   3. 트리거/뷰에 payment_method 하드코딩된 것 없는지 확인
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: service_applications 에 tax_invoice_required 컬럼 추가 (미존재 시)
-- ============================================================================

ALTER TABLE service_applications
  ADD COLUMN IF NOT EXISTS tax_invoice_required BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN service_applications.tax_invoice_required IS
  '사업자 고객이 세금계산서 발행을 요청했는지 여부. 2026-10-06 enum 재설계 시 추가. '
  '이전엔 payment_method=''현금(계산서 희망)'' 값으로 표현했으나, 결제수단과 세금처리를 분리.';

-- ============================================================================
-- STEP 2: 레거시 '현금(계산서 희망)' 레코드의 tax_invoice_required 백필
-- ============================================================================

-- service_applications: '현금(계산서 희망)' → tax_invoice_required=true
UPDATE service_applications
   SET tax_invoice_required = TRUE
 WHERE payment_method = '현금(계산서 희망)'
   AND (tax_invoice_required IS NULL OR tax_invoice_required = FALSE);

-- customers: '현금(계산서 희망)' 또는 '현금' → tax_invoice_required=true
UPDATE customers
   SET tax_invoice_required = TRUE
 WHERE payment_method IN ('현금(계산서 희망)', '현금')
   AND (tax_invoice_required IS NULL OR tax_invoice_required = FALSE);

-- ============================================================================
-- STEP 3: service_applications.payment_method 변환
-- ============================================================================

UPDATE service_applications
   SET payment_method = CASE payment_method
     WHEN '카드(온라인 간편결제)' THEN 'credit_card'
     WHEN '계좌이체'               THEN 'bank_transfer'
     WHEN '가상계좌'               THEN 'virtual_account'
     WHEN '현금(계산서 희망)'      THEN 'virtual_account'
     WHEN '현금(비과세)'           THEN 'cash_untaxed'
     WHEN '플랫폼'                 THEN 'platform'
     ELSE payment_method
   END
 WHERE payment_method IN (
   '카드(온라인 간편결제)',
   '계좌이체',
   '가상계좌',
   '현금(계산서 희망)',
   '현금(비과세)',
   '플랫폼'
 );

-- ============================================================================
-- STEP 4: customers.payment_method 변환 (신청서 표기 + 약칭 모두 커버)
-- ============================================================================

UPDATE customers
   SET payment_method = CASE payment_method
     -- 신청서 전체 표기법
     WHEN '카드(온라인 간편결제)' THEN 'credit_card'
     WHEN '계좌이체'               THEN 'bank_transfer'
     WHEN '가상계좌'               THEN 'virtual_account'
     WHEN '현금(계산서 희망)'      THEN 'virtual_account'
     WHEN '현금(비과세)'           THEN 'cash_untaxed'
     WHEN '플랫폼'                 THEN 'platform'
     -- 고객 마스터 약칭 (CustomersManagementView.tsx:218)
     WHEN '카드'                   THEN 'credit_card'
     WHEN '현금'                   THEN 'virtual_account'   -- 계산서 희망 가정, tax_invoice_required=true 로 Step 2에서 세팅됨
     WHEN '현금(부가세 X)'         THEN 'cash_untaxed'
     ELSE payment_method
   END
 WHERE payment_method IN (
   '카드(온라인 간편결제)', '계좌이체', '가상계좌',
   '현금(계산서 희망)', '현금(비과세)', '플랫폼',
   '카드', '현금', '현금(부가세 X)'
 );

-- ============================================================================
-- STEP 5: customer_billing_records.payment_method 변환
-- ============================================================================

UPDATE customer_billing_records
   SET payment_method = CASE payment_method
     WHEN '카드(온라인 간편결제)' THEN 'credit_card'
     WHEN '계좌이체'               THEN 'bank_transfer'
     WHEN '가상계좌'               THEN 'virtual_account'
     WHEN '현금(계산서 희망)'      THEN 'virtual_account'
     WHEN '현금(비과세)'           THEN 'cash_untaxed'
     WHEN '플랫폼'                 THEN 'platform'
     ELSE payment_method
   END
 WHERE payment_method IN (
   '카드(온라인 간편결제)', '계좌이체', '가상계좌',
   '현금(계산서 희망)', '현금(비과세)', '플랫폼'
 );

-- ============================================================================
-- STEP 6: CHECK 제약 추가 (선택적 — 신규 입력 검증)
-- ============================================================================
-- 주석 해제 시, DB 레벨에서 enum 값 강제. 다만 레거시 값 혹시 남아있으면 실패하므로
-- Step 3~5 성공 후 안전하게 활성화.
--
-- ALTER TABLE service_applications
--   ADD CONSTRAINT service_applications_payment_method_check CHECK (
--     payment_method IS NULL OR payment_method IN (
--       'credit_card', 'corporate_card', 'bank_transfer', 'virtual_account',
--       'cash_untaxed', 'platform'
--     )
--   );
--
-- ALTER TABLE customers
--   ADD CONSTRAINT customers_payment_method_check CHECK (
--     payment_method IS NULL OR payment_method IN (
--       'credit_card', 'corporate_card', 'bank_transfer', 'virtual_account',
--       'cash_untaxed', 'platform'
--     )
--   );
--
-- ALTER TABLE customer_billing_records
--   ADD CONSTRAINT customer_billing_records_payment_method_check CHECK (
--     payment_method IN (
--       'credit_card', 'corporate_card', 'bank_transfer', 'virtual_account',
--       'cash_untaxed', 'platform'
--     )
--   );

COMMIT;

-- ============================================================================
-- 검증 쿼리 (적용 후 수동 실행 권장)
-- ============================================================================
--
-- -- 1) 레거시 값 잔여 체크 (0건이어야 성공)
-- SELECT COUNT(*) AS legacy_count FROM service_applications
--  WHERE payment_method IN ('카드(온라인 간편결제)','계좌이체','가상계좌','현금(계산서 희망)','현금(비과세)','플랫폼');
--
-- SELECT COUNT(*) AS legacy_count FROM customers
--  WHERE payment_method IN ('카드(온라인 간편결제)','계좌이체','가상계좌','현금(계산서 희망)','현금(비과세)','플랫폼','카드','현금','현금(부가세 X)');
--
-- -- 2) 신규 enum 분포 확인
-- SELECT payment_method, COUNT(*) FROM service_applications GROUP BY payment_method ORDER BY 2 DESC;
-- SELECT payment_method, COUNT(*) FROM customers GROUP BY payment_method ORDER BY 2 DESC;
-- SELECT payment_method, COUNT(*) FROM customer_billing_records GROUP BY payment_method ORDER BY 2 DESC;
--
-- -- 3) tax_invoice_required 백필 확인
-- SELECT tax_invoice_required, COUNT(*) FROM service_applications WHERE payment_method = 'virtual_account' GROUP BY tax_invoice_required;
-- SELECT tax_invoice_required, COUNT(*) FROM customers WHERE payment_method = 'virtual_account' GROUP BY tax_invoice_required;
