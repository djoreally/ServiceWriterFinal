# Service Writer Forensic Audit — 2026-10-10

**Scope:** Deep forensic audit of `~/workspace/sw-final/` at HEAD `ee487d255`. Read-only; nothing modified.
**Trigger:** Owner tapped "Start Job" on a live appointment (2020 Nissan Murano, Mobil 1 full synthetic, $120, Jesse Macbeth) and got "An unexpected error occurred." Settings described as "messed up, missing fields and areas."
**Prior work:** `AUDIT_2026-10-10.md` (deploy blockers — since fixed and pushed). This report builds on it, does not repeat it.

> This file is intentionally uncommitted. Review before deciding what to act on.

---

## (a) Start Job failure analysis

### The exact failure chain (reconstructed)

At ~11:00 AM on 2026-10-10, production was running the **pre-Oct-2 build** (Vercel deploys had been failing since Oct 2 due to the typecheck errors documented in the earlier audit). So the "Start Job" tap executed the OLD code path:

1. **Client:** `JobActionButton.handleStart` → `startAppointmentJob(appointment.id)` (`src/application/commands/appointment-detail.command.ts`)
2. **Old path:** called `updateTechJobDispatchStatus(appointmentId, "in_progress", undefined, false)` (`src/application/commands/tech-app.command.ts:179`)
3. **API:** `POST /v1/tech-app/job-transition` → `workOrdersRouter` (`src/server/hono/routes/work-orders.ts:3470`)
4. **DB:** `technician_transition_job_v1` RPC (`supabase/migrations/20260916190000_technician_transition_job_v1.sql`)
5. **The RPC refused the transition.** Line 97 of the migration:
   ```sql
   elsif v_next in ('in_progress','started') then
     if v_current_status not in ('confirmed','checked_in','in_progress')
       then raise exception 'INVALID_TRANSITION: Cannot start appointment from current status'; end if;
   ```
   Jesse's appointment was booked online yesterday. The notification email said "ready for your team to **review**" — the appointment was in `requested` status, not `confirmed`. The RPC does not allow `requested` → `in_progress`.
6. **The specific error was swallowed.** The Hono endpoint does `if (error) throw error` (`work-orders.ts:3483`). The PostgREST error object carries code `P0001` (Postgres `raise_exception`), which `errorResponse` (`src/server/api.ts`) does not handle — it falls through to the generic 500: `{ code: "internal_error", message: "An unexpected error occurred." }`. The real message ("Cannot start appointment from current status") was logged server-side via `console.error` but never reached the client.
7. **The client couldn't recover the meaning.** `mapTransitionError` (`tech-app.command.ts:156`) checks `raw.includes("invalid_transition")` — case-sensitive. The RPC raises `INVALID_TRANSITION` (uppercase). Even if the message had survived, the case mismatch would have prevented the friendly mapping. The toast showed the generic 500 text.

### Is it fixed now?

**Partially.** Commit `535f48c80` (pushed ~12:30 PM today, now deploying) routes Start Job through the new canonical endpoint `POST /v1/appointments/:id/start` (`src/server/hono/routes/appointments.ts:542`). That endpoint only blocks terminal states (`completed`, `cancelled`, `no_show`) — it does **not** block `requested`. So the immediate "can't start a requested appointment" failure is gone.

**But three problems remain:**

1. **The error-swallowing is unchanged.** If the new endpoint hits any unexpected error (Supabase hiccup, RPC failure in `set_technician_presence_v1`, etc.), the user still gets "An unexpected error occurred." The `P0001` code is still unmapped in `errorResponse`.
2. **The new endpoint is less safe than the RPC it replaces.** The RPC had: row-level locking (`FOR UPDATE`), idempotency keys, transition validation, and event creation. The new endpoint does a `maybeSingle()` read followed by a separate `.update()` — no transaction, no lock, no idempotency key. A double-tap on mobile (or two techs) can race. The `actual_start_time` uses `metadata.actual_start_time ?? now`, so the timestamp is stable, but the safety properties are strictly worse.
3. **The business-logic question is unanswered.** Should a `requested` (unconfirmed) appointment be startable? The old code said no (with a terrible error). The new code says yes (silently). Neither asks the owner. If the intent is "confirm on start," that should be explicit. If the intent is "must confirm first," the UI should say so instead of 500ing.

