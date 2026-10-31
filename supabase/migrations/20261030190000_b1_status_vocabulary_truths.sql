-- B1 — canonical status vocabularies (Total Redesign truth rows T-9…T-12).
--
-- The API boundary now owns one vocabulary per entity
-- (src/lib/status-vocabulary.ts). This migration brings STORED values in
-- line with it, so the synonyms the boundary collapses on read/write stop
-- accumulating in the tables:
--
--   T-12  appointments.status: 'on_the_way' -> 'en_route' (canonical).
--   T-11  appointments.dispatch_status: backfilled from the legacy
--         metadata copy — the column is the single home from here on.
--         (The API's technician-status write already targets the column;
--         a few DB RPC writers still mirror into metadata — follow-on.)
--   T-10  invoices.status: 'partial' -> 'partially_paid',
--         'sent' -> 'issued' (the dialects the client translation layer
--         used to paper over).
--
-- All three updates are idempotent and no-op on already-canonical data.

-- T-12: unify the en-route spelling on appointments.
update public.appointments
set status = 'en_route'
where status = 'on_the_way';

-- T-11: the dispatch column becomes the record of truth. Copy the legacy
-- metadata value into the column wherever the column is still empty.
update public.appointments
set dispatch_status = metadata ->> 'dispatch_status'
where dispatch_status is null
  and metadata ->> 'dispatch_status' is not null;

-- T-12 on the dispatch axis too.
update public.appointments
set dispatch_status = 'en_route'
where dispatch_status = 'on_the_way';

-- T-10: invoice dialect unified on partially_paid / issued.
update public.invoices
set status = 'partially_paid'
where status = 'partial';

update public.invoices
set status = 'issued'
where status = 'sent';
