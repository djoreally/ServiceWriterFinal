-- Shot 14: make loyalty ledger append-only/server-authored.
-- Prepared detached from main; apply only with the final certified release.

begin;

revoke insert, update, delete on table public.crm_loyalty_ledger from authenticated;
grant select on table public.crm_loyalty_ledger to authenticated;
grant select, insert, update, delete on table public.crm_loyalty_ledger to service_role;

drop policy if exists crm_loyalty_ledger_insert on public.crm_loyalty_ledger;

comment on table public.crm_loyalty_ledger is
  'Append-only loyalty history. Authorized browser users may read; ledger entries are created by trusted server/service-role workflows.';

commit;