### The "canonical" start path has been rewritten three times in 10 days

Git history shows three different commits each declaring a "canonical" start implementation:

| Commit | Date | "Canonical" path |
|---|---|---|
| `d44f04c39` "Route appointment start through canonical job transition" | ~Oct 1 | `updateTechJobDispatchStatus` → `technician_transition_job_v1` RPC |
| `633886a6c` "Make start state consistent and booking location atomic" | ~Oct 9 | (refinement of the above) |
| `535f48c80` "Route appointment start through canonical start endpoint" | Oct 10 | `startAppointmentJob` → `POST /v1/appointments/:id/start` (Hono) |

**Both paths are live right now.** `JobActionButton.tsx` (the appointment detail screen the owner used) calls the new Hono endpoint. `TechJobDetail.tsx` and `TechToday.tsx` (the tech mobile app) still call `updateTechJobDispatchStatus` → the RPC. They have different transition rules (RPC blocks `requested`; Hono doesn't), different safety properties (RPC has idempotency + row locks; Hono has neither), and different error shapes. A job started from the tech app and a job started from appointment detail go through different validation.

This is the spaghetti pattern at the smallest scale: each fix declares itself canonical without removing the previous canonical path.

### Recommended fix (2–3 hours)

1. Map `P0001` in `errorResponse` to surface the RPC's message (or at minimum a 409 with the constraint name).
2. Fix the case-sensitivity in `mapTransitionError` (match case-insensitively).
3. Decide the `requested` → `in_progress` policy explicitly and encode it in ONE place (the canonical endpoint), with a clear 409 message.
4. Add idempotency to the new start endpoint (or route it back through the RPC, which already has it).

---

## (d) Swallowed errors — everywhere the app lies to the user

The "An unexpected error occurred" pattern is systemic, not isolated:

| Location | What's swallowed | User sees |
|---|---|---|
| `src/server/api.ts:82` (`errorResponse` fall-through) | Any unmapped error: PostgREST `P0001` (RPC exceptions), network errors, unexpected throws | "An unexpected error occurred." (500) |
| `src/server/hono/routes/work-orders.ts:3483` (`if (error) throw error`) | Specific RPC error messages (`INVALID_TRANSITION`, `CONFLICT_ERROR`, etc.) | Generic 500 (see above) |
| `src/components/appointments/JobActionButton.tsx:62` | Inspection gate check failure | "Required inspection status could not be verified." (no reason why) |
| `src/shared/errors/RouteErrorBoundary.tsx:84` | Any render crash | "An unexpected error occurred." (no recovery action) |
| `src/components/booking/CheckoutErrors.tsx:95` | Booking failures | "An unexpected error occurred. Please try again or contact support." |

**Counts:** 141 instances of generic "Something went wrong" / "Failed to load" / "Please try again" strings across `src/`. 201 files use `toast.error`. The `errorMessage` helper (`src/lib/error-message.ts`) is well-written — the problem is that by the time errors reach it, the server has already replaced the real message with the generic one.

**The pattern:** server throws specific error → `errorResponse` doesn't recognize the code → generic 500 → client displays generic text → owner has no idea what failed. This is why "the system is fucked up and I don't know why" — the app is designed to hide the why.

---

## (e) Data integrity risks

### Confirmed

1. **Double-booking race (TOCTOU).** `bookAppointmentCore` (`src/server/appointments/book-appointment.ts:300-340`) checks for schedule conflicts with a `SELECT`, then does an `INSERT` — no transaction, no advisory lock, no exclusion constraint. Two simultaneous bookings for overlapping slots both pass the check and both insert. For a booking system, this is the most dangerous bug: it silently creates the exact problem the software exists to prevent.

2. **Start Job race (new endpoint).** `POST /v1/appointments/:id/start` does read-then-write without a transaction or `FOR UPDATE`. The old RPC path had row locking and idempotency keys; the new "canonical" endpoint dropped both. Concurrent starts are unlikely to corrupt data (idempotent status write), but the `metadata` merge (`{ ...metadata, dispatch_status: "started", ... }`) is a read-modify-write that can clobber concurrent metadata updates.

3. **Browser-direct writes bypass server validation.** (Detailed in the spaghetti map, section (c) — pending parallel track.) The earlier audit found 360 files importing the browser Supabase client. Writes from the browser skip the Zod validation, transition checks, and business logic in the API layer. Any RLS misconfiguration turns these into data-corruption vectors.

### Probable (needs DB access to confirm)

4. **128 migrations with no squashing.** Schema churn is ongoing (latest Oct 2). Without verifying which migrations actually applied to production, the code may reference columns/tables that don't exist in prod (or vice versa). The "retired tables" PR (#96) suggests this has already bitten.

5. **Metadata JSONB as a shadow schema.** Appointment `metadata` carries `dispatch_status`, `actual_start_time`, and other operational fields. There's no schema for what's in `metadata` — it's a schemaless blob inside a relational database. Two code paths writing different `metadata` shapes is a silent corruption risk.

---

## (f) Differentiator assessment — the Droptop question

**What this app does that a basic CRUD booking system doesn't (verified in code):**

1. **Vehicle intelligence.** A `vehicle_specifications` catalog in the database (from the owner's scraped YMM data) powers the "Oil service specifications" panel — the app knows a 2020 Nissan Murano 3.5 takes 0W-20, 4.8 liters with filter. This is genuinely differentiated for oil-change operators. (Migration: `20260822060000_vehicle_specifications_backup_catalog.sql`.)
2. **Mobile technician workflow.** En-route → arrived → start → inspection → complete with presence tracking (`set_technician_presence_v1`), job photos, and idempotent transitions. This is a real ops tool, not just a calendar.
3. **Fleet work orders.** Separate work-order model with dispatch, distinct from consumer appointments. (Integration quality covered in the spaghetti map.)
4. **Shop Agent (SMS).** ZeroAI-powered SMS agent for missed-call text-back and booking (Phase 1, merged Oct 2).
5. **Inspections.** Required inspection checklists gated by vehicle, with a performer UI and approval flow.

**What's aspirational or broken:**

6. **Google Calendar sync.** Exists in settings (`CalendarIntegration.tsx`) but the owner reports users "still can't sync to our Google calendars." (Detailed in settings gaps, section (b) — pending parallel track.)
7. **Dispatch.** Exists but the failing test suites (`dispatch-tech.journey`, `dispatch-assignment-e2e`) suggest it's not reliable.
8. **The "one system" promise.** The owner's pitch is that techs shouldn't juggle three systems. But the app itself has three ways to start a job (see spaghetti map) — it's replicating the fragmentation internally.

**Honest verdict on differentiation:** The vehicle intelligence + mobile tech workflow + fleet is a real moat for the mobile-oil-change niche. Nobody else has the scraped oil-spec database wired into the job flow. But the moat is currently surrounded by a broken castle — the differentiators don't matter if Start Job 500s.

---

## (b) Settings gaps

*(Parallel audit track — full findings below, condensed from the dedicated settings audit.)*

### Fields that render but don't save

1. **Maintenance Reminder settings never persist** (`src/components/settings/MaintenanceReminderSettings.tsx`). The auto-send toggle, days-before-due, miles-before-due, and priority switches set local React state only — zero save/persist calls in the file. The switches are decorative.
2. **Main Business/Booking save silently no-ops without a settings row.** `POST /v1/platform/settings/business-profile` (`src/server/hono/routes/platform.ts:1948`) does `.update().eq("workspace_id", ...)` — no upsert, and no migration or code creates the `workspace_settings` row. For a workspace without the row, the sticky "Save settings" button toasts "Profile saved successfully" while writing nothing.
3. **Per-jurisdiction tax rates are a write-only black hole.** `TaxSettings.tsx` "Add Rate" writes to `tax_rates`, but `fetchTaxSettings` hardcodes `rates: []` (`src/application/queries/tax-settings.query.ts:46`) — saved rates are invisible forever. "Load Default Rates" calls RPC `seed_default_tax_rates`, which exists in **no migration**.
4. **QuickBooks / Voice Agent / Auto-dispatch settings update the retired `business_profiles` table** with no upsert. If the legacy row doesn't exist, the UI toasts success while writing 0 rows.
5. **Currency selector is a dead control** (`Settings.tsx:1096`) — renders as a chooser, only ever yields USD.

### Dead controls (wired to nothing)

- **Billing "Buy SMS Starter / Growth / Add Marketing Email"** (`BillingSettings.tsx:195-211`): the card says "Billing is disabled — all features are included for free," yet the buttons POST to an edge function (`create-messaging-addon-checkout`) that **doesn't exist** in `supabase/functions/` → 502.
- **Email "Send Test Email" / "Test Incoming Mail"** → edge functions `test-email-settings`, `fleet-email-mailbox` — don't exist → 502.
- **QuickBooks Connect / Sync / Disconnect** → `qbo-connect`, `qbo-disconnect`, `qbo-sync` — don't exist → 502.
- **ProviderSync "Retry"** → `provider-sync-manager` — doesn't exist → 502.
- **QuickBooks "Sync Payments" switch**: disabled with a no-op handler (honest placeholder, at least).
- **`StripeConnectCard`**: imported but never rendered — orphaned.

### Google Calendar — why users "can't sync"

- **Nothing auto-syncs.** `syncAppointmentToGoogle` has **zero callers**. No trigger, webhook, or hook pushes on create/update/cancel. The UI claims *"New appointments will be automatically synced"* (`CalendarIntegration.tsx:144`) — false. Only manual "Run sync now" works.
- **The connect flow can silently switch identity.** `startGoogleCalendarOAuth` calls `supabase.auth.signInWithOAuth` (a fresh sign-in, not an account link). For email/password users with a different Google email, the session is replaced, tokens land under a user with no workspace membership, and the failure is swallowed — UI stays "Not connected" with no explanation.
- Tokens are per-**user**, not per-workspace.

### The migration gap (critical)

**`email_settings`, `sms_preferences`, `coupon_codes`, `tax_rates`, `qbo_sync_log`, `cash_drawer_sessions`** — none have `CREATE TABLE` in any of the 128 migrations. Neither do the RPCs `encrypt_smtp_password` and `current_workspace_owner_user_id`. The settings UI's persistence layer exists in production but is **off-books**: the repo cannot rebuild production. If the prod database were lost, these tables could not be recreated from the repo.

### Duplicates

- Tax rate editable in two places on the same tab (`PaymentSettings` → `workspace_settings.tax_rate` and `TaxSettings` → same column). Last write wins.
- Dead legacy section components (`settingSections.ts`) duplicate the live inline sections — revive-at-your-peril.
- Two business-profile save APIs (`POST /v1/platform/settings/business-profile` live; `PUT /v1/workspace-context` dead).

### UX trap

The sticky "Save settings" footer only saves Business/Booking. SMS, Email, Payment, Tax, Voice, and QuickBooks each have their own Save buttons — users who edit those sections and hit the sticky save have saved nothing.

---

## (c) Spaghetti map

*(Parallel audit track — full findings below, condensed from the dedicated integration audit.)*

### Three job tables, no unification

| Table | Scope | Used by |
|---|---|---|
| `appointments` | `workspace_id` | Core booking, JobActionButton, dispatch |
| `work_orders` | `workspace_id` | `technician_transition_job_v1` work-order branch |
| `fleet_work_orders` | **`user_id` (not workspace-scoped!)** | All fleet UI paths — **created out-of-band, no migration** |

### The fleet bridge is broken

The tech app's `transitionJob(jobId, ..., isFleet=true)` sends `source: "fleet_work_order"`. The RPC maps `'fleet_work_order'` → `'work_order'` and queries **`public.work_orders`** — raising `'Job not found'` for any real `fleet_work_orders` id. Meanwhile the fleet UI completes work orders via a different RPC (`transition_fleet_work_order`) on `fleet_work_orders`. **The two paths write different tables and cannot see each other's state.**

Fleet auth diverges too: core paths enforce workspace roles; fleet paths (`requireFleetScope`) accept **any logged-in user** with only a `user_id` row filter — no role check.

### Fleet dispatch is a stub

`dispatchFleetWorkOrder` (`fleet-dispatch.command.ts:53`) **always throws** ("Fleet dispatch is separated from Service Writer"). It's called by `assignFleetWorkOrderWithOverride`, which is called from `FleetWorkOrderDetailPage.tsx` — so the fleet dispatch "Assign" button is a guaranteed failure.

### Batch assignment bypasses the state machine

`batchAssignFleetWorkOrders` → `POST /v1/fleet/work-orders/batch-assign` does **raw `.update()`** on `fleet_work_orders` (technician, date, even `status`) with no RPC, no validation, no lifecycle.

### 68 shadow routes

68 of 72 Next.js `app/api/**/route.ts` files have byte-identical paths registered in Hono — currently unreachable (Next.js wins), but **not identical implementations**. Deleting any `route.ts` silently promotes its Hono twin with different validation. Plus the `[id]/route.ts` → Hono fall-through for non-UUID ids: one file, two routers, input-dependent behavior.

### Dead code inventory

- **29 dead Hono mutations** (no client callers): including `POST /v1/tech-app/job-transitions` (plural), automation rules CRUD, team member CRUD, newsletter sequences, `shop-agent` endpoints.
- **15 orphaned modules** (imported nowhere): including `sms.command.ts`, `customer.command.ts`, `technician-os.command.ts`, `WeeklyAvailabilityGrid.tsx`.
- **Double-registered route**: `GET /v1/fleet/work-orders` registered twice in `work-orders.ts` (`:895` and `:2408`) — the second is unreachable.
- **Duplicate definitions**: `getFleetDispatchScoreBreakdown` defined in two files; only one is exported.

### Browser-direct writes

Fleet operations, vehicle intelligence, vehicle import, audit logs, presence tracking, and analytics all write to Supabase directly from the browser, bypassing server validation. Public booking calls `supabase.auth.signUp` from the browser.

---

## (g) Verdict: fix vs. rebuild vs. simplify

### The honest assessment

**Don't simplify.** The owner's instinct ("throw it away and go back to a basic form") would discard the actual moat: the vehicle intelligence database (scraped YMM + oil specs wired into the job flow), the mobile technician workflow, and the fleet work-order model. That's 10 years of domain knowledge. A basic form can't be the Droptop killer.

**Don't rebuild from scratch.** Three reasons:
1. **The repo cannot rebuild production.** Settings tables (`email_settings`, `tax_rates`, `sms_preferences`, etc.) and RPCs have no migrations. A "fresh" codebase couldn't recreate the prod database. You'd have to reverse-engineer prod first — which is most of the work of fixing anyway.
2. **The domain model is sound.** Appointments, work orders, dispatch, inspections, vehicle specs — the concepts are right. The implementation is tangled, not wrong.
3. **4–6 months to reach parity**, during which the business runs on the broken app. And a rewrite by the same process (1061 commits since Aug 1, no gating) would likely reproduce the same spaghetti.

**Fix — but not "fix everything." Amputate and stabilize.** The plan:

| Phase | Work | Effort |
|---|---|---|
| 1. **Stop the bleeding** (this week) | Map `P0001` in `errorResponse`; fix `mapTransitionError` case-sensitivity; pick ONE start-job path and delete the other callers; gate merges on typecheck+tests in CI | 1 week |
| 2. **Reverse-engineer prod into migrations** | Dump the production schema for all off-books tables/RPCs; write the missing migrations so the repo can rebuild prod. **This is the single most important risk-reduction step.** | 1 week |
| 3. **Unify the job model** | Decide: one `appointments` table or a unified `jobs` table. Migrate `fleet_work_orders` to workspace scoping. Delete the RPC branch that can never work. Fix or remove the fleet dispatch stub. | 2–3 weeks |
| 4. **Delete the dead code** | Remove 29 dead endpoints, 15 orphaned modules, 68 Hono shadow twins (or finish the Hono migration — pick one). | 1–2 weeks |
| 5. **Fix settings persistence** | Upsert instead of update; wire maintenance reminders; fix Google Calendar auto-sync or remove the claim; remove/repair dead edge-function buttons. | 1–2 weeks |
| 6. **Transaction safety** | Add exclusion constraint or advisory lock to booking; wrap start-job read-modify-write in a transaction. | 1 week |

**Total: 2–3 months** of focused, gated work. Versus 4–6 months for a rewrite that starts by solving the migration problem anyway.

### The one non-negotiable

**Phase 2 (reverse-engineer prod into migrations) must happen regardless of which path is chosen.** Right now, the production database is unreproducible. That's not technical debt — that's an existential risk. If the Supabase project were lost tomorrow, the settings subsystem could not be rebuilt.

### What to tell the Droptop partnership

The differentiator is real: no other shop software has the scraped vehicle/oil-spec database wired into a mobile-first tech workflow. But the current state can't be demoed reliably — Start Job 500s on unconfirmed appointments, fleet dispatch is a stub, and Google Calendar doesn't auto-sync. Fix phases 1–2, then the demo works. The partnership conversation should happen after that, not before.
