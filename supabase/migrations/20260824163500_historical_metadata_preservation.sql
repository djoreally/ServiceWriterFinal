begin;
alter table public.customers add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.vehicles add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.service_catalog add column if not exists metadata jsonb not null default '{}'::jsonb;
commit;
