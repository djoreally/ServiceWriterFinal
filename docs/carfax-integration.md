# CARFAX Integration — Technical Summary

Prepared for CARFAX Partner Development / Business Data Analyst review.
Platform: **Service Writer** (management system name in the feed: `SERVICE_WRITER`).
Status: sample file approved-pending (submitted 2026-11-13); production delivery
built and inert until CARFAX issues the onboarding credentials listed in
[Activation checklist](#activation-checklist-config-only).

## 1. What is integrated

| CARFAX product | State | Mechanism |
| --- | --- | --- |
| Car Care data feed (service history submission) | **Built** | Daily file (PROD) + one-time historical file (HIST), SFTP delivery to data.carfax.com |
| Sample file review | Submitted 2026-11-13 | 17 VINs / 18 service-event lines, built by the production formatter |
| Service History Check™ | Not yet live | Per CARFAX's implementation guide: `POST https://servicesocket.carfax.com/data/1` with the CARFAX-issued product-data-id + location-id. A settings slot for the product-data-id exists (§5); the lookup activates when CARFAX issues the ID. The in-app surface reports "not enabled" until then. |
| QuickVIN™ / location authorization | Not yet live | Authorization Tool (`quickvin.carfax.com/authorizer/1`) requires the CARFAX-issued product-data-id and comp-code; settings slots for both exist (§5). |

There is **no CARFAX API key / account-id credential pair** anywhere in this
integration: no CARFAX document describes one. An earlier draft of this
codebase referenced such a pair in two help texts; both were removed
2026-11-13 (see §9).

## 2. Architecture and data flow

```
Service Writer (per-workspace data)
  service_records (status = completed) + vehicles + line items
  workspace_settings (shop identity + CARFAX identifiers)
        |
        v
Generator — src/server/carfax/generate.ts
  runners: scripts/carfax-feed.ts (CLI job)
           app/api/internal/carfax/daily/route.ts (Vercel cron, CRON_SECRET)
        |
        v
Shared feed construction — src/lib/carfax/feed.ts
  row mapping (one record -> one feed record; labor/part line pairing)
  formatCarfaxFeed (24 fields, pipe-delimited, quoted, one line per event)
        |
        v
Validation gate — src/server/carfax/validate.ts
  creation-time rules (VIN, mileage) + structural check of the built file
  ANY failure refuses the whole file; nothing is emitted or uploaded
        |
        v
Transfer — src/server/carfax/transfer.ts (ssh2-sftp-client)
  SFTP to CARFAX_SFTP_HOST (data.carfax.com), env-only credentials
        |
        v
Run record — public.carfax_feed_runs (one row per attempt, §7)
```

The same shared construction builds the file a shop can download manually
from Settings → CARFAX (browser export) and the file the generator delivers,
so the reviewed sample and every production file are the same bytes for the
same input. A golden test pins this: the generator, fed the sample's source
records, reproduces the submitted sample byte-for-byte.

## 3. Field mapping — the 24 spec fields

Source key: **SR** = `service_records`, **V** = `vehicles`, **LI** =
`service_record_line_items`, **WS** = `workspace_settings` (+ `workspaces.name`),
**C** = constant.

| # | Field | Source | Notes |
| --- | --- | --- | --- |
| 1 | VIN | SR.metadata.vin, else V.vin | Uppercased/trimmed; validated (§4) |
| 2 | RO_OPEN_DATE | SR.completed_at (service date) | MM/DD/YYYY; open = close (same-day ROs; the reviewed sample's construction) |
| 3 | RO_CLOSE_DATE | SR.completed_at (service date) | MM/DD/YYYY |
| 4 | MILEAGE | SR.metadata.mileage, else V.mileage | Rounded to nearest mile; empty when unknown |
| 5 | ODOMETER_MEASURE | SR.metadata.odometer_measure, else V.mileage_unit | Normalized to MI / KM; defaults MI |
| 6 | RO_INVOICE_NUMBER | SR.metadata.service_number | Falls back to a record-derived ID when absent |
| 7 | SERVICE_DESCRIPTION | SR.work_performed (else SR.metadata.description) | Record-level description |
| 8 | LABOR_DESCRIPTION | LI where item_type = labor or labor_hours > 0 | The i-th labor line pairs with the i-th part line on one feed line |
| 9 | PART_NAME_DESCRIPTION | LI, all non-labor lines (parts, fees, …) | i-th part line |
| 10 | PART_QUANTITY | LI.quantity | Printed only when the line carries a part; never an invented 0 |
| 11 | MAKE | V.make | |
| 12 | MODEL | V.model | |
| 13 | MODEL_YEAR | V.year | |
| 14 | PLATE | V.license_plate | Empty when none |
| 15 | PLATE_STATE | V.plate_region | Normalized to a 2-letter code |
| 16 | MANAGEMENT_SYSTEM | C: `SERVICE_WRITER` | As submitted in the reviewed sample; CARFAX to confirm the on-record wording |
| 17 | LOCATION_ID | WS.operational_settings.carfax.location_id | `servicewriter01` for MOMS Mobile Oil Change (registered in the sample submission) |
| 18 | LOCATION_NAME | workspaces.name | |
| 19 | ADDRESS | WS.address_line1 + address_line2 | Emitted as stored |
| 20 | CITY | WS.city | |
| 21 | STATE | WS.region | Normalized to a 2-letter code |
| 22 | POSTAL_CODE | WS.postal_code | |
| 23 | PHONE | WS.phone | |
| 24 | URL | WS.website_url | |

One feed line is emitted per service event: a record with L labor lines and
P part lines produces max(L, P, 1) lines, record-level fields repeated — a
completed record is never dropped and never collapsed.

File naming (CARFAX convention PartnerName_DataStatus_DataType_ExportDate):
`SW_HIST_RO_MMDDYYYY.txt`, `SW_PROD_RO_MMDDYYYY.txt` (export date = generation
date), matching the submitted sample's naming (`SW_SAMPLE_RO_11132026.txt`).

## 4. Validation rules enforced

Creation-time rules (enforced on write since PR #272,
`src/server/hono/lib/creation-validation.ts`) and re-checked for every
record at generation time (`src/server/carfax/validate.ts`); any failure
refuses the whole file and is recorded with its reasons:

- **VIN**: exactly 17 characters, standard VIN charset (no I, O, Q), and no
  placeholder pattern (a character repeated 6+ times, e.g. `…LS111111`).
  A missing VIN refuses the file.
- **Mileage**: numeric, non-negative, ≤ 1,500,000 (guards extra-digit reads).
- **Service date**: required on every record.
- **LOCATION_ID**: must be configured for the workspace.
- **Non-empty scope**: an empty feed is refused, never sent.
- **Structural**: the built file's header must equal the spec header, and
  every line must parse as quoted pipe-delimited text with exactly 24 fields.

The daily PROD scope is completed services for the service date only;
HIST is the workspace's full completed history. Declined/cancelled work is
never in scope (the pull filters `status = completed`).

## 5. Configuration

Per-workspace settings — `workspace_settings.operational_settings.carfax`,
edited in Settings → CARFAX Integration:

| Setting | Meaning | Set when |
| --- | --- | --- |
| `location_id` | LOCATION_ID (field 17) | Agreed with CARFAX (MOMS: `servicewriter01`) |
| `product_data_id` | CARFAX-issued product-data-id (Service History Check / QuickVIN / Authorization Tool) | Issued by CARFAX with the agreement |
| `comp_code` | CARFAX-issued comp-code (Authorization Tool) | Issued by CARFAX with the agreement |
| `activation_date` | Stamped when a location ID is first saved | Automatic |

Plus the shop identity fields the feed's location block reads (business
name, address, city, state/region, postal code, phone, website) in the same
settings screen.

Delivery credentials are **environment-only** (names; values never appear in
code, settings, logs, or this document):

| Variable | Meaning |
| --- | --- |
| `CARFAX_SFTP_HOST` | SFTP host (data.carfax.com) |
| `CARFAX_SFTP_PORT` | Optional, default 22 |
| `CARFAX_SFTP_USER` | CARFAX-issued username |
| `CARFAX_SFTP_PASSWORD` | Password auth — or — |
| `CARFAX_SFTP_KEY_PATH` | Server path to a private key |
| `CARFAX_SFTP_REMOTE_DIR` | Optional, default `/` |

The cron worker also requires the platform's existing `CRON_SECRET`, and
the generator the platform's existing Supabase service env. Nothing CARFAX-
specific is required beyond the table above.

## 6. Security posture

- **No secrets in code or logs.** SFTP credentials are read from the
  environment at run time, never persisted to the database, never written
  to run records (a missing configuration is recorded as variable *names*
  only), and never included in error messages.
- **File content is exactly the spec's 24 fields** — service history data
  for the reporting shop's own completed work. No credentials, payment
  data, or customer contact details beyond the spec fields are included.
- **Server-side only.** Generation and transfer run in trusted server jobs
  (service-role database access); no CARFAX credential or code path is
  exposed to the browser. The browser export produces the same file for
  manual handling and holds no credentials.
- **Workspace isolation.** Every pull is scoped by `workspace_id`; the run
  table's row-level security lets only a workspace's owners/admins read
  their own shop's run history.

## 7. Run records and audit

Every generation/transfer attempt writes exactly one row to
`public.carfax_feed_runs`: workspace, kind (HIST/PROD), file name, record
count, feed row count, the file's SHA-256, final status, error text when
failed, dry-run flag, and start/completion timestamps. Final statuses:
`generated` (built, no delivery requested), `dry_run`, `uploaded`,
`validation_failed`, `upload_failed`, `failed`. A dry run generates,
validates, and records — it opens no network connection and writes no file.

## 8. Error handling and retry stance

- **Validation failure** → the file is refused as a whole, the reasons are
  recorded, and no partial file exists anywhere. The fix is data correction
  and a re-run; re-runs are safe (a new run record, the same file name for
  the same generation date).
- **Missing SFTP configuration** → a recorded `upload_failed` with the
  missing variable names; the worker never crashes and never attempts a
  connection. The daily cron is inert — it reports
  `carfax_sftp_not_configured` and touches nothing — until the environment
  is complete.
- **Transfer failure** → recorded `upload_failed` with the transport error;
  no automatic in-run retry. The next scheduled run (or a manual re-run of
  the job for that date) is the retry; because PROD files are date-scoped
  and named by generation date, a same-day re-send is visible in the run
  history rather than silent.
- **Unexpected failure** → recorded `failed` with the error; the job exits
  non-zero / the cron returns 500 for that workspace pass.

## 9. Code map (for inspection)

CARFAX code lives in four clearly named areas:

| Area | Contents |
| --- | --- |
| `src/lib/carfax/feed.ts` | The canonical feed construction (fields, mapping, formatter) — pure, shared by every producer |
| `src/server/carfax/` | Production delivery: `generate.ts` (generator), `validate.ts` (refusal gate), `sftp-config.ts` (env contract), `transfer.ts` (SFTP), `runs.ts` (run records), `__tests__/` |
| `scripts/carfax-feed.ts` | The runnable job (`npm run carfax:feed -- --workspace <id> --kind HIST\|PROD [--upload] [--dry-run]`) |
| `app/api/internal/carfax/daily/route.ts` | The daily cron worker (schedule in `vercel.json`: 06:30 UTC) |

Pre-existing surfaces (unchanged in behavior by this build, listed so the
surface reads as one whole): the settings screen
(`src/components/settings/CarfaxSettings.tsx`, route `/v1/carfax/settings` +
`/v1/carfax/export-services` in `src/server/hono/routes/vehicles.ts`), the
platform-admin screen (`src/components/admin/AdminCarfaxSettings.tsx`),
the export monitor (`src/components/settings/CarfaxExportMonitor.tsx`,
reading the legacy `carfax_exports` log), and the Service History panel
(`src/components/vehicles/CarfaxServiceHistory.tsx`, backed by an explicit
"provider unavailable" route until the product-data-id exists). Older
material kept for reference: `public/docs/carfax/CARFAX_Integration_Guide.md`
(the pre-rebuild integration guide).

Dead-contract cleanup (2026-11-13 audit, finding G3): two user-facing help
texts described a `CARFAX_API_KEY` / `CARFAX_ACCOUNT_ID` basic-auth pair and
a `servicehistory.carfax.com` endpoint that no CARFAX document supports.
No live code called that endpoint; both texts have been corrected to the
documented contracts (SFTP feed credentials; servicesocket +
product-data-id). Verified by repository-wide search: no code, help text,
or configuration references the dead contract.

## Activation checklist (config only)

When CARFAX replies with the agreement and credentials, activation is
paste-and-go — no code change:

1. **Merge + deploy this PR** (the run-records migration applies itself at
   deploy via the repo's auto-migration runner).
2. **Set the delivery environment** (Production): `CARFAX_SFTP_HOST`
   (data.carfax.com), `CARFAX_SFTP_USER`, and `CARFAX_SFTP_PASSWORD` — or
   `CARFAX_SFTP_KEY_PATH` instead of the password; optionally
   `CARFAX_SFTP_PORT` / `CARFAX_SFTP_REMOTE_DIR` if CARFAX specifies them.
3. **Paste the two issued identifiers** in Settings → CARFAX Integration:
   Product-Data-ID → `carfax_product_data_id`, Comp-Code → `carfax_comp_code`
   (LOCATION_ID `servicewriter01` is already set).
4. **Send the first HIST file** (single command):
   `npm run carfax:feed -- --workspace <MOMS workspace id> --kind HIST --upload`
   — the attempt lands in `carfax_feed_runs` with the file's SHA-256.
5. **Nothing else to switch on**: the daily cron
   (`/api/internal/carfax/daily`) begins delivering PROD files on its next
   run once step 2 is in place; before that it reports
   `carfax_sftp_not_configured` and does nothing.
