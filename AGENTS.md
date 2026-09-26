# Service Writer — Unified Next.js Agent Contract

## Mission
Build the production Service Writer application in this repository as one unified Next.js deployment. The browser/UI and server live in the same application, but they remain strict code boundaries: browser components render product experiences while authenticated business operations execute through trusted Next.js server routes/actions and server-only application services.

## Product boundary
Only build retained product capability for:
1. Authentication and authorization
2. Dashboard data
3. Customers
4. Vehicles
5. Service Catalog
6. Appointments
7. Work Orders
8. Quotes / Approvals
9. Invoices
10. Payments
11. Business Settings
12. Public Booking

Anything outside this boundary requires an explicit scope decision.

## Architecture invariants
- Browser clients never access Service Writer business tables, RPCs, Edge Functions, or database Realtime directly.
- The API owns authorization, tenant/workspace resolution, validation, business rules, transactions, idempotency, payments and persistence.
- Drizzle ORM is the application database-access layer.
- Supabase PostgreSQL is infrastructure and the source-of-truth database.
- Supabase Auth may remain the identity provider; authorization is enforced here.
- Never trust browser-supplied workspace, tenant, role, price, tax, payment state, invoice state, or ownership.
- Never expose `DATABASE_URL`, service-role keys, Stripe secrets, webhook secrets, or other server credentials.
- External systems are called from server-side services only.
- New endpoints use versioned `/api/v1` contracts and Zod validation.

## Domain flow
Public Booking -> Customer -> Vehicle -> Service -> Appointment -> Work Order -> Quote/Approval -> Invoice -> Payment -> History/Dashboard.

## Build rules
- Work from `buildos/state.json` in sequence.
- Read `buildos/checklist.md` before beginning a phase.
- Update `buildos/ledger.jsonl` after each meaningful change.
- Keep commits coherent and reversible.
- Do not mark a phase complete from code presence alone.
- GREEN requires acceptance checks to pass.
- Failed checks remain RED; unknown checks remain UNVERIFIED.
- Never hide a failing check to achieve GREEN.
- Do not create destructive production migrations while inventorying the existing database.
- Preserve existing production data unless an explicit migration plan is approved.

## Definition of done
A retained feature is done only when its UI/server contract, validation, authorization, tenant isolation, persistence, error behavior, tests and required production behavior have been verified.

## Continuity
A new agent/conversation must first read:
1. `AGENTS.md`
2. `buildos/config.json`
3. `buildos/state.json`
4. `buildos/checklist.md`
5. `buildos/ledger.jsonl`
Then inspect the latest commit before changing code.

## Domain Event Architecture

Service Writer uses an orchestrated transactional domain core with choreographed side effects.

Hard invariants:
1. Human and business intent enters through explicit API/application commands. Domain lifecycle state must not advance through implicit event chains.
2. The authoritative domain mutation and publication of its immutable domain event must occur in the same PostgreSQL transaction.
3. Domain events are append-only facts. Delivery, retry, locking and consumer execution state live in separate records.
4. Delivery is at-least-once. Every consumer must be idempotent where possible and explicitly record ambiguous outcomes when an external provider cannot guarantee idempotency.
5. Consumers may perform side effects such as email, SMS, calendar synchronization, analytics and webhooks. They must not casually mutate core lifecycle state; lifecycle transitions belong to explicit domain commands.
6. Event payloads carry identifiers plus immutable point-in-time facts that would become historically false if re-read later. Do not copy entire mutable aggregates into every event.
7. LISTEN/NOTIFY is only a wake-up optimization. PostgreSQL outbox records are the durability boundary, and a periodic reconciliation drain must recover missed notifications and expired worker leases.
8. Do not introduce Kafka, RabbitMQ, Redis Streams or another messaging fabric until measured scale requires replacing the PostgreSQL transport.

Required tracing fields: trace_id, correlation_id and causation_id.
Required delivery behavior: FOR UPDATE SKIP LOCKED, bounded batches, exponential retry backoff, stale lease recovery and terminal dead-letter state.

## Engineering Communication and Code Quality

`docs/engineering-handbook.md` is normative for this repository. Read it before modifying application code.

Its standards apply to implementation code, TypeScript types, identifiers, comments, documentation, commits, reviews, migrations, tests, logs and operational notes. These are engineering artifacts, not disposable prose.

New code must be understandable to a developer encountering the repository for the first time without lowering production standards. Prefer explicit business names, narrow types, validated boundaries, coherent modules, evidence-backed comments and precise commit messages.

Do not use `any`, unsafe casts, non-null assertions, vague identifiers, swallowed errors, hidden tenant assumptions, floating-point money arithmetic, or comments that merely narrate syntax as shortcuts around understanding the problem. Exceptions require a concrete technical reason documented at the point of use.

Do not claim GREEN, fixed, tested, safe or production-ready unless the corresponding evidence was actually produced.

