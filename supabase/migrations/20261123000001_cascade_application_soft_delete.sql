-- 2026-11-23: 신청서(service_applications) 삭제 표시/복구 시 연결된 일정(service_schedules)도 함께 처리.
-- 배경: 일부 경로(고객 일시정지, 일정 재생성, 고객 정보 수정)가 신청서만 삭제 표시해
--       고객 포털·작업자 화면에 유령 일정이 남는 문제 (아웃백 중동롯데점 11/23 건).
--       프로덕션에는 MCP apply_migration 으로 동일 내용 적용 완료 (2026-11-23).
create or replace function public.trg_cascade_application_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    -- 삭제 표시: 살아있는 일정만 같은 시각으로 삭제 표시
    update public.service_schedules
       set deleted_at = new.deleted_at
     where application_id = new.id
       and deleted_at is null;
  elsif new.deleted_at is null and old.deleted_at is not null then
    -- 복구: 신청서와 같은 시각에 삭제 표시된 일정만 되살림 (별도로 지운 일정은 유지)
    update public.service_schedules
       set deleted_at = null
     where application_id = new.id
       and deleted_at = old.deleted_at;
  end if;
  return new;
end;
$$;

drop trigger if exists sa_cascade_soft_delete on public.service_applications;
create trigger sa_cascade_soft_delete
  after update of deleted_at on public.service_applications
  for each row
  execute function public.trg_cascade_application_soft_delete();

comment on trigger sa_cascade_soft_delete on public.service_applications is
  '신청서 삭제 표시/복구 시 service_schedules.deleted_at 동기화 (2026-11-23)';
