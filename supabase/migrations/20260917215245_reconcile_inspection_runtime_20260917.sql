alter table public.service_catalog add column if not exists inspection_template_id uuid null references public.inspection_templates(id) on delete set null;
create index if not exists service_catalog_inspection_template_idx on public.service_catalog(workspace_id,inspection_template_id) where inspection_template_id is not null;

create table if not exists public.service_inspections (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null,
 service_id uuid null references public.service_records(id) on delete set null,
 vehicle_id uuid null references public.vehicles(id) on delete set null,
 appointment_id uuid null references public.appointments(id) on delete cascade,
 template_id uuid not null references public.inspection_templates(id) on delete restrict,
 template_name text not null,
 inspector_name text null,
 notes text null,
 status text not null default 'completed' check (status in ('draft','completed','cancelled')),
 inspection_date timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists service_inspections_workspace_appointment_idx on public.service_inspections(workspace_id,appointment_id,inspection_date desc);
create index if not exists service_inspections_workspace_vehicle_idx on public.service_inspections(workspace_id,vehicle_id,inspection_date desc);
create unique index if not exists service_inspections_one_completed_template_per_appointment_idx on public.service_inspections(workspace_id,appointment_id,template_id) where status='completed' and appointment_id is not null;

create table if not exists public.inspection_results (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 inspection_id uuid not null references public.service_inspections(id) on delete cascade,
 item_name text not null,
 item_category text null,
 status text not null check (status in ('pass','fail','warning','not_applicable','not_checked')),
 notes text null,
 sort_order integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists inspection_results_workspace_inspection_idx on public.inspection_results(workspace_id,inspection_id,sort_order);

alter table public.service_inspections enable row level security;
alter table public.inspection_results enable row level security;

drop policy if exists service_inspections_staff_select on public.service_inspections;
create policy service_inspections_staff_select on public.service_inspections for select to authenticated using (public.is_workspace_staff(workspace_id));
drop policy if exists service_inspections_staff_insert on public.service_inspections;
create policy service_inspections_staff_insert on public.service_inspections for insert to authenticated with check (public.is_workspace_writer(workspace_id) and user_id=(select auth.uid()));
drop policy if exists service_inspections_staff_update on public.service_inspections;
create policy service_inspections_staff_update on public.service_inspections for update to authenticated using (public.is_workspace_writer(workspace_id)) with check (public.is_workspace_writer(workspace_id));
drop policy if exists service_inspections_staff_delete on public.service_inspections;
create policy service_inspections_staff_delete on public.service_inspections for delete to authenticated using (public.is_workspace_writer(workspace_id));

drop policy if exists inspection_results_staff_select on public.inspection_results;
create policy inspection_results_staff_select on public.inspection_results for select to authenticated using (public.is_workspace_staff(workspace_id));
drop policy if exists inspection_results_staff_insert on public.inspection_results;
create policy inspection_results_staff_insert on public.inspection_results for insert to authenticated with check (public.is_workspace_writer(workspace_id) and exists(select 1 from public.service_inspections si where si.id=inspection_id and si.workspace_id=inspection_results.workspace_id));
drop policy if exists inspection_results_staff_update on public.inspection_results;
create policy inspection_results_staff_update on public.inspection_results for update to authenticated using (public.is_workspace_writer(workspace_id)) with check (public.is_workspace_writer(workspace_id));
drop policy if exists inspection_results_staff_delete on public.inspection_results;
create policy inspection_results_staff_delete on public.inspection_results for delete to authenticated using (public.is_workspace_writer(workspace_id));
