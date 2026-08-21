begin;

-- Quote conversion is workspace-owned. The live project currently has quotes
-- and service_records, but not the old quote_items/services/inventory_items tables.
-- Create the canonical quote-items source table before applying ownership.
create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  description text not null check (length(btrim(description)) between 1 and 500),
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  total_price numeric(12,2) not null default 0 check (total_price >= 0),
  inventory_item_id uuid,
  created_at timestamptz not null default now()
);

alter table public.quotes add column if not exists workspace_id uuid;
alter table public.quote_items add column if not exists workspace_id uuid;

update public.quotes q
set workspace_id = (
  select w.id
  from public.workspaces w
  where w.created_by = q.created_by
  order by w.created_at asc
  limit 1
)
where q.workspace_id is null;

update public.quote_items qi
set workspace_id = q.workspace_id
from public.quotes q
where q.id = qi.quote_id
  and qi.workspace_id is null;

do $$
begin
  if exists (select 1 from public.quotes where workspace_id is null)
     or exists (select 1 from public.quote_items where workspace_id is null) then
    raise exception 'quote_workspace_backfill_incomplete';
  end if;
end $$;

alter table public.quotes alter column workspace_id set not null;
alter table public.quote_items alter column workspace_id set not null;

alter table public.quotes
  drop constraint if exists quotes_workspace_id_fkey;
alter table public.quotes
  add constraint quotes_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id);

alter table public.quote_items
  drop constraint if exists quote_items_workspace_id_fkey;
alter table public.quote_items
  add constraint quote_items_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id);

create unique index if not exists quotes_workspace_id_id_uidx
  on public.quotes(workspace_id, id);
create unique index if not exists quote_items_workspace_id_id_uidx
  on public.quote_items(workspace_id, id);
create index if not exists quotes_workspace_status_updated_idx
  on public.quotes(workspace_id, status, updated_at desc);
create index if not exists quote_items_workspace_quote_idx
  on public.quote_items(workspace_id, quote_id);

alter table public.quote_items enable row level security;
drop policy if exists quote_items_member_select on public.quote_items;
create policy quote_items_member_select
on public.quote_items for select to authenticated
using (exists (
  select 1 from public.workspace_members wm
  where wm.workspace_id = quote_items.workspace_id
    and wm.user_id = auth.uid() and wm.is_active
));
drop policy if exists quote_items_operator_write on public.quote_items;
create policy quote_items_operator_write
on public.quote_items for all to authenticated
using (exists (
  select 1 from public.workspace_members wm
  where wm.workspace_id = quote_items.workspace_id
    and wm.user_id = auth.uid() and wm.is_active
    and wm.role::text = any (array['owner','admin','manager','service_advisor'])
))
with check (exists (
  select 1 from public.workspace_members wm
  where wm.workspace_id = quote_items.workspace_id
    and wm.user_id = auth.uid() and wm.is_active
    and wm.role::text = any (array['owner','admin','manager','service_advisor'])
));

alter table public.service_records
  add column if not exists quote_id uuid,
  add column if not exists subtotal numeric(12,2),
  add column if not exists tax_rate numeric(7,4),
  add column if not exists tax_amount numeric(12,2),
  add column if not exists discount_amount numeric(12,2),
  add column if not exists total_amount numeric(12,2),
  add column if not exists currency_code text not null default 'USD';

create unique index if not exists service_records_workspace_id_id_uidx
  on public.service_records(workspace_id, id);

alter table public.service_records
  drop constraint if exists service_records_workspace_quote_id_fkey;
alter table public.service_records
  add constraint service_records_workspace_quote_id_fkey
  foreign key (workspace_id, quote_id)
  references public.quotes(workspace_id, id);

create type public.service_record_line_item_type as enum ('labor', 'part', 'fee', 'discount');

create table if not exists public.service_record_line_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  service_record_id uuid not null references public.service_records(id) on delete cascade,
  source_quote_id uuid,
  source_quote_item_id uuid,
  item_type public.service_record_line_item_type not null,
  description text not null check (length(btrim(description)) between 1 and 500),
  inventory_item_id uuid,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  total_price numeric(12,2) not null check (total_price >= 0),
  labor_hours numeric(10,2) check (labor_hours is null or labor_hours >= 0),
  labor_rate numeric(12,2) check (labor_rate is null or labor_rate >= 0),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_record_line_items_workspace_record_fk
    foreign key (workspace_id, service_record_id)
    references public.service_records(workspace_id, id),
  constraint service_record_line_items_workspace_quote_fk
    foreign key (workspace_id, source_quote_id)
    references public.quotes(workspace_id, id),
  constraint service_record_line_items_workspace_quote_item_fk
    foreign key (workspace_id, source_quote_item_id)
    references public.quote_items(workspace_id, id),
  constraint service_record_line_items_total_check
    check (item_type = 'discount' or total_price = round(quantity * unit_price, 2))
);

