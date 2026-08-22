begin;

alter table public.audit_events
  add column if not exists correlation_id text,
  add column if not exists request_id text;

create index if not exists audit_events_workspace_created_idx
  on public.audit_events (workspace_id, created_at desc);

create index if not exists audit_events_correlation_idx
  on public.audit_events (correlation_id)
  where correlation_id is not null;

create index if not exists audit_events_request_idx
  on public.audit_events (request_id)
  where request_id is not null;

comment on column public.audit_events.correlation_id is 'Request or workflow correlation identifier; must not contain PII or secrets.';
comment on column public.audit_events.request_id is 'Provider/request identifier for operational tracing; must not contain credentials.';

commit;
