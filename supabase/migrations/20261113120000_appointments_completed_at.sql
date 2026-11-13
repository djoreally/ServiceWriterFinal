-- SW-87 (SW-23 follow-up): appointments.completed_at — the server
-- home for the tech app's completion stamp.
--
-- The tech app (lovable-tech-partner, schema v5) stamps
-- jobs.completed_at on-device at Complete Job and pushes it with the
-- job change set, but the server had nowhere to keep it: the sync
-- push read only the job's status, technician_transition_job_v2
-- stamps appointments with the SERVER's now() (status +
-- dispatch_status + updated_at), and the appointment record itself
-- carried no completion time — so the device's actual finish time
-- (the SW-23 Time page's accountability record) lived only on the
-- phone that did the job, and a fresh device pulled nothing back.
--
-- Expand-only: one nullable column, no changes to existing columns,
-- constraints, or functions. The currently live code ignores the
-- column until the sync handlers in this change read/write it.
--
-- Backfill: appointments already completed before this column
-- existed get their updated_at as the stamp — the same convention
-- the sync pull already uses for inspection reports ("a completed
-- report's updated_at is the completion stamp"). Rows completed
-- through the tech app from now on carry the device's exact stamp,
-- written by the sync push (first stamp wins).

alter table public.appointments
  add column if not exists completed_at timestamptz;

comment on column public.appointments.completed_at is
  'When the job was completed, as stamped on the technician''s device (tech app jobs.completed_at, via sync push). First stamp wins; falls back to updated_at in the sync pull for rows completed before this column existed.';

update public.appointments
set completed_at = updated_at
where completed_at is null
  and status = 'completed'
  and updated_at is not null;
