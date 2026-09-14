# ServiceWriter BuildOS Agent Contract

This repository operates under BuildOS. These rules apply to every human- or AI-assisted change.

## Mission
ServiceWriter is a production shop-operations SaaS. The primary standard is boring, dependable daily use:
- customers can book without lost or ghost appointments;
- shops can see and manage every appointment consistently;
- notifications are durable, retryable, observable, and never silently lost;
- payments and invoices reconcile without duplicate charges;
- customer, vehicle, service, technician, inventory, and financial data remain correct and tenant-isolated;
- failures surface with enough evidence to repair them before customers call;
- normal shop workflows remain fast on desktop and mobile.

A release is not GREEN because code compiles or a page loads. GREEN means the exact release satisfies the applicable operational contracts below.

## Before every change
1. Read `BUILDOS.md`, `buildos.config.json`, `.buildos/product.json`, `.buildos/architecture.json`, `.buildos/state.json`, and `.buildos/agent-policy.json` when present.
2. Inspect the existing implementation before creating new schema, APIs, adapters, queues, screens, or concepts.
3. Identify the affected user journey, canonical entities, source of truth, workspace boundary, authorization/RLS, API/schema contracts, integrations, and tests.
4. Prefer the smallest complete repair or vertical slice. Do not create parallel implementations when a canonical path exists.
5. Treat migrations, destructive production changes, credentials, billing, irreversible provider actions, or production data mutation as human/external gates.
6. BuildOS is the canonical repository policy. Agent-specific instruction files are adapters/provenance, not competing authority.

## Operational invariants

### Booking
- The canonical public booking API is `/api/v1/public-booking/momsoilchange` with `section=profile`, `settings`, `catalog`, `slots&date=YYYY-MM-DD`, and `blocked_dates`.
- Never invent or depend on nonexistent `/config` or `/availability` subroutes.
- Booking creation must be idempotent enough to prevent accidental duplicate appointments.
- A successful customer booking must persist an appointment that becomes visible to shop operations.
- Dashboard, appointment list, calendar, customer history, and database must not disagree about the existence or status of an appointment.
- Reschedule and cancellation must preserve scheduling, tenant, and authorization invariants.
- Dates displayed to users must be locale-readable; ISO YYYY-MM-DD is an internal API/storage format only.

### Appointments
- Appointment list and calendar must derive from the same canonical appointment state.
- Editing, assigning, rescheduling, canceling, completing, and reopening where supported must not orphan customer, vehicle, service, payment, or notification records.
- Initial operational screens must use bounded queries/pagination/lazy secondary data. Do not load lifetime history by default on high-volume screens.
- A release is RED if an appointment can exist in one operational view and silently disappear from another.

### Notifications and background work
- Durable lifecycle, notification, reconciliation, retry, and recurring work belongs with the authoritative backend/control plane, not solely in a disposable frontend host.
- Queue workers must use bounded batches, durable retry state, idempotency, visibility/lock timeouts, and structured outcome logging.
- Email, push, CRM projection, provider reconciliation, and payment reconciliation must fail independently.
- A release is RED if one worker timeout can block unrelated delivery classes.
- A release is RED on repeated 5xx worker failures, growing queue age/backlog, silent drops, or unbounded retries.
- Provider credentials must live only in approved secret stores/environment variables.

### Payments and financial closeout
- Appointment → invoice → payment → ledger must reconcile deterministically.
- Webhooks and payment mutations must be authenticated, idempotent, replay-safe, and auditable.
- Never fabricate a successful payment state from UI state alone.
- A release is RED if duplicate charging is possible, successful provider payments can remain unreconciled, or an invoice can close against the wrong appointment/workspace.

### Customers, vehicles, services, inventory
- Canonical identities and workspace ownership must remain stable across create/edit/import flows.
- No cross-tenant reads or writes are acceptable.
- Do not create duplicate customer/vehicle/service representations to satisfy stale UI code.
- Vehicle/VIN edits must recompute dependent fitment/spec data where required.
- Inventory and service pricing changes must preserve invoice/service-line correctness.

### Technician and shop workflow
- A real appointment must be able to move from booked → assigned → service/work order → completion → invoice/payment without founder-only database intervention.
- Technician authorization is enforced server/database-side, not by hidden UI.
- Dispatch, inspection, notes, service records, and completion evidence must remain linked to the canonical appointment/work order.

### Data safety and recovery
- Production data must never be mutated merely to make a test pass.
- Schema changes use forward migrations and preserve recoverability.
- Backups are not considered proven until restore has been exercised against a safe environment.
- Retry/recovery tests must prove appointments, payments, and notifications are not lost after worker/provider/runtime interruption.

### Performance and UI
- Core daily-use screens must remain usable on mobile and desktop.
- Responsive data views must rank primary identity/value/status first and reveal secondary detail without deleting it.
- A responsive UI is still RED if its first useful data takes unreasonably long to appear.
- Avoid per-row network requests and unbounded initial datasets on operational screens.

## Runtime ownership
- Supabase/Postgres is the authoritative operational backend for durable state.
- Queues, retries, recurring jobs, reconciliation, and lifecycle processing should run in the backend control plane when supported.
- Vercel or any other frontend host may render and route traffic but must not be the sole owner of critical business lifecycle processing.
- GitHub is source/history, not a runtime dependency.
- Container portability is desirable, but infrastructure work is only priority when it improves product reliability, recovery, or release safety.

## Required verification sequence
For every meaningful change:
1. Run the exact affected unit/contract tests.
2. Run typecheck.
3. Run strict lint.
4. Run relevant integration/database/API tests.
5. Run production build.
6. Run BuildOS check/verify.
7. For release candidates, verify the exact deployed SHA and the affected production journey.
8. Preserve RED evidence and repair before continuing.

Do not weaken tests, skip security checks, fabricate evidence, or bypass a failing BuildOS gate to produce GREEN.

## Production health contract
A production health check must verify:
- production site reachable;
- `/api/v1/health` reachable;
- each canonical booking section returns successful JSON rather than HTML;
- near-future slot lookup works;
- no repeated 5xx/runtime error clusters;
- critical queue/worker failures are not recurring.

## Mandatory repair loop
When any BuildOS gate, test, typecheck, lint, build, deployment, runtime check, queue check, or production verification fails:
1. Read `.buildos/repair/latest.json` when present.
2. Identify the authoritative failing contract and root cause.
3. Repair the smallest complete cause.
4. Rerun the exact failed gate.
5. Continue through subsequent gates only after it passes.
6. Redeploy and reverify the exact SHA when deployment/runtime was affected.
7. Preserve the original RED event.
8. Stop only for a genuine human/external gate.

## Status language
Use only: `not_started`, `in_progress`, `blocked`, `built`, `deployed`, `verified`, `green`, `red`.

## Definition of GREEN
ServiceWriter is GREEN only when the exact candidate has passed its configured BuildOS verification and the affected real-world user journey is proven. A successful compile, deployment, endpoint existence, or manual spot-check alone is not GREEN.
