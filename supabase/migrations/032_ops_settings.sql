-- Phase 1 (운영 시스템): 설정성 데이터 (변경 드묾)
-- SPEC: docs/ops/SPEC_운영시스템.md §2.1~2.3
-- PLAN: docs/ops/PLAN_phase1.md §1.1
--
-- 대상 테이블: company_intent, services_ops, functions, standards, metrics_config
-- 시드: services_ops 3행, functions 15행, metrics_config 17행

-- ─────────────────────────────────────────────────────────────
-- 1. company_intent — 단일 행 강제 (id = 1)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_intent (
  id                    int         PRIMARY KEY CHECK (id = 1),
  purpose               text        NOT NULL DEFAULT '',
  intent_1              text        NOT NULL DEFAULT '',
  intent_2              text        NOT NULL DEFAULT '',
  intent_3              text        NOT NULL DEFAULT '',
  intent_1_tradeoff     text,
  intent_2_tradeoff     text,
  intent_3_tradeoff     text,
  never_1               text,
  never_2               text,
  never_3               text,
  always_1              text,
  always_2              text,
  always_3              text,
  year                  int         NOT NULL DEFAULT extract(year from now())::int,
  safe_days_start_date  date        NOT NULL DEFAULT current_date,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  company_intent IS
  '대표 의도 (규정 제1~3조). 항상 1행만 유지. 대시보드 최상단 배너에 표시.';
COMMENT ON COLUMN company_intent.safe_days_start_date IS
  'safety_incidents 이력이 없을 때의 무사고 카운트 시작일. safe_days 지표 계산 기준.';

-- 초기 1행 삽입 (관리자가 나중에 채움)
INSERT INTO company_intent (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- updated_at 자동 갱신 (001_users.sql 의 update_updated_at_column 재사용)
DROP TRIGGER IF EXISTS trg_company_intent_updated_at ON company_intent;
CREATE TRIGGER trg_company_intent_updated_at
  BEFORE UPDATE ON company_intent
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────
-- 2. services_ops — 서비스 정의 (기존 service_applications 와 별도)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS services_ops (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text        NOT NULL UNIQUE,
  customer_type     text,
  price_model       text        NOT NULL CHECK (price_model IN ('monthly','per_job','annual')),
  cost_rate         numeric(5,4) CHECK (cost_rate IS NULL OR (cost_rate >= 0 AND cost_rate <= 1)),
  contract_months   int         CHECK (contract_months IS NULL OR contract_months > 0),
  direction         text        NOT NULL CHECK (direction IN ('grow','keep','shrink')) DEFAULT 'keep',
  active            bool        NOT NULL DEFAULT true,
  sort_order        int         NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE services_ops IS
  '운영 규정 관점의 서비스 정의 (원가율/direction 등). 기존 service_applications 와는 이름만 매칭.';

DROP TRIGGER IF EXISTS trg_services_ops_updated_at ON services_ops;
CREATE TRIGGER trg_services_ops_updated_at
  BEFORE UPDATE ON services_ops
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 시드 3행 (BBK 실제 3종)
INSERT INTO services_ops (name, customer_type, price_model, direction, sort_order) VALUES
  ('정기딥케어',   '음식점', 'monthly', 'grow', 10),
  ('정기엔드케어', '음식점', 'monthly', 'grow', 20),
  ('1회성케어',    '음식점', 'per_job', 'keep', 30)
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 3. functions — 내부 7 + 외부 8 (고정 15행)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS functions (
  code            text        PRIMARY KEY CHECK (code ~ '^(IN[1-7]|EX[1-8])$'),
  kind            text        NOT NULL CHECK (kind IN ('internal','external')),
  name            text        NOT NULL,
  owner_user_id   uuid        REFERENCES users(id) ON DELETE SET NULL,
  backup_user_id  uuid        REFERENCES users(id) ON DELETE SET NULL,
  sort_order      int         NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE functions IS
  '내부 7개 (IN1~IN7) + 외부 8개 (EX1~EX8) 고정 기능. 시드 후 code/kind/name 변경 금지.';

DROP TRIGGER IF EXISTS trg_functions_updated_at ON functions;
CREATE TRIGGER trg_functions_updated_at
  BEFORE UPDATE ON functions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 시드 (SPEC §2.2)
INSERT INTO functions (code, kind, name, sort_order) VALUES
  ('IN1', 'internal', '영업·수주',      10),
  ('IN2', 'internal', '현장·납품',      20),
  ('IN3', 'internal', '품질·고객관리',  30),
  ('IN4', 'internal', '재무·자금',      40),
  ('IN5', 'internal', '인사·노무',      50),
  ('IN6', 'internal', '안전·법규',      60),
  ('IN7', 'internal', '기획·전략',      70),
  ('EX1', 'external', '고객',           110),
  ('EX2', 'external', '협력·공급업체',  120),
  ('EX3', 'external', '은행·금융',      130),
  ('EX4', 'external', '세무회계',       140),
  ('EX5', 'external', '노무',           150),
  ('EX6', 'external', '관공서·인허가',  160),
  ('EX7', 'external', '보험',           170),
  ('EX8', 'external', '경쟁사',         180)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 4. standards — 4층 필수 문서 (수시 갱신)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS standards (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  function_code     text        NOT NULL REFERENCES functions(code) ON DELETE CASCADE,
  doc_name          text        NOT NULL,
  max_pages         text,
  cycle             text        NOT NULL CHECK (cycle IN ('daily','weekly','monthly','quarterly','yearly','on_event')),
  stale_after_days  int         NOT NULL CHECK (stale_after_days > 0),
  last_updated_at   timestamptz,
  file_url          text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN standards.last_updated_at IS
  'null이면 미보유 = 우선 과제. 기능 신호등 자동 판정에 사용.';

CREATE INDEX IF NOT EXISTS idx_standards_function_code   ON standards(function_code);
CREATE INDEX IF NOT EXISTS idx_standards_last_updated_at ON standards(last_updated_at);

DROP TRIGGER IF EXISTS trg_standards_updated_at ON standards;
CREATE TRIGGER trg_standards_updated_at
  BEFORE UPDATE ON standards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────
-- 5. metrics_config — 지표 설정 (하드코딩 금지)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS metrics_config (
  key                 text        PRIMARY KEY,
  function_code       text        NOT NULL REFERENCES functions(code) ON DELETE CASCADE,
  label               text        NOT NULL,
  unit                text        NOT NULL,
  target_value        numeric,
  direction           text        NOT NULL CHECK (direction IN ('higher_better','lower_better')),
  cycle               text        NOT NULL CHECK (cycle IN ('daily','weekly','monthly','quarterly')),
  show_on_dashboard   bool        NOT NULL DEFAULT false,
  alive               bool        NOT NULL DEFAULT true,
  calculation         text        NOT NULL DEFAULT 'manual' CHECK (calculation IN ('auto','manual')),
  sort_order          int         NOT NULL DEFAULT 0,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE metrics_config IS
  '지표를 코드에 하드코딩하지 마라. 3개월 뒤 죽은 지표를 코드 수정 없이 끌 수 있어야 한다.';
COMMENT ON COLUMN metrics_config.alive IS
  '3개월 검증 통과 여부. 기본 true. 근거 데이터가 없어 자동 판정 불가한 지표는 초기 false.';
COMMENT ON COLUMN metrics_config.calculation IS
  'auto: src/lib/ops/metrics.ts 의 대응 함수로 자동 계산. manual: monthly_meetings 또는 cash_snapshots 에서 조회.';

DROP TRIGGER IF EXISTS trg_metrics_config_updated_at ON metrics_config;
CREATE TRIGGER trg_metrics_config_updated_at
  BEFORE UPDATE ON metrics_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 시드 17행 (SPEC §2.3)
-- show_on_dashboard: Phase 1 대시보드 표시 대상 8개만 true
-- alive: 근거 데이터 없는 3개는 false (contract_coverage, days_since_training, bep_progress)
-- calculation: 자동 집계 가능한 6개만 auto, 나머지 manual
INSERT INTO metrics_config
  (key, function_code, label, unit, direction, cycle, show_on_dashboard, alive, calculation, sort_order) VALUES
  ('jobs_backlog',        'IN1', '수주 잔량',            '건', 'higher_better', 'monthly',   false, true,  'manual', 10),
  ('new_inquiries',       'IN1', '신규 문의 건수',        '건', 'higher_better', 'monthly',   false, true,  'manual', 20),
  ('daily_check_rate',    'IN2', '일일 확인 제출률',      '%',  'higher_better', 'daily',     true,  true,  'auto',   30),
  ('ontime_rate',         'IN2', '납기 준수율',          '%',  'higher_better', 'monthly',   false, true,  'manual', 40),
  ('claims_count',        'IN3', '클레임 건수',          '건', 'lower_better',  'monthly',   true,  true,  'auto',   50),
  ('rework_count',        'IN3', '재작업 건수',          '건', 'lower_better',  'monthly',   true,  true,  'auto',   60),
  ('churn_count',         'IN3', '이탈 고객 수',         '건', 'lower_better',  'monthly',   true,  true,  'manual', 70),
  ('renewal_rate',        'IN3', '재계약률',             '%',  'higher_better', 'quarterly', true,  true,  'manual', 80),
  ('cash_balance',        'IN4', '통장 현금 잔고',        '원', 'higher_better', 'weekly',    true,  true,  'manual', 90),
  ('receivables_90',      'IN4', '90일 초과 미수금',      '원', 'lower_better',  'weekly',    true,  true,  'manual', 100),
  ('next30_outflow',      'IN4', '다음 30일 지출 예정',   '원', 'lower_better',  'weekly',    true,  true,  'manual', 110),
  ('bep_progress',        'IN4', '손익분기 대비 진행률',  '%',  'higher_better', 'monthly',   false, false, 'manual', 120),
  ('contract_coverage',   'IN5', '근로계약서 보유율',     '%',  'higher_better', 'quarterly', false, false, 'manual', 130),
  ('safe_days',           'IN6', '연속 무사고 일수',      '일', 'higher_better', 'daily',     true,  true,  'auto',   140),
  ('days_since_training', 'IN6', '안전교육 후 경과일',    '일', 'lower_better',  'monthly',   false, false, 'manual', 150),
  ('notice_rate',         'IN7', '주간 공지 발행률',      '%',  'higher_better', 'weekly',    true,  true,  'auto',   160),
  ('meeting_rate',        'IN7', '월간 회의 개최율',      '%',  'higher_better', 'monthly',   true,  true,  'auto',   170)
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- ROLLBACK (수동 실행 시 사용)
-- ─────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS metrics_config CASCADE;
-- DROP TABLE IF EXISTS standards CASCADE;
-- DROP TABLE IF EXISTS functions CASCADE;
-- DROP TABLE IF EXISTS services_ops CASCADE;
-- DROP TABLE IF EXISTS company_intent CASCADE;
