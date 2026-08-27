begin;

-- assign_dispatch_job_v1 records these two legitimate assignment outcomes.
-- Keep the table contract aligned with the RPC so unassigning or confirming an
-- existing technician cannot fail after the appointment row is locked.
alter table public.dispatch_events
  drop constraint if exists dispatch_events_event_type_check;

alter table public.dispatch_events
  add constraint dispatch_events_event_type_check
  check (event_type in (
    'assigned',
    'reassigned',
    'assignment_confirmed',
    'unassigned',
    'status_changed',
    'en_route',
    'arrived',
    'started',
    'paused',
    'completed',
    'cancelled',
    'note'
  ));

commit;
