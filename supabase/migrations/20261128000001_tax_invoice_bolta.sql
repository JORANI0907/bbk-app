-- 2026-11-28: 볼타(Bolta) 전자세금계산서 API 발행 추적
-- 계획: docs/plans/tax-invoice-automation-plan.md 5장
--
-- 1) tax_invoice_drafts: 발행 요청·결과 추적 컬럼
-- 2) tax_invoice_events: 볼타 웹훅 원본 저장 (멱등 처리)
-- 3) tax_invoice_certificates: 공동인증서 만료 추적 (3단계 알림용)

alter table public.tax_invoice_drafts
  add column if not exists issue_status text not null default 'draft',
  add column if not exists issue_attempts integer not null default 0,
  add column if not exists client_reference_id text,
  add column if not exists bolta_issuance_key text,
  add column if not exists tax_invoice_url text,
  add column if not exists requested_at timestamptz,
  add column if not exists issued_at timestamptz,
  add column if not exists failure_code text,
  add column if not exists failure_message text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tax_invoice_drafts_issue_status_check') then
    alter table public.tax_invoice_drafts
      add constraint tax_invoice_drafts_issue_status_check
      check (issue_status in ('draft', 'requested', 'issued', 'failed'));
  end if;
end $$;

create unique index if not exists tax_invoice_drafts_client_reference_id_key
  on public.tax_invoice_drafts (client_reference_id)
  where client_reference_id is not null;

create unique index if not exists tax_invoice_drafts_bolta_issuance_key_key
  on public.tax_invoice_drafts (bolta_issuance_key)
  where bolta_issuance_key is not null;

create index if not exists idx_tax_invoice_drafts_issue_status
  on public.tax_invoice_drafts (issue_status)
  where issue_status in ('requested', 'failed');

-- ── 웹훅 이벤트 원본 ─────────────────────────────────────────
create table if not exists public.tax_invoice_events (
  id uuid primary key default gen_random_uuid(),
  webhook_id text not null unique,
  event_type text not null,
  issuance_key text,
  draft_id uuid references public.tax_invoice_drafts(id) on delete set null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

create index if not exists idx_tax_invoice_events_issuance_key
  on public.tax_invoice_events (issuance_key);

alter table public.tax_invoice_events enable row level security;

-- ── 공동인증서 만료 추적 ──────────────────────────────────────
create table if not exists public.tax_invoice_certificates (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  issuer text,
  expires_at date not null,
  registered_to text not null default 'bolta',
  notified_d30_at timestamptz,
  notified_d7_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tax_invoice_certificates enable row level security;

comment on column public.tax_invoice_drafts.issue_status is 'draft 초안 / requested 볼타 요청됨 / issued 발행완료 / failed 실패';
comment on column public.tax_invoice_drafts.client_reference_id is '볼타 Bolta-Client-Reference-Id (bbk-{source}-{source_id}-{attempt}). 한 번 쓴 값 재사용 불가';
comment on column public.tax_invoice_drafts.bolta_issuance_key is '볼타 issuanceKey. 웹훅 매칭 키';
