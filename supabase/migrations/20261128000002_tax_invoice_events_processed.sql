-- 2026-11-28: 볼타 웹훅 이벤트 처리 완료 시각
-- 기록(insert)과 처리(상태 갱신·알림)를 분리해, 처리 중 실패한 이벤트는 재전송 시 다시 처리한다.
alter table public.tax_invoice_events
  add column if not exists processed_at timestamptz;

create index if not exists idx_tax_invoice_events_unprocessed
  on public.tax_invoice_events (received_at)
  where processed_at is null;
