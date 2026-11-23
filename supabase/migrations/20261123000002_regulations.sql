-- 2026-11-23: 회사 규정(전자법령 스타일) — 규정 본문·개정 이력·열람 기록.
--
--   regulations          규정 1건 = 1행 (코드 HR-01 / OP-01 / CP-01 …, 분류, 공개범위, 현재 발행 버전)
--   regulation_versions  본문은 버전 단위로 보관. draft 1건을 편집하다가 "발행"하면 published 로 바뀌고
--                        regulations.current_version_id 가 그 버전을 가리킨다. 다음 편집은 새 draft 를 만든다.
--                        → 개정 이력·신구조문 대비표를 버전 비교로 만든다.
--   regulation_views     누가 언제 어느 버전을 열람했는지 (직원 안내 증빙용, 동의 서명 아님)
--
--   접근은 서버(service role)만 — RLS 켜고 정책은 두지 않는다 (anon 차단).
--   두 번 실행해도 안전하도록 if not exists 를 쓴다.

create table if not exists regulations (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique check (code ~ '^[A-Z]{2,4}-[0-9]{2,3}$'),
  title               text not null check (char_length(title) <= 120),
  category            text not null check (category in ('legal_hr', 'sop', 'customer_policy')),
  visibility          text not null default 'admin' check (visibility in ('admin', 'worker', 'customer', 'public')),
  summary             text check (summary is null or char_length(summary) <= 200),
  status              text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  current_version_id  uuid,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create table if not exists regulation_versions (
  id              uuid primary key default gen_random_uuid(),
  regulation_id   uuid not null references regulations(id) on delete cascade,
  version_no      integer not null check (version_no >= 1),
  html_body       text not null default '',
  change_summary  text check (change_summary is null or char_length(change_summary) <= 500),
  effective_date  date,
  status          text not null default 'draft' check (status in ('draft', 'published')),
  published_at    timestamptz,
  published_by    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (regulation_id, version_no)
);

create table if not exists regulation_views (
  id              uuid primary key default gen_random_uuid(),
  regulation_id   uuid not null references regulations(id) on delete cascade,
  version_id      uuid references regulation_versions(id) on delete set null,
  viewer_user_id  text,
  viewer_role     text,
  viewed_at       timestamptz not null default now()
);

-- current_version_id → regulation_versions (순환 참조라 테이블 생성 후 추가)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'regulations_current_version_fk'
  ) then
    alter table regulations
      add constraint regulations_current_version_fk
      foreign key (current_version_id) references regulation_versions(id) on delete set null;
  end if;
end $$;

-- 규정당 draft 는 1건만
create unique index if not exists uq_regulation_versions_single_draft
  on regulation_versions (regulation_id) where status = 'draft';

create index if not exists idx_regulations_category_order
  on regulations (category, sort_order, code) where deleted_at is null;
create index if not exists idx_regulation_versions_reg_no
  on regulation_versions (regulation_id, version_no desc);
create index if not exists idx_regulation_views_reg_time
  on regulation_views (regulation_id, viewed_at desc);

-- updated_at 자동 갱신 (기존 공용 함수 재사용)
drop trigger if exists update_regulations_updated_at on regulations;
create trigger update_regulations_updated_at
  before update on regulations for each row execute function update_updated_at_column();
drop trigger if exists update_regulation_versions_updated_at on regulation_versions;
create trigger update_regulation_versions_updated_at
  before update on regulation_versions for each row execute function update_updated_at_column();

alter table regulations         enable row level security;
alter table regulation_versions enable row level security;
alter table regulation_views    enable row level security;

comment on table regulations is '회사 규정 (전자법령 스타일). 코드·분류·공개범위·현재 발행 버전 (2026-11-23)';
comment on column regulations.category   is 'legal_hr(법정·인사) | sop(운영 규정) | customer_policy(고객 약관·정책)';
comment on column regulations.visibility is 'admin(관리자만) | worker(직원 포털) | customer(고객 포털) | public(외부 공개)';
comment on column regulations.status     is 'draft(미발행) | active(시행 중) | retired(폐지)';
comment on table regulation_versions is '규정 본문 버전. draft 1건 편집 → 발행(published) → 다음 편집은 새 draft';
comment on column regulation_versions.html_body is '본문 HTML 조각. 조 = <p><strong>제N조 (제목)</strong></p>, {{시행일}} 은 effective_date 로 치환';
comment on table regulation_views is '규정 열람 기록 (직원·고객 안내 증빙, 동의 서명 아님)';
