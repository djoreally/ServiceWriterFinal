-- Inspection results status vocabulary (2026-11-10) -- production save repair.
--
-- The defect: saving an inspection in the app (InspectionPerformer ->
-- POST /v1/inspections/service-inspections/perform) inserts
-- inspection_results rows whose status the PRODUCTION check constraint
-- rejects with 23514 (check_violation), which the API error mapper does
-- not translate, so the technician sees only "An unexpected error
-- occurred." Proven live 2026-11-10 on Cody Glenn's appointment: the
-- save committed the service_inspections row, then died on the results
-- insert (Engine air filter = 'warning'); the orphan row carries ZERO
-- result rows, and all 8 historical production result rows are 'good'.
--
-- Why production differs from the repo: the repo definition
-- (20260917215245_reconcile_inspection_runtime_20260917.sql) declares
-- status in ('pass','fail','warning','not_applicable','not_checked'),
-- but that statement is CREATE TABLE IF NOT EXISTS -- the table already
-- existed in production, so the statement was a no-op and the older
-- production constraint survived untouched:
--   inspection_results_status_check (production, read live 2026-11-10):
--   good, attention, urgent, not_applicable, not_checked
--
-- The replacement below is the UNION of every vocabulary in play, so no
-- existing row and no current writer becomes illegal:
--   attention, urgent  -- production constraint; the perform handler's
--                         recommendation branch keys on these two, and
--                         the legacy voice-inspection severity model
--                         (good/attention/urgent) descends from them.
--   good               -- production constraint; every historical
--                         production inspection_results row carries it.
--   not_applicable,    -- present in BOTH the production constraint and
--     not_checked        the repo DDL; not_checked is also the
--                         performer's initial per-item status.
--   pass, fail,        -- repo DDL (20260917215245) and the current UI
--     warning            vocabulary: InspectionPerformer STATUS_OPTIONS
--                         and the InspectionFinding status type are
--                         pass / fail / warning / not_applicable (plus
--                         the not_checked initial state).
--
-- Idempotent: the drop is IF EXISTS and the add recreates the exact
-- production constraint name with the widened list, so re-running this
-- migration is a no-op in effect.
--
-- Out of scope (follow-on NEED, recorded in the PR): the perform
-- handler's inserts are not transactional, so a results failure can
-- still leave a hollow completed service_inspections row, and the
-- completion gate counts rows, not results. That needs an RPC-shaped
-- fix, not a constraint change.

begin;

alter table public.inspection_results
  drop constraint if exists inspection_results_status_check;

alter table public.inspection_results
  add constraint inspection_results_status_check
  check (status in ('attention', 'fail', 'good', 'not_applicable', 'not_checked', 'pass', 'urgent', 'warning'));

commit;
