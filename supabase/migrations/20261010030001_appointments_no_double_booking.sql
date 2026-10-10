-- Double-booking race fix (forensic audit 2026-10-10, item 4).
--
-- bookAppointmentCore checks for conflicts with a SELECT and then INSERTs --
-- two concurrent bookings for overlapping slots both pass the check. This
-- exclusion constraint makes overlapping appointments for the same workspace
-- impossible at the database level, regardless of which code path inserts.
-- The application-level buffer check in book-appointment.ts still runs first
-- (it enforces per-booking buffers, which the constraint cannot express);
-- the constraint is the backstop that serializes the check-and-insert.
--
-- Semantics mirror the application check exactly:
--   * scoped per workspace_id
--   * half-open ranges: back-to-back appointments (end == start) do NOT overlap
--   * cancelled / no_show appointments never block a slot
--
-- NOTE: if production holds legacy overlapping appointments, this migration
-- will fail until they are resolved. Check first with:
--   select a1.id, a2.id from appointments a1 join appointments a2
--     on a1.workspace_id = a2.workspace_id and a1.id < a2.id
--    and tstzrange(a1.starts_at, a1.ends_at, '[)') && tstzrange(a2.starts_at, a2.ends_at, '[)')
--   where a1.status not in ('cancelled','no_show') and a2.status not in ('cancelled','no_show');

create extension if not exists btree_gist;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'appointments' and column_name = 'starts_at')
     and exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'appointments' and column_name = 'ends_at')
     and exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'appointments' and column_name = 'workspace_id') then
    if not exists (select 1 from pg_constraint where conname = 'appointments_no_double_booking') then
      alter table public.appointments
        add constraint appointments_no_double_booking
        exclude using gist (
          workspace_id with =,
          tstzrange(starts_at, ends_at, '[)') with &&
        )
        where (status::text not in ('cancelled', 'no_show'));
    end if;
  else
    raise notice 'appointments_no_double_booking skipped: starts_at/ends_at/workspace_id columns missing';
  end if;
end
$$;
