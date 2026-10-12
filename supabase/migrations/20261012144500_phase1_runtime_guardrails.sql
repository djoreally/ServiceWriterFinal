-- Phase 1 runtime guardrails discovered while certifying the MOMS location backfill.
--
-- 1. Prevent appointment -> invoice synchronization from recursively re-entering
--    when sync_appointment_invoice_v1 writes canonical financial metadata back to
--    the appointment row.
-- 2. Ignore location-only metadata changes because they do not affect invoice
--    totals and should not rebuild invoice lines.
-- 3. Scope the double-booking trigger to actual scheduling changes.
-- 4. Harden trigger-only and superseded public functions.

create or replace function public.appointments_sync_invoice_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.customer_id is not distinct from new.customer_id
     and old.vehicle_id is not distinct from new.vehicle_id
     and old.starts_at is not distinct from new.starts_at
     and old.status is not distinct from new.status
     and (
       coalesce(old.metadata, '{}'::jsonb)
         - 'location_backfill'
         - 'location_address'
         - 'location_lat'
         - 'location_lng'
         - 'dispatch_notes'
     ) is not distinct from (
       coalesce(new.metadata, '{}'::jsonb)
         - 'location_backfill'
         - 'location_address'
         - 'location_lat'
         - 'location_lng'
         - 'dispatch_notes'
     )
  then
    return new;
  end if;

  perform public.sync_appointment_invoice_v1(new.id);
  return new;
end;
$$;

revoke all on function public.appointments_sync_invoice_trigger_v1() from public, anon, authenticated;

alter function public.prevent_double_booking() set search_path = '';
revoke all on function public.prevent_double_booking() from public, anon, authenticated;

drop trigger if exists trg_prevent_double_booking on public.appointments;
create trigger trg_prevent_double_booking
before insert or update of workspace_id, starts_at, ends_at, status
on public.appointments
for each row execute function public.prevent_double_booking();

-- The original updater is not identity-bound. Runtime code uses v2, which
-- requires booking slug + customer email + phone before mutating an appointment.
revoke all on function public.public_booking_update_appointment_context(
  text, uuid, text, text, numeric, numeric
) from public, anon, authenticated;
