-- Canonical workspace-scoped inventory foundation.
-- Oil usage remains derived from completed service_records and does not depend on inventory.

alter table public.inventory_items add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.inventory_items add column if not exists is_active boolean not null default true;
create index if not exists inventory_items_workspace_id_idx on public.inventory_items(workspace_id);
create index if not exists inventory_items_workspace_active_idx on public.inventory_items(workspace_id,is_active);

create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  location_type text not null default 'warehouse' check (location_type in ('warehouse','vehicle','other')),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,name)
);

create table if not exists public.inventory_stock (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  location_id uuid not null references public.inventory_locations(id) on delete cascade,
  quantity numeric not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key(inventory_item_id,location_id)
);
create index if not exists inventory_stock_workspace_id_idx on public.inventory_stock(workspace_id);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  location_id uuid references public.inventory_locations(id) on delete set null,
  movement_type text not null check (movement_type in ('receipt','adjustment','transfer_in','transfer_out','reservation','release','consumption','return')),
  quantity numeric not null check (quantity > 0),
  service_record_id uuid references public.service_records(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  reference_id text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists inventory_movements_workspace_created_idx on public.inventory_movements(workspace_id,created_at desc);
create index if not exists inventory_movements_service_record_idx on public.inventory_movements(service_record_id);
create unique index if not exists inventory_movements_reference_unique on public.inventory_movements(workspace_id,reference_id) where reference_id is not null;

create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  location_id uuid references public.inventory_locations(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete cascade,
  quantity numeric not null check (quantity > 0),
  status text not null default 'reserved' check (status in ('reserved','consumed','released','cancelled')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,inventory_item_id,appointment_id,location_id)
);
create index if not exists inventory_reservations_workspace_status_idx on public.inventory_reservations(workspace_id,status);

alter table public.inventory_items enable row level security;
alter table public.inventory_items force row level security;
alter table public.inventory_locations enable row level security;
alter table public.inventory_locations force row level security;
alter table public.inventory_stock enable row level security;
alter table public.inventory_stock force row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_movements force row level security;
alter table public.inventory_reservations enable row level security;
alter table public.inventory_reservations force row level security;

drop policy if exists inventory_items_owner_all on public.inventory_items;
drop policy if exists inventory_items_workspace_select on public.inventory_items;
drop policy if exists inventory_items_workspace_write on public.inventory_items;
create policy inventory_items_workspace_select on public.inventory_items for select using (workspace_id is not null and public.is_workspace_member(workspace_id));
create policy inventory_items_workspace_write on public.inventory_items for all using (workspace_id is not null and public.has_workspace_role(workspace_id,array['owner','admin','manager','service_advisor']::public.member_role[])) with check (workspace_id is not null and public.has_workspace_role(workspace_id,array['owner','admin','manager','service_advisor']::public.member_role[]));

drop policy if exists inventory_locations_select on public.inventory_locations;
drop policy if exists inventory_locations_write on public.inventory_locations;
create policy inventory_locations_select on public.inventory_locations for select using (public.is_workspace_member(workspace_id));
create policy inventory_locations_write on public.inventory_locations for all using (public.has_workspace_role(workspace_id,array['owner','admin','manager','service_advisor']::public.member_role[])) with check (public.has_workspace_role(workspace_id,array['owner','admin','manager','service_advisor']::public.member_role[]));

drop policy if exists inventory_stock_select on public.inventory_stock;
drop policy if exists inventory_stock_write on public.inventory_stock;
create policy inventory_stock_select on public.inventory_stock for select using (public.is_workspace_member(workspace_id));
create policy inventory_stock_write on public.inventory_stock for all using (public.has_workspace_role(workspace_id,array['owner','admin','manager','service_advisor','dispatcher','technician']::public.member_role[])) with check (public.has_workspace_role(workspace_id,array['owner','admin','manager','service_advisor','dispatcher','technician']::public.member_role[]));

drop policy if exists inventory_movements_select on public.inventory_movements;
drop policy if exists inventory_movements_insert on public.inventory_movements;
create policy inventory_movements_select on public.inventory_movements for select using (public.is_workspace_member(workspace_id));
create policy inventory_movements_insert on public.inventory_movements for insert with check (public.has_workspace_role(workspace_id,array['owner','admin','manager','service_advisor','dispatcher','technician']::public.member_role[]));

drop policy if exists inventory_reservations_select on public.inventory_reservations;
drop policy if exists inventory_reservations_write on public.inventory_reservations;
create policy inventory_reservations_select on public.inventory_reservations for select using (public.is_workspace_member(workspace_id));
create policy inventory_reservations_write on public.inventory_reservations for all using (public.has_workspace_role(workspace_id,array['owner','admin','manager','service_advisor','dispatcher','technician']::public.member_role[])) with check (public.has_workspace_role(workspace_id,array['owner','admin','manager','service_advisor','dispatcher','technician']::public.member_role[]));

create or replace function public.set_inventory_item_stock(p_item_id uuid,p_quantity numeric,p_reason text default 'manual adjustment') returns void language plpgsql security invoker set search_path=public as $$
declare v_workspace uuid; v_location uuid; v_before numeric;
begin
  if p_quantity<0 then raise exception 'Quantity cannot be negative'; end if;
  select workspace_id into v_workspace from public.inventory_items where id=p_item_id;
  if v_workspace is null then raise exception 'Inventory item not found'; end if;
  if not public.has_workspace_role(v_workspace,array['owner','admin','manager','service_advisor']::public.member_role[]) then raise exception 'Insufficient inventory role'; end if;
  select id into v_location from public.inventory_locations where workspace_id=v_workspace and location_type='warehouse' and is_active=true order by created_at limit 1;
  if v_location is null then insert into public.inventory_locations(workspace_id,name,location_type) values(v_workspace,'Main Warehouse','warehouse') returning id into v_location; end if;
  select quantity into v_before from public.inventory_stock where inventory_item_id=p_item_id and location_id=v_location for update;
  v_before:=coalesce(v_before,0);
  insert into public.inventory_stock(workspace_id,inventory_item_id,location_id,quantity) values(v_workspace,p_item_id,v_location,p_quantity)
    on conflict(inventory_item_id,location_id) do update set quantity=excluded.quantity,updated_at=now();
  if p_quantity<>v_before then
    insert into public.inventory_movements(workspace_id,inventory_item_id,location_id,movement_type,quantity,notes,created_by,metadata)
    values(v_workspace,p_item_id,v_location,'adjustment',abs(p_quantity-v_before),p_reason,auth.uid(),jsonb_build_object('before',v_before,'after',p_quantity));
  end if;
end $$;

create or replace function public.transfer_inventory_stock(p_item_id uuid,p_to_location_id uuid,p_quantity numeric,p_idempotency_key text) returns void language plpgsql security invoker set search_path=public as $$
declare v_workspace uuid; v_from uuid; v_available numeric; v_existing uuid;
begin
  if p_quantity<=0 then raise exception 'Quantity must be greater than zero'; end if;
  select workspace_id into v_workspace from public.inventory_items where id=p_item_id;
  if v_workspace is null then raise exception 'Inventory item not found'; end if;
  if not public.has_workspace_role(v_workspace,array['owner','admin','manager','service_advisor','dispatcher','technician']::public.member_role[]) then raise exception 'Insufficient inventory role'; end if;
  if not exists(select 1 from public.inventory_locations where id=p_to_location_id and workspace_id=v_workspace and is_active=true) then raise exception 'Destination location not found'; end if;
  select id into v_existing from public.inventory_movements where workspace_id=v_workspace and reference_id=p_idempotency_key limit 1;
  if v_existing is not null then return; end if;
  select id into v_from from public.inventory_locations where workspace_id=v_workspace and location_type='warehouse' and is_active=true order by created_at limit 1;
  if v_from is null then raise exception 'Warehouse location not configured'; end if;
  select quantity into v_available from public.inventory_stock where inventory_item_id=p_item_id and location_id=v_from for update;
  v_available:=coalesce(v_available,0);
  if v_available<p_quantity then raise exception 'Insufficient warehouse stock'; end if;
  update public.inventory_stock set quantity=quantity-p_quantity,updated_at=now() where inventory_item_id=p_item_id and location_id=v_from;
  insert into public.inventory_stock(workspace_id,inventory_item_id,location_id,quantity) values(v_workspace,p_item_id,p_to_location_id,p_quantity)
    on conflict(inventory_item_id,location_id) do update set quantity=public.inventory_stock.quantity+excluded.quantity,updated_at=now();
  insert into public.inventory_movements(workspace_id,inventory_item_id,location_id,movement_type,quantity,reference_id,created_by,metadata)
    values(v_workspace,p_item_id,v_from,'transfer_out',p_quantity,p_idempotency_key,auth.uid(),jsonb_build_object('to_location_id',p_to_location_id));
  insert into public.inventory_movements(workspace_id,inventory_item_id,location_id,movement_type,quantity,created_by,metadata)
    values(v_workspace,p_item_id,p_to_location_id,'transfer_in',p_quantity,auth.uid(),jsonb_build_object('from_location_id',v_from,'transfer_reference',p_idempotency_key));
end $$;
