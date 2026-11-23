-- 2026-11-23: 편집본 검토 메모 — 원고 작성 시 남긴 "노무사 확인·사장님 결정" 항목을 편집 화면에서 바로 본다.
--   프로덕션에는 MCP apply_migration 으로 동일 내용 적용 완료 (2026-11-23).
alter table regulation_versions add column if not exists review_notes text;
comment on column regulation_versions.review_notes is '편집본 검토 메모 (확인 필요 항목). 발행 후에도 그 판의 기록으로 남는다';
