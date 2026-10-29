-- Backfill: stamp the website-quote price lock onto the October 2026
-- website bookings that entered Service Writer by direct import, before
-- the staff push RPC existed.
--
-- Background: the price lock (20261029130000_website_quote_price_lock.sql)
-- only fires for appointments carrying the staff push RPC's markers
-- (public_booking_book_appointment_staff_v1,
-- 20261028235900_website_booking_staff_push_rpc.sql): source =
-- 'moms_website' plus metadata.pricing_state = 'website_quote_locked'
-- (or a metadata.website_booking_id). The Oct 26 import records were
-- created by direct insert, so they carry no markers — three of them
-- (Anatole Doak, Qiad Jones, Laurenza Giosa) even carry the wrong
-- source ('staff'). Their invoices were set to the exact website quotes
-- and marked paid in the manual Oct 29 closeout, but without markers a
-- future edit or completion would let sync_appointment_invoice_v1
-- re-inflate them again (the mechanism proven live during that
-- closeout, when completing appointments reverted invoices to the
-- inflated figures). This migration stamps the markers. It changes no
-- money: no invoice amounts, no payments, no appointment times or
-- statuses — only appointments.source and appointments.metadata on rows
-- that pass every fingerprint guard below.
--
-- The stamp (mirrors the push RPC's appointment insert exactly, in the
-- lock-relevant fields):
--   source                          = 'moms_website'
--   metadata.pricing_state          = 'website_quote_locked'
--   metadata.estimated_cost         = the verified website quote
--   metadata.client_estimated_cost  = the verified website quote
--   metadata.tax_amount             = 0
--   metadata.client_tax_amount      = 0
--   metadata.price_lock_backfill    = provenance object (migration,
--                                     invoice, quote, timestamp)
-- Metadata is merged with || so unrelated keys survive.
--
-- Deliberately NOT stamped, and why:
--   * metadata.website_booking_id — no real website booking id is known
--     for these import records; inventing one would corrupt the push
--     RPC's idempotency key. pricing_state alone satisfies both lock
--     checks (src/lib/price-lock.ts and sync_appointment_invoice_v1).
--   * metadata.service_catalog_id — the RPC copies the push-time
--     catalog id; it is not a lock field and is not verifiable for the
--     import records.
--   * metadata.financial_integrity_mode — not written by the RPC; the
--     lock-aware sync maintains it on its next write-back.
--   * appointment_items — the RPC creates one item at the quote for NEW
--     appointments. These records already have item rows and paid
--     invoices; the lock-aware sync pins a locked invoice to the quote
--     regardless of item sums, so rewriting items would add risk and
--     change nothing about the lock.
--
-- SAFETY INVARIANT: a record is stamped ONLY if every fingerprint
-- matches — the appointment's exact id (full ids for Siani Madison,
-- Hamzah Hamza, and Brandon Hall were recovered from the Oct 27
-- ID-match log, memory/2026-10-27.md, after the closeout reports
-- truncated them), the customer name, the appointment's local date
-- and completed status (Brandon excepted on both — see his note
-- below), and the linked invoice (found via
-- invoices.metadata appointment_id, the same linkage the invoice sync
-- uses) with the expected number, total exactly equal to the quote the
-- stamp would lock in, amount_paid equal to that total, and status
-- 'paid'. Exactly one candidate appointment must match. Any mismatch
-- stamps NOTHING for that record and raises a NOTICE saying why, so
-- the apply log shows per-record outcomes. Records are independent:
-- one record's mismatch does not block the others.
--
-- ANATOLE DOAK — read before applying: during the Oct 29 closeout his
-- appointment metadata.estimated_cost was set to 130.68 (the $137.28
-- quote minus tax) to pass a completion integrity check. Stamping the
-- lock without correcting that would pin his invoice to 130.68 — a NEW
-- discrepancy against his paid $137.28 invoice. This migration
-- therefore sets his metadata.estimated_cost to the full verified
-- quote 137.28 as part of the stamp (the canonical RPC stamp also sets
-- estimated_cost = the quote), and its NOTICE logs the previous value.
--
-- BRANDON HALL — flagged uncertainty: Brandon came via the website
-- (Facebook booking, $99 deal) and pre-existed in Service Writer before
-- the import. His full appointment id (0c46ec2d-1293-4643-aba5-
-- 8ff98df7d831) was recovered from the Oct 27 ID-match log, so his
-- block fingerprints on exact appointment id + customer + invoice
-- INV-80 + total 104.94 + paid status. Sources disagree on his
-- appointment date (Oct 20 vs Oct 21), so no date guard is used, and
-- there is no appointment-status guard either (his appointment status
-- is 'confirmed', not 'completed'). NOTE the quote
-- question: the stamp would lock 104.94 — the amount his SW invoice
-- shows as paid, which is $99 x 1.06 tax that Service Writer added —
-- NOT the $99.00 flat website deal quote. Locking 104.94 protects the
-- paid record from re-pricing; whether the $5.94 tax difference is owed
-- back to the customer is an owner decision this migration does not
-- make. If the owner wants the true $99 quote locked instead, remove
-- Brandon's row from the VALUES list before applying (each record is
-- independent) and handle him separately.
--
-- Idempotent: a record that already carries the exact stamp (source,
-- pricing_state, quote in both cost fields, zero tax fields, and the
-- price_lock_backfill provenance key) is skipped unchanged, so a
-- second run changes nothing.
--
-- Apply AFTER 20261029130000_website_quote_price_lock.sql — enforced
-- at runtime: the block below raises unless the live
-- sync_appointment_invoice_v1 already contains the lock logic.
-- File-only until applied, like that migration. There is no automated SQL test
-- harness in this repo; correctness rests on close inspection against
-- the push RPC stamp and the lock-aware sync function.

