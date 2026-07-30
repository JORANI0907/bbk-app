-- Phase 1 (운영 시스템): 운영 기록 (자주 씀)
-- SPEC: docs/ops/SPEC_운영시스템.md §2.4
-- PLAN: docs/ops/PLAN_phase1.md §1.2
--
-- 대상 테이블: sites, daily_checks, weekly_notices, monthly_meetings,
--             quarterly_interviews, claims, cash_snapshots, deadlines, safety_incidents

-- ─────────────────────────────────────────────────────────────
-- 1. sites — 현장 (Q1 옵션 A: 정기 고객 전용, customer_id 1:1)
--   * 1회성케어는 sites 대상 아님 (기존 service_applications + WorkPanel 커버)
--   * 정기딥/엔드 고객 UPDATE/INSERT 시 034 트리거가 자동 upsert
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sites (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           uuid        NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  service_id            uuid        REFERENCES services_ops(id) ON DELETE SET NULL,
  name                  text        NOT NULL,
  contract_start        date,
  contract_end          date,
  status                text        NOT NULL CHECK (status IN ('active','ended','churned')) DEFAULT 'active',
  assigned_worker_ids   uuid[]      NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  sites IS
  '현장 (운영 규정 관점). 정기딥/엔드 고객 한 명당 한 사이트 (1:1). 1회성은 대상 아님.';
COMMENT ON COLUMN sites.customer_id IS
  'UNIQUE + CASCADE. customers 삭제 시 sites 자동 정리. 정기 고객만 존재.';
COMMENT ON COLUMN sites.assigned_worker_ids IS
  '다중 배정. workers.id (users.id 아님 주의) 참조. sites 단위 상시 배정 (work_assignments 회차 배정과 별개).';

CREATE INDEX IF NOT EXISTS idx_sites_active_expiring ON sites(status, contract_end)
  WHERE status = 'active';
-- customer_id 는 UNIQUE 제약이 자동 인덱스 생성.

DROP TRIGGER IF EXISTS trg_sites_updated_at ON sites;
CREATE TRIGGER trg_sites_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────
-- 2. daily_checks — 일일 현장 확인 (규정 제6조)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_checks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       uuid        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type          text        NOT NULL CHECK (type IN ('start','end')),
  note          text        NOT NULL DEFAULT '특이사항 없음',
  photo_url     text,
  checked_at    timestamptz NOT NULL DEFAULT now(),
  reacted_by    uuid        REFERENCES users(id) ON DELETE SET NULL,
  reacted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  daily_checks IS
  '규정 제6조. 하루 두 번, 각 한 줄. 작성 5초 이내가 목표.';
COMMENT ON COLUMN daily_checks.reacted_by IS
  '대표/관리자 반응 (규정 제6조 3항). null 상태 24h 초과 시 알림 발생.';

-- 같은 사이트·같은 유형 하루 1건 강제 (연속 재등록 방지, KST 기준)
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_checks_site_user_type_kstdate
  ON daily_checks (site_id, user_id, type, ((checked_at AT TIME ZONE 'Asia/Seoul')::date));

CREATE INDEX IF NOT EXISTS idx_daily_checks_checked_at_desc
  ON daily_checks (checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_checks_no_reaction
  ON daily_checks (checked_at)
  WHERE reacted_by IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. weekly_notices — 주간 공지 3줄 (규정 제7조)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weekly_notices (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start        date        NOT NULL UNIQUE,
  line1             text        NOT NULL CHECK (char_length(line1) <= 100),
  line2             text        NOT NULL CHECK (char_length(line2) <= 100),
  line3             text        NOT NULL CHECK (char_length(line3) <= 100),
  author_id         uuid        NOT NULL REFERENCES users(id),
  ai_draft_used     bool        NOT NULL DEFAULT false,
  original_draft    jsonb,
  published_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  weekly_notices IS
  '규정 제7조. 매주 금요일, 대표가 직접. 100자 하드 제한.';
COMMENT ON COLUMN weekly_notices.week_start IS
  '해당 주 월요일 (KST). UNIQUE 로 한 주 1건 강제.';
COMMENT ON COLUMN weekly_notices.original_draft IS
  'AI 초안 원본 JSON. 대표가 편집한 후에도 원본을 남겨 diff/피드백에 사용.';

CREATE INDEX IF NOT EXISTS idx_weekly_notices_published
  ON weekly_notices (published_at DESC) WHERE published_at IS NOT NULL;

DROP TRIGGER IF EXISTS trg_weekly_notices_updated_at ON weekly_notices;
CREATE TRIGGER trg_weekly_notices_updated_at
  BEFORE UPDATE ON weekly_notices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────
-- 4. monthly_meetings — 월간 전체회의 (규정 제8조)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monthly_meetings (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  month             date        NOT NULL UNIQUE,
  held_at           timestamptz,
  attendee_count    int         NOT NULL DEFAULT 0 CHECK (attendee_count >= 0),
  total_count       int         NOT NULL DEFAULT 0 CHECK (total_count >= 0),
  jobs_count        int         NOT NULL DEFAULT 0 CHECK (jobs_count >= 0),
  claims_count      int         NOT NULL DEFAULT 0 CHECK (claims_count >= 0),
  rework_count      int         NOT NULL DEFAULT 0 CHECK (rework_count >= 0),
  churn_count       int         NOT NULL DEFAULT 0 CHECK (churn_count >= 0),
  renewal_rate      numeric(5,2) CHECK (renewal_rate IS NULL OR (renewal_rate >= 0 AND renewal_rate <= 100)),
  revenue           bigint      CHECK (revenue IS NULL OR revenue >= 0),
  net_profit        bigint,
  -- SPEC §2.4 검증 규칙: revenue 있는데 net_profit 비면 저장 거부 (DB 레벨 강제)
  CONSTRAINT chk_revenue_needs_net_profit
    CHECK ( (revenue IS NULL) OR (net_profit IS NOT NULL) ),
  praised_user_id   uuid        REFERENCES users(id) ON DELETE SET NULL,
  praise_reason     text,
  fix_item          text,
  fix_owner_id      uuid        REFERENCES users(id) ON DELETE SET NULL,
  fix_due           date,
  fix_result        text        CHECK (fix_result IS NULL OR fix_result IN ('pending','done','dropped')) DEFAULT 'pending',
  -- fix_item 있으면 owner 와 due 필수
  CONSTRAINT chk_fix_item_needs_owner_due
    CHECK ( (fix_item IS NULL OR fix_item = '') OR (fix_owner_id IS NOT NULL AND fix_due IS NOT NULL) ),
  photo_url         text,
  decision_1        text,
  decision_2        text,
  decision_3        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE monthly_meetings IS
  '규정 제8조. 회의록 없음. 이 한 행 + 사진 1장이 전부.';
COMMENT ON CONSTRAINT chk_revenue_needs_net_profit ON monthly_meetings IS
  'SPEC §2.4: 매출만 공개하고 남는 돈을 감추면 투명성이 아니라 오해 생산기가 된다.';

DROP TRIGGER IF EXISTS trg_monthly_meetings_updated_at ON monthly_meetings;
CREATE TRIGGER trg_monthly_meetings_updated_at
  BEFORE UPDATE ON monthly_meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────
-- 5. quarterly_interviews — 분기 개인면담 (규정 제9조)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quarterly_interviews (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter           text        NOT NULL CHECK (quarter ~ '^[0-9]{4}Q[1-4]$'),
  user_id           uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  held_at           timestamptz NOT NULL,
  q1_hardest        text,
  q2_wish           text,
  q3_future         text,
  company_action    text,
  notified_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quarter, user_id)
);

COMMENT ON TABLE quarterly_interviews IS
  '규정 제9조. 분기당 사람당 1건. q2_wish 후 90일간 notified_at null 이면 규정 제14조 실패 3번.';

DROP TRIGGER IF EXISTS trg_quarterly_interviews_updated_at ON quarterly_interviews;
CREATE TRIGGER trg_quarterly_interviews_updated_at
  BEFORE UPDATE ON quarterly_interviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────
-- 6. claims — 클레임 대장
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claims (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       uuid        NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  occurred_at   timestamptz NOT NULL,
  content       text        NOT NULL,
  category      text,
  cause         text,
  is_rework     bool        NOT NULL DEFAULT false,
  resolved_at   timestamptz,
  logged_by     uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN claims.content  IS '고객이 말한 그대로.';
COMMENT ON COLUMN claims.category IS 'AI 분류 결과 (Phase 2 예정).';

CREATE INDEX IF NOT EXISTS idx_claims_occurred_at_desc  ON claims (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_claims_unresolved        ON claims (occurred_at DESC)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_claims_site_id           ON claims (site_id);

DROP TRIGGER IF EXISTS trg_claims_updated_at ON claims;
CREATE TRIGGER trg_claims_updated_at
  BEFORE UPDATE ON claims
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────
-- 7. cash_snapshots — 주 1회 수동 입력
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cash_snapshots (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of                 date        NOT NULL UNIQUE,
  balance               bigint      CHECK (balance IS NULL OR balance >= 0),
  receivables_total     bigint      CHECK (receivables_total IS NULL OR receivables_total >= 0),
  receivables_over90    bigint      CHECK (receivables_over90 IS NULL OR receivables_over90 >= 0),
  next30_outflow        bigint      CHECK (next30_outflow IS NULL OR next30_outflow >= 0),
  logged_by             uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE cash_snapshots IS
  '주 1회 대표가 통장 잔고·미수금·지출예정 수기 입력. IN4 지표의 근거.';

-- ─────────────────────────────────────────────────────────────
-- 8. deadlines — 임박 항목
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deadlines (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text        NOT NULL,
  due_date          date        NOT NULL,
  category          text        NOT NULL CHECK (category IN ('규정','세무','영업','법인','인허가','안전')),
  consequence       text        NOT NULL,
  source            text        NOT NULL CHECK (source IN ('manual','auto')) DEFAULT 'manual',
  related_site_id   uuid        REFERENCES sites(id) ON DELETE SET NULL,
  done_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN deadlines.related_site_id IS
  'source=auto (예: 계약 D-60) 인 경우 sites 역참조. manual 이면 null.';

CREATE INDEX IF NOT EXISTS idx_deadlines_due_pending
  ON deadlines (due_date) WHERE done_at IS NULL;
-- auto 임박 항목 upsert 시 사이트당 category 별 최대 1건 (중복 방지)
CREATE UNIQUE INDEX IF NOT EXISTS uq_deadlines_auto_site_category
  ON deadlines (related_site_id, category)
  WHERE source = 'auto' AND done_at IS NULL AND related_site_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_deadlines_updated_at ON deadlines;
CREATE TRIGGER trg_deadlines_updated_at
  BEFORE UPDATE ON deadlines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────
-- 9. safety_incidents — 사고 이력 (safe_days 계산 근거)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS safety_incidents (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  site_id       uuid        REFERENCES sites(id) ON DELETE SET NULL,
  note          text,
  logged_by     uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE safety_incidents IS
  '연속 무사고 일수 리셋용. Phase 1 은 대표가 [사고 기록] 버튼으로 수동 등록.';

CREATE INDEX IF NOT EXISTS idx_safety_incidents_occurred_at_desc
  ON safety_incidents (occurred_at DESC);

-- ─────────────────────────────────────────────────────────────
-- ROLLBACK (수동 실행 시 사용)
-- ─────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS safety_incidents CASCADE;
-- DROP TABLE IF EXISTS deadlines CASCADE;
-- DROP TABLE IF EXISTS cash_snapshots CASCADE;
-- DROP TABLE IF EXISTS claims CASCADE;
-- DROP TABLE IF EXISTS quarterly_interviews CASCADE;
-- DROP TABLE IF EXISTS monthly_meetings CASCADE;
-- DROP TABLE IF EXISTS weekly_notices CASCADE;
-- DROP TABLE IF EXISTS daily_checks CASCADE;
-- DROP TABLE IF EXISTS sites CASCADE;