create index if not exists service_record_line_items_record_idx
  on public.service_record_line_items(workspace_id, service_record_id, sort_order);
create unique index if not exists service_record_line_items_quote_item_once_uidx
  on public.service_record_line_items(workspace_id, source_quote_item_id)
  where source_quote_item_id is not null;

create type public.quote_conversion_status as enum ('processing', 'converted', 'failed');

create table if not exists public.quote_conversions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  quote_id uuid not null,
  service_record_id uuid,
  idempotency_key text not null check (length(btrim(idempotency_key)) between 16 and 200),
  status public.quote_conversion_status not null default 'processing',
  source_quote_snapshot jsonb not null,
  source_items_snapshot jsonb not null default '[]'::jsonb,
  conversion_options jsonb not null default '{}'::jsonb,
  failure_code text,
  failure_message text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint quote_conversions_workspace_quote_fk
    foreign key (workspace_id, quote_id) references public.quotes(workspace_id, id),
  constraint quote_conversions_workspace_service_fk
    foreign key (workspace_id, service_record_id)
    references public.service_records(workspace_id, id),
  unique (workspace_id, quote_id, idempotency_key)
);

create unique index if not exists quote_conversions_one_success_uidx
  on public.quote_conversions(workspace_id, quote_id)
  where status = 'converted';
create index if not exists quote_conversions_workspace_created_idx
  on public.quote_conversions(workspace_id, created_at desc);

alter table public.service_record_line_items enable row level security;
alter table public.quote_conversions enable row level security;

create policy service_record_line_items_member_select
on public.service_record_line_items for select to authenticated
using (exists (
  select 1 from public.workspace_members wm
  where wm.workspace_id = service_record_line_items.workspace_id
    and wm.user_id = auth.uid() and wm.is_active
));

create policy service_record_line_items_operator_write
on public.service_record_line_items for all to authenticated
using (exists (
  select 1 from public.workspace_members wm
  where wm.workspace_id = service_record_line_items.workspace_id
    and wm.user_id = auth.uid() and wm.is_active
    and wm.role::text = any (array['owner','admin','manager','service_advisor'])
))
with check (exists (
  select 1 from public.workspace_members wm
  where wm.workspace_id = service_record_line_items.workspace_id
    and wm.user_id = auth.uid() and wm.is_active
    and wm.role::text = any (array['owner','admin','manager','service_advisor'])
));

create policy quote_conversions_member_select
on public.quote_conversions for select to authenticated
using (exists (
  select 1 from public.workspace_members wm
  where wm.workspace_id = quote_conversions.workspace_id
    and wm.user_id = auth.uid() and wm.is_active
));

create policy quote_conversions_operator_insert
on public.quote_conversions for insert to authenticated
with check (exists (
  select 1 from public.workspace_members wm
  where wm.workspace_id = quote_conversions.workspace_id
    and wm.user_id = auth.uid() and wm.is_active
    and wm.role::text = any (array['owner','admin','manager','service_advisor'])
));

