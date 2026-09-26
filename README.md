# Service Writer

This repository is the **unified Next.js Service Writer application**.

## Architecture

```
Browser / Service Writer UI
  -> Next.js App Router
  -> Server Components / Server Actions or /api/v1
  -> server-only application services
  -> Drizzle
  -> existing Service Writer Supabase PostgreSQL

External clients / webhooks
  -> /api/v1
  -> same server-only application services
```

The frontend and backend are separate **code boundaries**, not separate deployed applications. Client Components never import Drizzle, server repositories, Supabase business-data clients, Stripe secrets, or privileged provider clients.

## Existing database is authoritative

The current Service Writer PostgreSQL database is the source of truth. We map its existing tables, functions, triggers, constraints, outboxes, idempotency mechanisms, integrations, and payment behavior into the application. We do not create replacement infrastructure merely because the clean application has not mapped it yet.

Any additive migration requires a demonstrated capability gap after production-schema excavation.

Supabase Auth remains the identity provider. Supabase/Postgres remains persistence infrastructure. Business data crosses the server boundary only.

## Application surfaces

- `src/app/(auth)` — authentication UI
- `src/app/(dashboard)` — authenticated Service Writer UI
- `src/app/booking` — public booking UI
- `src/app/api/v1` — explicit API for public/external/mobile/webhook contracts
- `src/features` — feature-owned UI and shared feature code
- `src/server` — server-only auth, application services, repositories, payments and integrations
- `src/db` — Drizzle mapping of the existing SW database
- `src/shared` — transport-safe contracts, validation and types

## Core domain

Dashboard, public booking, customers, vehicles, service catalog, appointments, work orders, quotes/approvals, invoices, payments, and the business settings required by those modules.

## Security boundary

Never expose `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, or `STRIPE_WEBHOOK_SECRET` to the browser. Never trust browser-supplied workspace ownership, roles, prices, taxes, payment amounts, invoice state, provider account references, or approval provenance.

## Start here

Before changing application code, read:

1. [AGENTS.md](./AGENTS.md)
2. [Engineering Handbook](./docs/engineering-handbook.md)
3. Existing database inventory/evidence under `buildos/`
4. `buildos/state.json`, `buildos/checklist.md`, and `buildos/ledger.jsonl`

The engineering handbook remains normative.
