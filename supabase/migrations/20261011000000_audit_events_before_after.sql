-- Audit trail: before/after snapshots for entity mutations.
-- Lets operators answer "who changed what, when, from what to what"
-- by diffing before_data -> after_data on a single audit_events row.

alter table public.audit_events
  add column if not exists before_data jsonb;

alter table public.audit_events
  add column if not exists after_data jsonb;

comment on column public.audit_events.before_data is
  'Entity snapshot before the mutation; null for creates.';
comment on column public.audit_events.after_data is
  'Entity snapshot after the mutation; null for deletes.';