create or replace function public.convert_quote_to_service_record_v1(
  p_workspace_id uuid,
  p_quote_id uuid,
  p_idempotency_key text,
  p_created_by uuid,
  p_service_date date default current_date,
  p_technician_id uuid default null,
  p_appointment_id uuid default null,
  p_work_order_id uuid default null,
  p_internal_notes text default null,
  p_expected_quote_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_quote public.quotes%rowtype;
  v_item record;
  v_existing public.quote_conversions%rowtype;
  v_conversion_id uuid;
  v_service_record_id uuid;
  v_subtotal numeric(12,2);
  v_total numeric(12,2);
  v_currency text;
  v_item_count integer := 0;
  v_labor numeric(12,2) := 0;
  v_parts numeric(12,2) := 0;
begin
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = p_created_by
      and wm.is_active
      and wm.role::text = any (array['owner','admin','manager','service_advisor'])
  ) then
    raise exception 'quote_conversion_forbidden';
  end if;

  select * into v_existing
  from public.quote_conversions
  where workspace_id = p_workspace_id
    and quote_id = p_quote_id
    and idempotency_key = p_idempotency_key
  order by created_at desc
  limit 1;

  if v_existing.id is not null and v_existing.status = 'converted' then
    return jsonb_build_object(
      'conversion_id', v_existing.id,
      'quote_id', v_existing.quote_id,
      'service_record_id', v_existing.service_record_id,
      'status', 'converted',
      'replayed', true
    );
  end if;

  select * into v_quote
  from public.quotes
  where id = p_quote_id and workspace_id = p_workspace_id
  for update;

  if not found then raise exception 'quote_not_found'; end if;
  if v_quote.status in ('converted', 'cancelled', 'expired') then
    raise exception 'quote_status_not_convertible';
  end if;
  if p_expected_quote_updated_at is not null and v_quote.updated_at <> p_expected_quote_updated_at then
    raise exception 'quote_changed_refresh_required';
  end if;

  select * into v_existing
  from public.quote_conversions
  where workspace_id = p_workspace_id and quote_id = p_quote_id and status = 'converted'
  limit 1;
  if v_existing.id is not null then raise exception 'quote_already_converted'; end if;

  v_subtotal := round(v_labor + v_parts, 2);
  v_total := round(coalesce(v_quote.total, v_subtotal), 2);
  select coalesce(w.currency_code, 'USD') into v_currency from public.workspaces w where w.id = p_workspace_id;

  insert into public.service_records (
    workspace_id, quote_id, appointment_id, work_order_id, technician_id,
    status, work_performed, internal_notes, metadata,
    started_at, completed_at, subtotal, tax_amount, discount_amount,
    total_amount, currency_code
  ) values (
    p_workspace_id, p_quote_id, p_appointment_id, p_work_order_id, p_technician_id,
    'draft', 'Converted quote ' || p_quote_id::text, p_internal_notes, jsonb_build_object(
      'source', 'quote_conversion', 'quote_id', p_quote_id,
      'customer_id', v_quote.customer_id, 'vehicle_id', v_quote.vehicle_id,
      'work_order_id', v_quote.work_order_id, 'quote_status', v_quote.status,
      'quote_subtotal', v_quote.subtotal, 'quote_tax_total', v_quote.tax_total,
      'quote_total', v_quote.total
    ),
    null, null, v_subtotal, 0, 0, v_total, v_currency
  ) returning id into v_service_record_id;

  if v_labor > 0 then
    insert into public.service_record_line_items (
      workspace_id, service_record_id, source_quote_id, item_type,
      description, quantity, unit_price, total_price, labor_hours, labor_rate, sort_order
    ) values (
      p_workspace_id, v_service_record_id, p_quote_id, 'labor',
      'Labor from converted quote',
      greatest(coalesce(v_quote.labor_hours, 1), 0.01),
      round(v_labor / greatest(coalesce(v_quote.labor_hours, 1), 0.01), 2),
      v_labor, v_quote.labor_hours, round(v_labor / greatest(coalesce(v_quote.labor_hours, 1), 0.01), 2), 0
    );
    v_item_count := v_item_count + 1;
  end if;

  for v_item in
    select * from public.quote_items where quote_id = p_quote_id and workspace_id = p_workspace_id order by created_at, id
  loop
    insert into public.service_record_line_items (
      workspace_id, service_record_id, source_quote_id, source_quote_item_id,
      item_type, description, inventory_item_id, quantity, unit_price, total_price, sort_order
    ) values (
      p_workspace_id, v_service_record_id, p_quote_id, v_item.id,
      'part', v_item.description, v_item.inventory_item_id,
      greatest(coalesce(v_item.quantity, 1), 0.001),
      greatest(coalesce(v_item.unit_price, 0), 0),
      greatest(coalesce(v_item.total_price, round(v_item.quantity * v_item.unit_price, 2)), 0),
      v_item_count + 1
    );
    v_item_count := v_item_count + 1;
  end loop;

  insert into public.quote_conversions (
    workspace_id, quote_id, service_record_id, idempotency_key, status,
    source_quote_snapshot, source_items_snapshot, conversion_options,
    created_by, completed_at
  ) values (
    p_workspace_id, p_quote_id, v_service_record_id, p_idempotency_key, 'converted',
    to_jsonb(v_quote), coalesce((select jsonb_agg(to_jsonb(qi)) from public.quote_items qi where qi.quote_id = p_quote_id and qi.workspace_id = p_workspace_id), '[]'::jsonb),
    jsonb_build_object('service_date', p_service_date, 'technician_id', p_technician_id, 'appointment_id', p_appointment_id, 'work_order_id', p_work_order_id),
    p_created_by, now()
  ) returning id into v_conversion_id;

  update public.quotes set status = 'converted', updated_at = now()
  where id = p_quote_id and workspace_id = p_workspace_id;

  return jsonb_build_object(
    'conversion_id', v_conversion_id,
    'quote_id', p_quote_id,
    'service_record_id', v_service_record_id,
    'status', 'converted',
    'line_item_count', v_item_count,
    'totals', jsonb_build_object('subtotal', v_subtotal, 'tax_amount', 0, 'discount_amount', 0, 'total_amount', v_total, 'currency_code', v_currency)
  );
exception when unique_violation then
  select * into v_existing from public.quote_conversions
  where workspace_id = p_workspace_id and quote_id = p_quote_id and status = 'converted' limit 1;
  if v_existing.id is not null then
    return jsonb_build_object('conversion_id', v_existing.id, 'quote_id', p_quote_id, 'service_record_id', v_existing.service_record_id, 'status', 'converted', 'replayed', true);
  end if;
  raise;
end;
$$;

commit;
