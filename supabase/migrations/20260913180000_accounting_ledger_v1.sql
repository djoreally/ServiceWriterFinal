-- Accounting ledger v1: additive bank-import and reconciliation foundation.
-- Does not modify existing expense/payment/appointment tables.

create table if not exists public.financial_import_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid null references auth.users(id) on delete set null,
  source_type text not null default 'bank_upload',
  source_name text not null,
  source_hash text null,
  row_count integer not null default 0,
  imported_count integer not null default 0,
  duplicate_count integer not null default 0,
  status text not null default 'completed',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint financial_import_batches_source_type_check check (source_type in ('bank_upload','manual','connector')),
  constraint financial_import_batches_status_check check (status in ('pending','completed','failed')),
  constraint financial_import_batches_counts_check check (row_count >= 0 and imported_count >= 0 and duplicate_count >= 0)
);

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  import_batch_id uuid null references public.financial_import_batches(id) on delete set null,
  source_row_hash text not null,
  posted_on date not null,
  description_raw text not null,
  amount numeric(14,2) not null,
  direction text not null,
  classification text not null default 'unresolved',
  confidence numeric(5,4) null,
  review_status text not null default 'pending',
  matched_payment_id uuid null references public.payments(id) on delete set null,
  matched_expense_id uuid null references public.expenses(id) on delete set null,
  matched_appointment_id uuid null references public.appointments(id) on delete set null,
  notes text null,
  source_data jsonb not null default '{}'::jsonb,
  classified_by uuid null references auth.users(id) on delete set null,
  classified_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint bank_transactions_workspace_hash_key unique (workspace_id, source_row_hash),
  constraint bank_transactions_direction_check check (direction in ('inflow','outflow')),
  constraint bank_transactions_review_status_check check (review_status in ('pending','approved','rejected')),
  constraint bank_transactions_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint bank_transactions_description_nonempty check (length(btrim(description_raw)) > 0)
);

create table if not exists public.accounting_period_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  revenue numeric(14,2) not null default 0,
  operating_expenses numeric(14,2) not null default 0,
  operating_profit numeric(14,2) not null default 0,
  cash_in numeric(14,2) not null default 0,
  cash_out numeric(14,2) not null default 0,
  net_cash_change numeric(14,2) not null default 0,
  owner_draws numeric(14,2) not null default 0,
  investor_capital numeric(14,2) not null default 0,
  unresolved_amount numeric(14,2) not null default 0,
  calculation_version text not null default 'accounting-v1',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint accounting_period_snapshots_period_check check (period_end >= period_start),
  constraint accounting_period_snapshots_workspace_period_key unique (workspace_id, period_start, period_end, calculation_version)
);

create index if not exists financial_import_batches_workspace_created_idx
  on public.financial_import_batches(workspace_id, created_at desc);
create index if not exists bank_transactions_workspace_date_idx
  on public.bank_transactions(workspace_id, posted_on desc);
create index if not exists bank_transactions_workspace_classification_idx
  on public.bank_transactions(workspace_id, classification, posted_on desc);
create index if not exists bank_transactions_workspace_review_idx
  on public.bank_transactions(workspace_id, review_status, posted_on desc);
create index if not exists accounting_period_snapshots_workspace_period_idx
  on public.accounting_period_snapshots(workspace_id, period_start desc, period_end desc);

alter table public.financial_import_batches enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.accounting_period_snapshots enable row level security;
alter table public.financial_import_batches force row level security;
alter table public.bank_transactions force row level security;
alter table public.accounting_period_snapshots force row level security;

create policy financial_import_batches_select_member on public.financial_import_batches
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy bank_transactions_select_member on public.bank_transactions
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy accounting_period_snapshots_select_member on public.accounting_period_snapshots
  for select to authenticated using (public.is_workspace_member(workspace_id));

create policy financial_import_batches_insert_finance on public.financial_import_batches
  for insert to authenticated with check (
    public.has_workspace_role(workspace_id, array['owner','admin','manager','service_advisor']::public.member_role[])
    and coalesce(created_by, auth.uid()) = auth.uid()
  );
create policy financial_import_batches_update_finance on public.financial_import_batches
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin','manager','service_advisor']::public.member_role[]))
  with check (
    public.has_workspace_role(workspace_id, array['owner','admin','manager','service_advisor']::public.member_role[])
    and coalesce(created_by, auth.uid()) = auth.uid()
  );
create policy bank_transactions_insert_finance on public.bank_transactions
  for insert to authenticated with check (
    public.has_workspace_role(workspace_id, array['owner','admin','manager','service_advisor']::public.member_role[])
  );
create policy bank_transactions_update_finance on public.bank_transactions
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin','manager','service_advisor']::public.member_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner','admin','manager','service_advisor']::public.member_role[]));
create policy accounting_period_snapshots_write_finance on public.accounting_period_snapshots
  for all to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin','manager','service_advisor']::public.member_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner','admin','manager','service_advisor']::public.member_role[]));

grant select, insert, update on public.financial_import_batches to authenticated;
grant select, insert, update on public.bank_transactions to authenticated;
grant select, insert, update, delete on public.accounting_period_snapshots to authenticated;
