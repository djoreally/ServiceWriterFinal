-- Acquisition hardening release: database truth and privilege reconciliation.
-- Prepared detached from main; apply only with the final certified release.

-- Billing catalog is server-authoritative. Runtime reads use the server admin client.
revoke all on table public.billing_price_catalog from anon, authenticated;

-- These helpers are internal RLS/authorization helpers, not public RPCs.
revoke execute on function public.is_workspace_writer(uuid) from anon;
revoke execute on function public.is_workspace_financial_writer(uuid) from anon;

-- Explicitly document server-only connection stores. RLS-with-no-browser-policy is intentional.
comment on table public.google_insights_connections is
  'Server-only encrypted Google Analytics connection state. RLS enabled with no browser policies by design.';
comment on table public.provider_connection_secrets is
  'Server-only encrypted payment/provider connection secrets. RLS enabled with no browser policies by design.';
comment on table public.billing_price_catalog is
  'Server-authoritative subscription/payment price catalog. Browser roles have no direct table privileges.';
