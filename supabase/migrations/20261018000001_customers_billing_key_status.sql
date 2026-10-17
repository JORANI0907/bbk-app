-- Phase I.1 (2026-10-18): 정기엔드케어 빌링키 자동결제 — customers 테이블 상태 추적 컬럼 추가
--
-- 기존 재사용 컬럼:
--   billing_key              : PortOne 빌링키 토큰
--   billing_portone_id       : PortOne customerKey (고객 식별자)
--   billing_card_url         : 카드 등록 페이지 URL (토큰 저장용으로 재사용)
--   billing_last_billed_at   : 마지막 자동결제 성공 시각
--   payment_status_detail    : 결제 실패 사유 메모
--
-- 신규 컬럼:
--   billing_key_status       : 상태머신 — 'none' | 'pending' | 'active' | 'expired' | 'failed'
--   billing_key_card_name    : 마스킹 표시용 ("국민카드 1234")
--   billing_key_issued_at    : 카드 등록 완료 시각

alter table customers
  add column if not exists billing_key_status    text default 'none',
  add column if not exists billing_key_card_name text,
  add column if not exists billing_key_issued_at timestamptz;

alter table customers
  add constraint customers_billing_key_status_check
  check (billing_key_status in ('none', 'pending', 'active', 'expired', 'failed'));

-- 매월 cron 이 active 고객만 스캔하도록 부분 인덱스
create index if not exists idx_customers_billing_key_active
  on customers (billing_key_status)
  where billing_key_status = 'active';

comment on column customers.billing_key_status is '빌링키 상태: none(미등록) | pending(링크발송·대기) | active(활성) | expired(만료) | failed(결제실패)';
comment on column customers.billing_key_card_name is '마스킹된 카드 표시명 (예: "국민카드 1234")';
comment on column customers.billing_key_issued_at is '빌링키 발급 완료 시각 (PortOne 응답 수신 시점)';
