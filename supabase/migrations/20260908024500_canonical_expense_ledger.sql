-- Canonical workspace-scoped expense ledger for Service Writer.
-- Additive only. Uses existing workspace membership/RBAC helpers.

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint expense_categories_workspace_id_id_key unique (workspace_id, id),
  constraint expense_categories_workspace_name_key unique (workspace_id, name),
  constraint expense_categories_name_nonempty check (length(btrim(name)) > 0)
);

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  default_category_id uuid null,
  vendor_type text null,
  is_active boolean not null default true,
  times_seen integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint vendors_workspace_id_id_key unique (workspace_id, id),
  constraint vendors_workspace_normalized_name_key unique (workspace_id, normalized_name),
  constraint vendors_name_nonempty check (length(btrim(name)) > 0),
  constraint vendors_normalized_name_nonempty check (length(btrim(normalized_name)) > 0),
  constraint vendors_times_seen_nonnegative check (times_seen >= 0),
  constraint vendors_workspace_category_fkey foreign key (workspace_id, default_category_id)
    references public.expense_categories(workspace_id, id) on delete set null
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  submitted_by_user_id uuid null references auth.users(id) on delete set null,
  vendor_id uuid null,
  vendor_name_raw text not null,
  category_id uuid null,
  transaction_date date not null,
  subtotal numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null,
  currency_code text not null default 'USD',
  payment_method text null,
  last4 text null,
  reference_number text null,
  notes text null,
  receipt_url text null,
  receipt_thumbnail_url text null,
  status text not null default 'pending',
  is_billable boolean not null default false,
  appointment_id uuid null,
  ocr_confidence numeric(5,4) null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz null,
  constraint expenses_workspace_id_id_key unique (workspace_id, id),
  constraint expenses_workspace_vendor_fkey foreign key (workspace_id, vendor_id)
    references public.vendors(workspace_id, id) on delete set null,
  constraint expenses_workspace_category_fkey foreign key (workspace_id, category_id)
    references public.expense_categories(workspace_id, id) on delete set null,
  constraint expenses_workspace_appointment_fkey foreign key (workspace_id, appointment_id)
    references public.appointments(workspace_id, id) on delete set null,
  constraint expenses_status_check check (status in ('pending','approved','rejected','reimbursed')),
  constraint expenses_nonnegative_amounts check (subtotal >= 0 and tax_amount >= 0 and total_amount >= 0),
  constraint expenses_total_math_check check (abs(total_amount - round(subtotal + tax_amount, 2)) <= 0.01),
  constraint expenses_currency_code_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint expenses_last4_check check (last4 is null or last4 ~ '^[0-9]{4}$'),
  constraint expenses_ocr_confidence_check check (ocr_confidence is null or (ocr_confidence >= 0 and ocr_confidence <= 1)),
  constraint expenses_vendor_name_nonempty check (length(btrim(vendor_name_raw)) > 0)
);

create table if not exists public.expense_line_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  expense_id uuid not null,
  description text not null,
  quantity numeric(12,4) not null default 1,
  unit_cost numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint expense_line_items_workspace_expense_fkey foreign key (workspace_id, expense_id)
    references public.expenses(workspace_id, id) on delete cascade,
  constraint expense_line_items_description_nonempty check (length(btrim(description)) > 0),
  constraint expense_line_items_nonnegative check (quantity > 0 and unit_cost >= 0 and line_total >= 0),
  constraint expense_line_items_math_check check (abs(line_total - round(quantity * unit_cost, 2)) <= 0.01)
);

create table if not exists public.expense_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  expense_id uuid not null,
  actor_user_id uuid null references auth.users(id) on delete set null,
  actor_name text null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint expense_activity_workspace_expense_fkey foreign key (workspace_id, expense_id)
    references public.expenses(workspace_id, id) on delete cascade,
  constraint expense_activity_event_type_check check (event_type in ('created','edited','approved','rejected','reimbursed','deleted','receipt_attached','line_items_changed'))
);

create index if not exists expense_categories_workspace_active_idx
  on public.expense_categories(workspace_id, is_active, sort_order);
create index if not exists vendors_workspace_active_idx
  on public.vendors(workspace_id, is_active, name);
create index if not exists expenses_workspace_date_idx
  on public.expenses(workspace_id, transaction_date desc) where deleted_at is null;
create index if not exists expenses_workspace_status_idx
  on public.expenses(workspace_id, status, transaction_date desc) where deleted_at is null;
create index if not exists expenses_workspace_appointment_idx
  on public.expenses(workspace_id, appointment_id) where appointment_id is not null and deleted_at is null;
create index if not exists expense_line_items_workspace_expense_idx
  on public.expense_line_items(workspace_id, expense_id, sort_order);
create index if not exists expense_activity_workspace_expense_idx
  on public.expense_activity(workspace_id, expense_id, created_at desc);

alter table public.expense_categories enable row level security;
alter table public.vendors enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_line_items enable row level security;
alter table public.expense_activity enable row level security;

alter table public.expense_categories force row level security;
alter table public.vendors force row level security;
alter table public.expenses force row level security;
alter table public.expense_line_items force row level security;
alter table public.expense_activity force row level security;

