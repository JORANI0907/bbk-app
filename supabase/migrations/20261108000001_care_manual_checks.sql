-- 2026-11-08: 케어매뉴얼 품목 점검 기록 — 직원이 현장에서 품목별 "완료 / 특이사항"을 남긴다.
--
--   item_id 는 customers.care_manual(JSON) 안 품목 id. 품목이 지워져도 기록은 남긴다(이력).
--   상태 색(정상/확인필요/특이사항)은 저장하지 않고 앱에서 빈도 × checked_at 으로 계산한다.
--   접근은 서버(service role)만 — RLS 켜고 정책은 두지 않는다 (anon 차단).
--   두 번 실행해도 안전하도록 제약은 create table 안에 둔다.

create table if not exists care_manual_checks (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references customers(id) on delete cascade,
  item_id        text not null check (char_length(item_id) <= 64),
  zone_id        text check (zone_id is null or char_length(zone_id) <= 64),
  status         text not null default 'ok' check (status in ('ok', 'issue')),
  memo           text check (memo is null or char_length(memo) <= 500),
  photo_url      text,
  worker_user_id text,
  worker_name    text,
  checked_at     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

-- 고객별 최신 기록 조회가 대부분 → (customer_id, checked_at desc)
create index if not exists idx_care_manual_checks_customer_time
  on care_manual_checks (customer_id, checked_at desc);

alter table care_manual_checks enable row level security;

comment on table  care_manual_checks is '케어매뉴얼 품목 점검 기록. 직원이 완료/특이사항을 남기면 고객 공간 보기의 표시 색이 바뀐다 (2026-11-08)';
comment on column care_manual_checks.item_id is 'customers.care_manual JSON 안 품목(items[].id)';
comment on column care_manual_checks.status  is 'ok(완료) | issue(특이사항)';
