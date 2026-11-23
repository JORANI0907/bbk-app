-- 2026-11-23: 서비스 비용 기준(규모×난이도 기반) + 계산 기록.
--
--   pricing_rules         서비스 유형별 기준값. 수정할 때마다 새 버전 행을 넣고 is_current 를 옮긴다 (이력 보존).
--                         config(jsonb) 구조는 src/lib/pricing/types.ts 의 PricingConfig.
--   pricing_calculations  계산기 결과. 어떤 기준 버전으로 계산했는지(rule_id) 남겨 과거 견적을 설명할 수 있게 한다.
--   접근은 서버(service role)만 — RLS 켜고 정책은 두지 않는다.

create table if not exists pricing_rules (
  id              uuid primary key default gen_random_uuid(),
  service_type    text not null check (service_type in ('onetime_deep', 'onetime_end', 'regular_deep', 'regular_end')),
  version_no      integer not null check (version_no >= 1),
  config          jsonb not null,
  is_current      boolean not null default true,
  note            text check (note is null or char_length(note) <= 500),
  created_by      text,
  created_at      timestamptz not null default now(),
  unique (service_type, version_no)
);

-- 서비스 유형당 현재 버전은 1개
create unique index if not exists uq_pricing_rules_current
  on pricing_rules (service_type) where is_current;

create table if not exists pricing_calculations (
  id              uuid primary key default gen_random_uuid(),
  service_type    text not null,
  rule_id         uuid references pricing_rules(id) on delete set null,
  inputs          jsonb not null,
  result          jsonb not null,
  label           text check (label is null or char_length(label) <= 120),
  application_id  uuid,
  created_by      text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_pricing_calculations_time on pricing_calculations (created_at desc);

alter table pricing_rules        enable row level security;
alter table pricing_calculations enable row level security;

comment on table pricing_rules is '서비스 비용 기준 (규모×난이도). 버전 행 추가 방식으로 이력 보존 (2026-11-23)';
comment on column pricing_rules.config is 'PricingConfig: 시간당 단가·인건비·1인 최대시간·상한·추가인원 할인·정기 계수·난이도 등급·규모 구간·할증·할인 규칙';
comment on table pricing_calculations is '비용 계산기 결과 (입력·결과·사용 기준 버전)';