-- Read access: workspace members.
drop policy if exists expense_categories_select_member on public.expense_categories;
create policy expense_categories_select_member on public.expense_categories
  for select to authenticated using (public.is_workspace_member(workspace_id));

drop policy if exists vendors_select_member on public.vendors;
create policy vendors_select_member on public.vendors
  for select to authenticated using (public.is_workspace_member(workspace_id));

drop policy if exists expenses_select_member on public.expenses;
create policy expenses_select_member on public.expenses
  for select to authenticated using (public.is_workspace_member(workspace_id));

drop policy if exists expense_line_items_select_member on public.expense_line_items;
create policy expense_line_items_select_member on public.expense_line_items
  for select to authenticated using (public.is_workspace_member(workspace_id));

drop policy if exists expense_activity_select_member on public.expense_activity;
create policy expense_activity_select_member on public.expense_activity
  for select to authenticated using (public.is_workspace_member(workspace_id));

-- Categories/vendors: finance-capable office roles only.
drop policy if exists expense_categories_write_finance_role on public.expense_categories;
create policy expense_categories_write_finance_role on public.expense_categories
  for all to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin','manager','service_advisor']::public.member_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner','admin','manager','service_advisor']::public.member_role[]));

drop policy if exists vendors_write_finance_role on public.vendors;
create policy vendors_write_finance_role on public.vendors
  for all to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin','manager','service_advisor']::public.member_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner','admin','manager','service_advisor']::public.member_role[]));

-- Any workspace member may submit an expense. Pending submissions may be edited
-- by the submitter; finance roles may edit/approve/reject/reimburse any expense.
drop policy if exists expenses_insert_member on public.expenses;
create policy expenses_insert_member on public.expenses
  for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and coalesce(submitted_by_user_id, auth.uid()) = auth.uid()
    and coalesce(created_by, auth.uid()) = auth.uid()
  );

drop policy if exists expenses_update_submitter_or_finance on public.expenses;
create policy expenses_update_submitter_or_finance on public.expenses
  for update to authenticated
  using (
    public.has_workspace_role(workspace_id, array['owner','admin','manager','service_advisor']::public.member_role[])
    or (submitted_by_user_id = auth.uid() and status = 'pending')
  )
  with check (
    public.has_workspace_role(workspace_id, array['owner','admin','manager','service_advisor']::public.member_role[])
    or (submitted_by_user_id = auth.uid() and status = 'pending')
  );

drop policy if exists expenses_delete_finance on public.expenses;
create policy expenses_delete_finance on public.expenses
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin','manager']::public.member_role[]));

drop policy if exists expense_line_items_insert_member on public.expense_line_items;
create policy expense_line_items_insert_member on public.expense_line_items
  for insert to authenticated with check (public.is_workspace_member(workspace_id));

drop policy if exists expense_line_items_update_member on public.expense_line_items;
create policy expense_line_items_update_member on public.expense_line_items
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists expense_line_items_delete_member on public.expense_line_items;
create policy expense_line_items_delete_member on public.expense_line_items
  for delete to authenticated using (public.is_workspace_member(workspace_id));

-- Activity is append-only for workspace members.
drop policy if exists expense_activity_insert_member on public.expense_activity;
create policy expense_activity_insert_member on public.expense_activity
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id) and coalesce(actor_user_id, auth.uid()) = auth.uid());

-- Reuse canonical updated_at trigger helper.
drop trigger if exists expense_categories_set_updated_at on public.expense_categories;
create trigger expense_categories_set_updated_at before update on public.expense_categories
  for each row execute function public.set_updated_at();
drop trigger if exists vendors_set_updated_at on public.vendors;
create trigger vendors_set_updated_at before update on public.vendors
  for each row execute function public.set_updated_at();
drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at before update on public.expenses
  for each row execute function public.set_updated_at();
drop trigger if exists expense_line_items_set_updated_at on public.expense_line_items;
create trigger expense_line_items_set_updated_at before update on public.expense_line_items
  for each row execute function public.set_updated_at();

create or replace function public.seed_default_expense_categories(p_workspace_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  inserted_count integer;
begin
  if not public.has_workspace_role(p_workspace_id, array['owner','admin','manager','service_advisor']::public.member_role[]) then
    raise exception 'insufficient workspace role';
  end if;

  insert into public.expense_categories(workspace_id, name, is_system, sort_order)
  values
    (p_workspace_id, 'Parts & Materials', true, 10),
    (p_workspace_id, 'Oil & Fluids', true, 20),
    (p_workspace_id, 'Fuel & Travel', true, 30),
    (p_workspace_id, 'Tools & Equipment', true, 40),
    (p_workspace_id, 'Shop Supplies', true, 50),
    (p_workspace_id, 'Software & Subscriptions', true, 60),
    (p_workspace_id, 'Marketing', true, 70),
    (p_workspace_id, 'Insurance & Fees', true, 80),
    (p_workspace_id, 'Other', true, 90)
  on conflict (workspace_id, name) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

grant select, insert, update, delete on public.expense_categories to authenticated;
grant select, insert, update, delete on public.vendors to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.expense_line_items to authenticated;
grant select, insert on public.expense_activity to authenticated;
grant execute on function public.seed_default_expense_categories(uuid) to authenticated;
