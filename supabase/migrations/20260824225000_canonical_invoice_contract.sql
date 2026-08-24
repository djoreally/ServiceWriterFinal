alter table public.invoices
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.invoice_lines
  add column if not exists vehicle_id uuid,
  add column if not exists service_catalog_id uuid,
  add column if not exists sort_order integer not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.invoice_lines
  drop constraint if exists invoice_lines_workspace_vehicle_fkey;
alter table public.invoice_lines
  add constraint invoice_lines_workspace_vehicle_fkey
  foreign key (workspace_id, vehicle_id)
  references public.vehicles(workspace_id, id)
  on delete set null;

alter table public.invoice_lines
  drop constraint if exists invoice_lines_workspace_service_fkey;
alter table public.invoice_lines
  add constraint invoice_lines_workspace_service_fkey
  foreign key (workspace_id, service_catalog_id)
  references public.service_catalog(workspace_id, id)
  on delete set null;

create index if not exists invoice_lines_workspace_vehicle_idx
  on public.invoice_lines(workspace_id, vehicle_id) where vehicle_id is not null;
create index if not exists invoice_lines_workspace_service_idx
  on public.invoice_lines(workspace_id, service_catalog_id) where service_catalog_id is not null;

create or replace function public.assign_invoice_number_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.invoice_number is null or new.invoice_number <= 0 then
    perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text, 0));
    select coalesce(max(i.invoice_number), 0) + 1
      into new.invoice_number
    from public.invoices i
    where i.workspace_id = new.workspace_id;
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_assign_number_v1 on public.invoices;
create trigger invoices_assign_number_v1
before insert on public.invoices
for each row execute function public.assign_invoice_number_v1();
