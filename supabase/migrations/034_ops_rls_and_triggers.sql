-- Phase 1 (운영 시스템): RLS 정책 + 자동 트리거
-- SPEC: docs/ops/SPEC_운영시스템.md §2, §3
-- PLAN: docs/ops/PLAN_phase1.md §1.3
--
-- 원칙:
--  * 서버 (Next API 라우트) 는 createServiceClient() 로 RLS bypass → 세션 role 로 게이팅
--  * 클라이언트 사이드 접근은 RLS 로 이중 방어
--  * users 테이블의 auth_id ↔ auth.uid() 매핑 사용 (기존 001_users.sql 컨벤션 준수)

-- ─────────────────────────────────────────────────────────────
-- Helper: 현재 세션의 users.role 조회 (RLS 정책에서 재사용)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION current_user_role() RETURNS text AS $$
  SELECT role FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_user_id() RETURNS uuid AS $$
  SELECT id FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────
-- RLS 활성화 (14개 테이블)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE company_intent        ENABLE ROW LEVEL SECURITY;
ALTER TABLE services_ops          ENABLE ROW LEVEL SECURITY;
ALTER TABLE functions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE standards             ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_checks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_notices        ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_meetings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE quarterly_interviews  ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims                ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_snapshots        ENABLE ROW LEVEL SECURITY;
ALTER TABLE deadlines             ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_incidents      ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 정책: 설정 5종 (admin ALL, worker SELECT)
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['company_intent','services_ops','functions','standards','metrics_config']
  LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS %I ON %I;
      CREATE POLICY %I ON %I FOR ALL
        USING    (current_user_role() = 'admin')
        WITH CHECK (current_user_role() = 'admin');
    $f$, t || '_admin_all', t, t || '_admin_all', t);

    EXECUTE format($f$
      DROP POLICY IF EXISTS %I ON %I;
      CREATE POLICY %I ON %I FOR SELECT
        USING (current_user_role() IN ('admin','worker'));
    $f$, t || '_worker_select', t, t || '_worker_select', t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 정책: sites
--   admin ALL / worker SELECT (assigned) / franchise_hq SELECT (customer 소속)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS sites_admin_all      ON sites;
CREATE POLICY sites_admin_all ON sites FOR ALL
  USING    (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

DROP POLICY IF EXISTS sites_worker_select  ON sites;
CREATE POLICY sites_worker_select ON sites FOR SELECT
  USING (
    current_user_role() = 'worker'
    AND assigned_worker_ids @> ARRAY[current_user_id()]
  );

-- (franchise_hq 정책은 기존 franchise_branch_map 스키마 정착 후 별도 phase에서 추가)

-- ─────────────────────────────────────────────────────────────
-- 정책: daily_checks
--   admin ALL / worker INSERT + SELECT (own site)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS daily_checks_admin_all ON daily_checks;
CREATE POLICY daily_checks_admin_all ON daily_checks FOR ALL
  USING    (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

DROP POLICY IF EXISTS daily_checks_worker_insert ON daily_checks;
CREATE POLICY daily_checks_worker_insert ON daily_checks FOR INSERT
  WITH CHECK (
    current_user_role() = 'worker'
    AND user_id = current_user_id()
    AND EXISTS (
      SELECT 1 FROM sites s
      WHERE s.id = daily_checks.site_id
        AND s.assigned_worker_ids @> ARRAY[current_user_id()]
    )
  );

DROP POLICY IF EXISTS daily_checks_worker_select ON daily_checks;
CREATE POLICY daily_checks_worker_select ON daily_checks FOR SELECT
  USING (
    current_user_role() = 'worker'
    AND EXISTS (
      SELECT 1 FROM sites s
      WHERE s.id = daily_checks.site_id
        AND s.assigned_worker_ids @> ARRAY[current_user_id()]
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 정책: weekly_notices
--   admin ALL / worker SELECT (전부) / customer SELECT (published only)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS weekly_notices_admin_all ON weekly_notices;
CREATE POLICY weekly_notices_admin_all ON weekly_notices FOR ALL
  USING    (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

DROP POLICY IF EXISTS weekly_notices_worker_select ON weekly_notices;
CREATE POLICY weekly_notices_worker_select ON weekly_notices FOR SELECT
  USING (current_user_role() = 'worker');

DROP POLICY IF EXISTS weekly_notices_customer_select ON weekly_notices;
CREATE POLICY weekly_notices_customer_select ON weekly_notices FOR SELECT
  USING (current_user_role() = 'customer' AND published_at IS NOT NULL);

-- ─────────────────────────────────────────────────────────────
-- 정책: monthly_meetings / quarterly_interviews / cash_snapshots / deadlines
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS monthly_meetings_admin_all ON monthly_meetings;
CREATE POLICY monthly_meetings_admin_all ON monthly_meetings FOR ALL
  USING    (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

DROP POLICY IF EXISTS monthly_meetings_worker_select ON monthly_meetings;
CREATE POLICY monthly_meetings_worker_select ON monthly_meetings FOR SELECT
  USING (current_user_role() IN ('admin','worker'));

DROP POLICY IF EXISTS quarterly_interviews_admin_all ON quarterly_interviews;
CREATE POLICY quarterly_interviews_admin_all ON quarterly_interviews FOR ALL
  USING    (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

DROP POLICY IF EXISTS quarterly_interviews_worker_select_own ON quarterly_interviews;
CREATE POLICY quarterly_interviews_worker_select_own ON quarterly_interviews FOR SELECT
  USING (current_user_role() = 'worker' AND user_id = current_user_id());

DROP POLICY IF EXISTS cash_snapshots_admin_all ON cash_snapshots;
CREATE POLICY cash_snapshots_admin_all ON cash_snapshots FOR ALL
  USING    (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

DROP POLICY IF EXISTS deadlines_admin_all ON deadlines;
CREATE POLICY deadlines_admin_all ON deadlines FOR ALL
  USING    (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

DROP POLICY IF EXISTS deadlines_worker_select ON deadlines;
CREATE POLICY deadlines_worker_select ON deadlines FOR SELECT
  USING (current_user_role() IN ('admin','worker'));

-- ─────────────────────────────────────────────────────────────
-- 정책: claims
--   admin ALL / worker INSERT + SELECT (own site)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS claims_admin_all ON claims;
CREATE POLICY claims_admin_all ON claims FOR ALL
  USING    (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

DROP POLICY IF EXISTS claims_worker_insert ON claims;
CREATE POLICY claims_worker_insert ON claims FOR INSERT
  WITH CHECK (
    current_user_role() = 'worker'
    AND logged_by = current_user_id()
    AND EXISTS (
      SELECT 1 FROM sites s
      WHERE s.id = claims.site_id
        AND s.assigned_worker_ids @> ARRAY[current_user_id()]
    )
  );

DROP POLICY IF EXISTS claims_worker_select ON claims;
CREATE POLICY claims_worker_select ON claims FOR SELECT
  USING (
    current_user_role() = 'worker'
    AND EXISTS (
      SELECT 1 FROM sites s
      WHERE s.id = claims.site_id
        AND s.assigned_worker_ids @> ARRAY[current_user_id()]
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 정책: safety_incidents (admin ALL / worker INSERT + SELECT)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS safety_incidents_admin_all ON safety_incidents;
CREATE POLICY safety_incidents_admin_all ON safety_incidents FOR ALL
  USING    (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

DROP POLICY IF EXISTS safety_incidents_worker_insert ON safety_incidents;
CREATE POLICY safety_incidents_worker_insert ON safety_incidents FOR INSERT
  WITH CHECK (
    current_user_role() = 'worker'
    AND logged_by = current_user_id()
  );

DROP POLICY IF EXISTS safety_incidents_worker_select ON safety_incidents;
CREATE POLICY safety_incidents_worker_select ON safety_incidents FOR SELECT
  USING (current_user_role() IN ('admin','worker'));

-- ═════════════════════════════════════════════════════════════
-- 자동 트리거
-- ═════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- T1. daily_checks: 미래 시각 등록 방지 (백데이트 허용 X, 5분 여유)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION daily_checks_prevent_future() RETURNS trigger AS $$
BEGIN
  IF NEW.checked_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'daily_checks.checked_at 은 미래 시각일 수 없습니다 (허용 편차 5분).';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_daily_checks_prevent_future ON daily_checks;
CREATE TRIGGER trg_daily_checks_prevent_future
  BEFORE INSERT OR UPDATE OF checked_at ON daily_checks
  FOR EACH ROW EXECUTE FUNCTION daily_checks_prevent_future();

-- ─────────────────────────────────────────────────────────────
-- T2. sites: contract_end 갱신 시 deadlines D-60 auto upsert
--   SPEC §3 IN3 "계약 만료 D-60 이내 존재" 신호등 근거
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sites_upsert_contract_deadline() RETURNS trigger AS $$
DECLARE
  v_notify_from date;
BEGIN
  IF NEW.contract_end IS NULL OR NEW.status <> 'active' THEN
    -- 계약 만료 없음 또는 비활성 → 기존 auto 항목 지우기
    DELETE FROM deadlines
     WHERE source = 'auto' AND category = '영업' AND related_site_id = NEW.id;
    RETURN NEW;
  END IF;

  v_notify_from := NEW.contract_end - interval '60 days';

  -- D-60 이내면 upsert, 아니면 auto 항목 삭제
  IF current_date >= v_notify_from THEN
    INSERT INTO deadlines (title, due_date, category, consequence, source, related_site_id)
    VALUES (
      NEW.name || ' 계약 만료',
      NEW.contract_end,
      '영업',
      '재계약 협의 미완료 시 매출 손실',
      'auto',
      NEW.id
    )
    ON CONFLICT (related_site_id, category)
      WHERE source = 'auto' AND done_at IS NULL AND related_site_id IS NOT NULL
      DO UPDATE SET
        title       = EXCLUDED.title,
        due_date    = EXCLUDED.due_date,
        consequence = EXCLUDED.consequence,
        updated_at  = now();
  ELSE
    DELETE FROM deadlines
     WHERE source = 'auto' AND category = '영업'
       AND related_site_id = NEW.id AND done_at IS NULL;
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sites_upsert_contract_deadline ON sites;
CREATE TRIGGER trg_sites_upsert_contract_deadline
  AFTER INSERT OR UPDATE OF contract_end, status ON sites
  FOR EACH ROW EXECUTE FUNCTION sites_upsert_contract_deadline();

-- ─────────────────────────────────────────────────────────────
-- T3. weekly_notices: "발행 상태 유지하며 본문 편집" 만 금지
--   * OLD 도 발행, NEW 도 여전히 발행 → line 변경 시 reject
--   * "발행 취소(published_at = NULL) 하며 line 편집" 은 허용 → 오타 정정 흐름
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION weekly_notices_immutable_after_publish() RETURNS trigger AS $$
BEGIN
  IF OLD.published_at IS NOT NULL
     AND NEW.published_at IS NOT NULL
     AND (NEW.line1 <> OLD.line1 OR NEW.line2 <> OLD.line2 OR NEW.line3 <> OLD.line3) THEN
    RAISE EXCEPTION '발행된 주간 공지의 본문은 편집할 수 없습니다. 발행 취소 후 편집하세요.';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_weekly_notices_immutable_after_publish ON weekly_notices;
CREATE TRIGGER trg_weekly_notices_immutable_after_publish
  BEFORE UPDATE ON weekly_notices
  FOR EACH ROW EXECUTE FUNCTION weekly_notices_immutable_after_publish();

-- ─────────────────────────────────────────────────────────────
-- T4. customers: 정기딥/엔드 고객 UPDATE/INSERT 시 sites 자동 upsert
--   * 관리자가 customers 편집만 해도 sites 가 저절로 동기화 → 관리 UX 균열 방지
--   * 정기 타입이 아니면 아무것도 안 함 (기존 sites 유지, 관리자 수동 정리)
--   * deleted_at 세팅되면 관련 sites status='churned'
--   * customers 테이블은 001~ 이전 마이그레이션에서 정의됨. 여기선 트리거만 부착.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION customers_upsert_recurring_site() RETURNS trigger AS $$
DECLARE
  v_service_id uuid;
BEGIN
  -- 정기 타입 아니면 스킵
  IF NEW.customer_type IS NULL
     OR NEW.customer_type NOT IN ('정기딥케어', '정기엔드케어') THEN
    RETURN NEW;
  END IF;

  -- soft delete → 관련 site status 만 변경 (레코드 유지)
  IF NEW.deleted_at IS NOT NULL THEN
    UPDATE sites
       SET status = 'churned', updated_at = now()
     WHERE customer_id = NEW.id
       AND status = 'active';
    RETURN NEW;
  END IF;

  -- 정기·활성 → sites upsert
  SELECT id INTO v_service_id
    FROM services_ops
   WHERE name = NEW.customer_type
   LIMIT 1;

  INSERT INTO sites (customer_id, service_id, name, contract_start, contract_end, status)
  VALUES (
    NEW.id,
    v_service_id,
    COALESCE(NEW.business_name, '이름 미정'),
    NEW.contract_start_date,
    NEW.contract_end_date,
    'active'
  )
  ON CONFLICT (customer_id) DO UPDATE SET
    service_id     = EXCLUDED.service_id,
    name           = COALESCE(EXCLUDED.name, sites.name),
    contract_start = EXCLUDED.contract_start,
    contract_end   = EXCLUDED.contract_end,
    status         = 'active',
    updated_at     = now();

  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customers_upsert_recurring_site ON customers;
CREATE TRIGGER trg_customers_upsert_recurring_site
  AFTER INSERT OR UPDATE OF customer_type, business_name, contract_start_date, contract_end_date, deleted_at
  ON customers
  FOR EACH ROW EXECUTE FUNCTION customers_upsert_recurring_site();

-- ═════════════════════════════════════════════════════════════
-- 백필: 기존 정기 고객들에 대해 sites 1회성 생성 (이미 있는 것은 스킵)
-- ═════════════════════════════════════════════════════════════
INSERT INTO sites (customer_id, service_id, name, contract_start, contract_end, status)
SELECT
  c.id,
  s.id,
  COALESCE(c.business_name, '이름 미정'),
  c.contract_start_date,
  c.contract_end_date,
  'active'
FROM customers c
LEFT JOIN services_ops s ON s.name = c.customer_type
WHERE c.customer_type IN ('정기딥케어', '정기엔드케어')
  AND c.deleted_at IS NULL
ON CONFLICT (customer_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- ROLLBACK (수동)
-- ─────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS trg_customers_upsert_recurring_site ON customers;
-- DROP FUNCTION IF EXISTS customers_upsert_recurring_site() CASCADE;
-- DROP FUNCTION IF EXISTS weekly_notices_immutable_after_publish() CASCADE;
-- DROP FUNCTION IF EXISTS sites_upsert_contract_deadline() CASCADE;
-- DROP FUNCTION IF EXISTS daily_checks_prevent_future() CASCADE;
-- DROP FUNCTION IF EXISTS current_user_role() CASCADE;
-- DROP FUNCTION IF EXISTS current_user_id() CASCADE;
-- 정책 삭제는 각 테이블 DROP CASCADE 시 자동 삭제됨.
