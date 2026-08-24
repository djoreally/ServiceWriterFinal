alter table public.quotes
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists quotes_workspace_status_updated_idx
  on public.quotes(workspace_id, status, updated_at desc);

create index if not exists quote_items_workspace_quote_idx
  on public.quote_items(workspace_id, quote_id);

comment on column public.quotes.metadata is
  'Compatibility and presentation-only quote attributes. Canonical status, totals, relationships, and expiry remain first-class columns.';
