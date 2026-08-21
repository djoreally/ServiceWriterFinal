begin;

create table if not exists public.service_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete restrict,
  work_order_id uuid references public.work_orders(id) on delete set null,
  technician_id uuid,
  completed_by uuid references auth.users(id) on delete set null,
  status text not null default 'completed' check (status in ('draft', 'in_progress', 'completed', 'voided')),
  complaint text,
  diagnosis text,
  work_performed text,
  oil_quarts_used numeric(10,2) check (oil_quarts_used is null or oil_quarts_used >= 0),
  customer_notes text,
  internal_notes text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_records_workspace_appointment_key unique (workspace_id, appointment_id),
  constraint service_records_time_order check (completed_at is null or started_at is null or completed_at >= started_at)
);

create table if not exists public.dispatch_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete cascade,
  technician_id uuid,
  event_type text not null check (event_type in ('assigned', 'reassigned', 'status_changed', 'en_route', 'arrived', 'started', 'paused', 'completed', 'cancelled', 'note')),
  previous_status text,
  new_status text,
  location jsonb,
  notes text,
  performed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint dispatch_events_target_check check (appointment_id is not null or work_order_id is not null)
);

create index if not exists service_records_workspace_completed_idx
  on public.service_records (workspace_id, completed_at desc);
create index if not exists service_records_workspace_work_order_idx
  on public.service_records (workspace_id, work_order_id);
create index if not exists dispatch_events_workspace_created_idx
  on public.dispatch_events (workspace_id, created_at desc);
create index if not exists dispatch_events_workspace_appointment_idx
  on public.dispatch_events (workspace_id, appointment_id, created_at desc);
create index if not exists dispatch_events_workspace_work_order_idx
  on public.dispatch_events (workspace_id, work_order_id, created_at desc);

alter table public.service_records enable row level security;
alter table public.dispatch_events enable row level security;

 drop policy if exists service_records_staff_all on public.service_records;
create policy service_records_staff_all on public.service_records
  for all using (public.is_workspace_staff(workspace_id))
  with check (public.is_workspace_staff(workspace_id));

 drop policy if exists dispatch_events_staff_all on public.dispatch_events;
create policy dispatch_events_staff_all on public.dispatch_events
  for all using (public.is_workspace_staff(workspace_id))
  with check (public.is_workspace_staff(workspace_id));

create or replace function public.touch_service_records_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists service_records_touch_updated_at on public.service_records;
create trigger service_records_touch_updated_at
before update on public.service_records
for each row execute function public.touch_service_records_updated_at();

commit;
