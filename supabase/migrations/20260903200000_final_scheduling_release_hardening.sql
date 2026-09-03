-- Final scheduling release hardening.
-- Public blackout lookup is keyed by booking slug so one owner with multiple
-- workspaces cannot leak blackout dates across booking pages.

create or replace function public.get_public_blocked_dates_v2(
  p_booking_slug text
)
returns table(blocked_date date, reason text)
language sql
stable
security definer
set search_path = public
as $$
  select b.blocked_date, b.reason
  from public.workspace_settings ws
  join public.workspaces w on w.id = ws.workspace_id
  join public.workspace_blackout_dates b on b.workspace_id = ws.workspace_id
  where lower(ws.booking_slug::text) = lower(trim(p_booking_slug))
    and w.is_active
    and ws.booking_enabled
  order by b.blocked_date;
$$;

revoke all on function public.get_public_blocked_dates_v2(text) from public;
grant execute on function public.get_public_blocked_dates_v2(text) to anon, authenticated, service_role;

-- Older installations may still have retired scheduling tables. Backfill only
-- when there is exactly one active workspace for the legacy owner, which avoids
-- inventing a workspace association when ownership is ambiguous.
do $$
begin
  if to_regclass('public.blocked_dates') is not null then
    execute $sql$
      insert into public.workspace_blackout_dates (workspace_id, blocked_date, reason, created_by)
      select w.id, b.blocked_date, b.reason, b.user_id
      from public.blocked_dates b
      join public.workspaces w on w.created_by = b.user_id and w.is_active
      where (select count(*) from public.workspaces w2 where w2.created_by = b.user_id and w2.is_active) = 1
      on conflict (workspace_id, blocked_date) do nothing
    $sql$;
  end if;

  if to_regclass('public.intake_questions') is not null then
    execute $sql$
      insert into public.workspace_intake_questions
        (workspace_id, question_text, question_type, options, is_required, sort_order, is_active, created_by)
      select w.id, q.question_text, q.question_type, to_jsonb(q.options),
             coalesce(q.is_required, false), coalesce(q.sort_order, 0),
             coalesce(q.is_active, true), q.user_id
      from public.intake_questions q
      join public.workspaces w on w.created_by = q.user_id and w.is_active
      where (select count(*) from public.workspaces w2 where w2.created_by = q.user_id and w2.is_active) = 1
    $sql$;
  end if;
end;
$$;
