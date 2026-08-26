begin;

create table if not exists public.lifecycle_event_outbox (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_key text not null,
  entity_type text not null check (entity_type in ('appointment', 'quote', 'invoice', 'payment', 'work_order', 'service_record', 'invitation', 'subscription', 'platform')),
  entity_id uuid not null,
  recipient_email citext,
  recipient_role text not null default 'customer',
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'dead_letter', 'canceled')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, idempotency_key),
  check (recipient_email is not null or recipient_role <> 'customer')
);

create index if not exists lifecycle_event_outbox_ready_idx
  on public.lifecycle_event_outbox(status, available_at, created_at)
  where status in ('pending', 'failed');
create index if not exists lifecycle_event_outbox_entity_idx
  on public.lifecycle_event_outbox(workspace_id, entity_type, entity_id, created_at desc);

create or replace function public.enqueue_lifecycle_event(
  p_workspace_id uuid,
  p_event_key text,
  p_entity_type text,
  p_entity_id uuid,
  p_idempotency_key text,
  p_recipient_email citext default null,
  p_recipient_role text default 'customer',
  p_payload jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  result_id uuid;
begin
  if p_workspace_id is null or p_event_key is null or p_entity_type is null or p_entity_id is null or p_idempotency_key is null then
    raise exception 'lifecycle event requires workspace, key, entity, and idempotency key';
  end if;

  insert into public.lifecycle_event_outbox(
    workspace_id, event_key, entity_type, entity_id, idempotency_key,
    recipient_email, recipient_role, payload
  ) values (
    p_workspace_id, p_event_key, p_entity_type, p_entity_id, p_idempotency_key,
    lower(nullif(trim(p_recipient_email::text), ''))::citext, p_recipient_role, coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (workspace_id, idempotency_key) do update
    set payload = excluded.payload,
        recipient_email = coalesce(excluded.recipient_email, lifecycle_event_outbox.recipient_email),
        updated_at = timezone('utc', now())
  returning id into result_id;

  return result_id;
end;
$$;

create or replace function public.claim_lifecycle_events(
  p_limit integer default 50,
  p_worker_id text default null
) returns setof public.lifecycle_event_outbox
language plpgsql security definer set search_path = public
as $$
declare
  worker text := coalesce(nullif(trim(p_worker_id), ''), gen_random_uuid()::text);
begin
  return query
  with candidates as (
    select id
    from public.lifecycle_event_outbox
    where (status in ('pending', 'failed') and available_at <= timezone('utc', now()))
       or (status = 'processing' and locked_at < timezone('utc', now()) - interval '10 minutes')
    order by created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ), claimed as (
    update public.lifecycle_event_outbox e
    set status = 'processing',
        attempts = e.attempts + 1,
        locked_at = timezone('utc', now()),
        locked_by = worker,
        updated_at = timezone('utc', now())
    from candidates c
    where e.id = c.id
    returning e.*
  )
  select * from claimed;
end;
$$;

create or replace function public.complete_lifecycle_event(
  p_id uuid,
  p_worker_id text,
  p_sent boolean,
  p_error text default null,
  p_retry_seconds integer default 300
) returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  update public.lifecycle_event_outbox
  set status = case when p_sent then 'sent' when attempts >= 8 then 'dead_letter' else 'failed' end,
      last_error = case when p_sent then null else left(coalesce(p_error, 'delivery failed'), 1000) end,
      available_at = case when p_sent then available_at else timezone('utc', now()) + make_interval(secs => greatest(30, least(coalesce(p_retry_seconds, 300), 86400))) end,
      sent_at = case when p_sent then timezone('utc', now()) else sent_at end,
      locked_at = null,
      locked_by = null,
      updated_at = timezone('utc', now())
  where id = p_id and status = 'processing' and locked_by = p_worker_id;
  return found;
end;
$$;

create or replace function public.set_updated_at() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

drop trigger if exists lifecycle_event_outbox_set_updated_at on public.lifecycle_event_outbox;
create trigger lifecycle_event_outbox_set_updated_at before update on public.lifecycle_event_outbox for each row execute function public.set_updated_at();

alter table public.lifecycle_event_outbox enable row level security;
revoke all on public.lifecycle_event_outbox from anon, authenticated;
grant select, insert, update, delete on public.lifecycle_event_outbox to service_role;
grant execute on function public.enqueue_lifecycle_event(uuid, text, text, uuid, text, citext, text, jsonb) to service_role;
grant execute on function public.claim_lifecycle_events(integer, text) to service_role;
grant execute on function public.complete_lifecycle_event(uuid, text, boolean, text, integer) to service_role;

commit;