do $$
declare
  v_workspace_id uuid;
  v_timezone text;
  v_spec record;
  v_candidate_ids uuid[];
  v_appt_id uuid;
  v_invoice_ok boolean;
  v_source text;
  v_metadata jsonb;
  v_already boolean;
  v_rows integer;
begin
  select w.id, w.timezone
    into v_workspace_id, v_timezone
  from public.workspaces w
  where w.slug::text = 'momsoilchange'
  limit 1;

  if v_workspace_id is null then
    raise exception 'MOMS_WORKSPACE_NOT_FOUND';
  end if;

  -- Ordering guard: stamping an appointment fires the invoice-sync
  -- trigger on the metadata update. If the lock-aware sync from
  -- 20261029130000 is not live yet, the OLD sync would respond to the
  -- stamp by re-inflating the invoice and overwriting pricing_state —
  -- the exact bug this backfill exists to prevent. Fail closed.
  if position(
       'website_quote_locked'
       in pg_catalog.pg_get_functiondef('public.sync_appointment_invoice_v1(uuid)'::regprocedure)
     ) = 0 then
    raise exception 'WEBSITE_QUOTE_PRICE_LOCK_NOT_APPLIED: apply 20261029130000_website_quote_price_lock.sql before this backfill';
  end if;

  v_timezone := coalesce(nullif(v_timezone, ''), 'America/New_York');

  for v_spec in
    select *
    from (values
      -- first_name, last_name, appointment_id, id_prefix, date_from, date_to,
      -- require_completed, invoice_number, locked_quote
      ('Anatole'::text,  'Doak'::text,    '14bf129f-5cde-46f0-a3dc-ee81d1101d89'::uuid, null::text,       '2026-10-26'::date, '2026-10-26'::date, true,  82, 137.28::numeric),
      ('Joe'::text,      'Klein'::text,   '67eeadfd-bd56-41ec-be60-152968ddd805'::uuid, null::text,       '2026-10-27'::date, '2026-10-27'::date, true,  83, 122.57::numeric),
      ('Peter'::text,    'Maeder'::text,  'f8a195d2-e32f-47a3-bb27-44cf84947372'::uuid, null::text,       '2026-10-28'::date, '2026-10-28'::date, true,  84, 122.57::numeric),
      ('Siani'::text,    'Madison'::text, '19acfd92-1cc6-4806-8718-696dc1ebb553'::uuid, null::text,       '2026-10-27'::date, '2026-10-27'::date, true,  85, 135.84::numeric),
      ('Qiad'::text,     'Jones'::text,   'bd6be461-2f8f-40e4-9695-679b6071c0e6'::uuid, null::text,       '2026-10-21'::date, '2026-10-21'::date, true,  86, 112.82::numeric),
      ('Laurenza'::text, 'Giosa'::text,   '06af30e0-0e14-4770-bfc4-4ede6ceae6f2'::uuid, null::text,       '2026-10-21'::date, '2026-10-21'::date, true,  87, 122.57::numeric),
      ('Hamzah'::text,   'Hamza'::text,   '212252d6-16e1-4aa0-8ac9-a0c4570ca4f2'::uuid, null::text,       '2026-10-27'::date, '2026-10-28'::date, true,  88, 226.15::numeric),
      ('Brandon'::text,  'Hall'::text,    '0c46ec2d-1293-4643-aba5-8ff98df7d831'::uuid, null::text,       null::date,         null::date,         false, 80, 104.94::numeric)
    ) as t(first_name, last_name, appt_id, appt_prefix, date_from, date_to,
           require_completed, invoice_number, locked_quote)
  loop
    -- Step 1: identify exactly one candidate appointment by exact id
    -- (an id-prefix fallback is retained in the guard shape for
    -- robustness, though every record below now carries a full id —
    -- Siani's, Hamzah's, and Brandon's full ids were recovered from
    -- the Oct 27 ID-match log after the closeout reports truncated
    -- them). Brandon Hall carries no date or completed-status guard:
    -- his appointment status is 'confirmed', not 'completed'.
    select array_agg(a.id)
      into v_candidate_ids
    from public.appointments a
    join public.customers c
      on c.workspace_id = a.workspace_id
     and c.id = a.customer_id
    where a.workspace_id = v_workspace_id
      and (
        (v_spec.appt_id is not null and a.id = v_spec.appt_id)
        or (v_spec.appt_prefix is not null and a.id::text like v_spec.appt_prefix || '%')
      )
      and lower(trim(coalesce(c.first_name, ''))) = lower(v_spec.first_name)
      and lower(trim(coalesce(c.last_name, ''))) = lower(v_spec.last_name)
      and (
        v_spec.date_from is null
        or (a.starts_at at time zone v_timezone)::date between v_spec.date_from and v_spec.date_to
      )
      and (not v_spec.require_completed or a.status::text = 'completed');

    if v_candidate_ids is null or coalesce(cardinality(v_candidate_ids), 0) <> 1 then
      raise notice 'price-lock backfill: SKIP % % — candidate appointments matched: % (expected exactly 1)',
        v_spec.first_name, v_spec.last_name,
        coalesce(cardinality(v_candidate_ids), 0);
      continue;
    end if;

    v_appt_id := v_candidate_ids[1];

    -- Step 2: the safety invariant — the linked invoice must already
    -- total exactly the quote this stamp would lock in, and be paid.
    select exists (
      select 1
      from public.invoices i
      where i.workspace_id = v_workspace_id
        and i.metadata->>'appointment_id' = v_appt_id::text
        and (
          i.invoice_number = v_spec.invoice_number
          or i.metadata->>'legacy_invoice_label' = 'INV-' || v_spec.invoice_number::text
        )
        and i.total = v_spec.locked_quote
        and i.amount_paid = v_spec.locked_quote
        and i.status::text = 'paid'
    ) into v_invoice_ok;

    if not coalesce(v_invoice_ok, false) then
      raise notice 'price-lock backfill: SKIP % % (appointment %) — invoice INV-% fingerprint mismatch (need total = amount_paid = %, status paid, linked by metadata appointment_id)',
        v_spec.first_name, v_spec.last_name, v_appt_id,
        v_spec.invoice_number, v_spec.locked_quote;
      continue;
    end if;

    -- Step 3: idempotency — skip a record that already carries the
    -- exact stamp, so a second run changes nothing (not even
    -- updated_at). Numeric metadata is compared through a regex-guarded
    -- CASE so a non-numeric legacy value can never raise a cast error.
    select a.source, a.metadata
      into v_source, v_metadata
    from public.appointments a
    where a.id = v_appt_id;

    v_already := coalesce(
      v_source = 'moms_website'
      and coalesce(v_metadata->>'pricing_state', '') = 'website_quote_locked'
      and (case when coalesce(v_metadata->>'estimated_cost', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
                then (v_metadata->>'estimated_cost')::numeric end) = v_spec.locked_quote
      and (case when coalesce(v_metadata->>'client_estimated_cost', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
                then (v_metadata->>'client_estimated_cost')::numeric end) = v_spec.locked_quote
      and (case when coalesce(v_metadata->>'tax_amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
                then (v_metadata->>'tax_amount')::numeric end) = 0
      and (case when coalesce(v_metadata->>'client_tax_amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
                then (v_metadata->>'client_tax_amount')::numeric end) = 0
      and (v_metadata ? 'price_lock_backfill'),
      false
    );

    if v_already then
      raise notice 'price-lock backfill: % % (appointment %) already stamped at quote % — no change',
        v_spec.first_name, v_spec.last_name, v_appt_id, v_spec.locked_quote;
      continue;
    end if;

    -- Step 4: stamp. The invoice fingerprint is re-asserted in the
    -- UPDATE itself (defense in depth), and only source + metadata
    -- change. For Anatole Doak this also corrects metadata
    -- estimated_cost from its closeout value (130.68) to the quote —
    -- the NOTICE below logs the previous value for the apply record.
    update public.appointments a
    set source = 'moms_website',
        metadata = coalesce(a.metadata, '{}'::jsonb) || jsonb_build_object(
          'estimated_cost', v_spec.locked_quote,
          'client_estimated_cost', v_spec.locked_quote,
          'tax_amount', 0,
          'client_tax_amount', 0,
          'pricing_state', 'website_quote_locked',
          'price_lock_backfill', jsonb_build_object(
            'migration', '20261029140000_backfill_website_quote_lock_october_imports',
            'invoice_number', 'INV-' || v_spec.invoice_number::text,
            'locked_quote', v_spec.locked_quote,
            'stamped_at', now()
          )
        ),
        updated_at = now()
    where a.id = v_appt_id
      and a.workspace_id = v_workspace_id
      and exists (
        select 1
        from public.invoices i
        where i.workspace_id = v_workspace_id
          and i.metadata->>'appointment_id' = v_appt_id::text
          and (
            i.invoice_number = v_spec.invoice_number
            or i.metadata->>'legacy_invoice_label' = 'INV-' || v_spec.invoice_number::text
          )
          and i.total = v_spec.locked_quote
          and i.amount_paid = v_spec.locked_quote
          and i.status::text = 'paid'
      );

    get diagnostics v_rows = row_count;

    if v_rows = 1 then
      raise notice 'price-lock backfill: STAMPED % % (appointment %) at quote % — previous source %, previous metadata estimated_cost %',
        v_spec.first_name, v_spec.last_name, v_appt_id, v_spec.locked_quote,
        coalesce(v_source, '(null)'),
        coalesce(v_metadata->>'estimated_cost', '(absent)');
    else
      raise notice 'price-lock backfill: SKIP % % (appointment %) — stamp update affected % rows',
        v_spec.first_name, v_spec.last_name, v_appt_id, v_rows;
    end if;
  end loop;
end
$$;
