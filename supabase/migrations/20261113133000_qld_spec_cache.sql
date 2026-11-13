-- QLD spec lookup cache — the server-side home of the Service
-- Writer → Quick Lube Data live spec wire.
--
-- Doctrine (owner, 2026-11-05): Quick Lube Data is the single spec
-- source and Service Writer is its first integration; specs arrive
-- by live lookup, not from the emv-era vehicle_specifications
-- snapshot. Live lookups cost QLD credits, so successful answers are
-- cached here for 90 days (the provider enforces the TTL at read).
--
-- Shape mirrors Fleet Mail's vin_spec_cache (request/response JSONB
-- + created_at), keyed by normalized year|make|model|engine instead
-- of VIN because Service Writer resolves specs by YMM.
--
-- The table holds only QLD's published catalog answers — no
-- workspace, customer, or user data — so the authenticated staff
-- clients the Hono routes read through may select and refresh
-- entries. The provider treats every cache failure as a miss, so a
-- policy or table problem degrades to a live call, never an error.

create table if not exists public.qld_spec_cache (
  cache_key text primary key,
  request jsonb not null,
  response jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.qld_spec_cache is
  'Server cache for Quick Lube Data live spec lookups (90-day TTL enforced at read by src/server/qld/spec-provider.ts). Global reference data only — no workspace or user data.';

alter table public.qld_spec_cache enable row level security;

drop policy if exists qld_spec_cache_select on public.qld_spec_cache;
create policy qld_spec_cache_select on public.qld_spec_cache
  for select to authenticated using (true);

drop policy if exists qld_spec_cache_insert on public.qld_spec_cache;
create policy qld_spec_cache_insert on public.qld_spec_cache
  for insert to authenticated with check (true);

drop policy if exists qld_spec_cache_update on public.qld_spec_cache;
create policy qld_spec_cache_update on public.qld_spec_cache
  for update to authenticated using (true) with check (true);
