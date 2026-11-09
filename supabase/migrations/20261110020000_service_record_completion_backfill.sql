-- BACKFILL for the service-record completion guarantee.
--
-- Apply AFTER 20261110010000_service_record_completion_guarantee.sql.
-- File-only until applied manually at merge time.
--
-- Scope: every EXISTING appointment already sitting on status 'completed'
-- that has no service record, across all workspaces — the historical book
-- left behind by direct status writes and back-end closeouts that completed
-- appointments without the canonical RPC. Each row is minted by the same
-- ensure function the trigger uses, from the same appointment-held data,
-- with the origin marked 'backfill'.
--
-- Idempotent and re-runnable: appointments that already have a service
-- record are excluded up front, and the ensure function re-checks existence
-- and leans on the (workspace_id, appointment_id) unique constraint, so a
-- second run creates zero rows.

do $$
declare
  v_appointment record;
  v_created integer := 0;
begin
  for v_appointment in
    select a.workspace_id, a.id
      from public.appointments a
     where a.status::text = 'completed'
       and not exists (
         select 1
           from public.service_records sr
          where sr.workspace_id = a.workspace_id
            and sr.appointment_id = a.id
       )
     order by a.workspace_id, a.created_at, a.id
  loop
    if public.ensure_service_record_for_appointment_v1(
         v_appointment.workspace_id,
         v_appointment.id,
         'backfill'
       ) is not null then
      v_created := v_created + 1;
    end if;
  end loop;

  raise notice 'service-record completion backfill: % record(s) ensured', v_created;
end;
$$;
