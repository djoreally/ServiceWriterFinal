# Service Writer modular architecture

Service Writer is one deployable Next.js application with strict internal module boundaries. A single deployment is not permission to create a monolith.

## Dependency direction

```
UI (Next.js)
  | direct server calls
  v
Application / use cases <----- Hono /api/v1 transport
  |
  v
Domain policies
  |
  v
Ports / repository contracts
  |
  v
Infrastructure adapters
  |
  +--> Drizzle --> existing Service Writer PostgreSQL
  +--> Stripe
  +--> Supabase Auth
  +--> email / messaging providers
```

Dependencies point inward. Domain/application code must not import Next.js, Hono, Stripe SDK, Supabase clients, or concrete Drizzle repositories.

## Responsibilities

### Next.js UI
Rendering, layouts, navigation, forms, progressive enhancement, Server Components and Client Components. Server-rendered UI may call application use cases directly. It must not make HTTP calls back into its own Hono API.

### Hono transport
The formal HTTP boundary for `/api/v1`: routing, transport authentication, verified workspace context, request IDs, transport validation, status codes, error serialization, CORS when required, webhooks and contracts used by public/mobile/external clients.

Hono routes do not contain business rules and do not query the database directly.

### Application
Use cases/commands/queries and transaction orchestration. This layer coordinates domain rules and repository/provider ports. It is transport agnostic.

### Domain
Business invariants, state transitions, value semantics and policies. No framework imports.

### Infrastructure
Concrete Drizzle repositories and provider adapters. Existing SW PostgreSQL behavior is authoritative; adapters map to existing tables/functions/triggers rather than inventing replacement persistence.

## Feature modules

Each retained domain is independently organized: customers, vehicles, services, appointments, work-orders, quotes, invoices, payments, settings, booking and dashboard/read models.

A feature owns its application contracts and domain behavior. Cross-feature work occurs through explicit application interfaces/events, not arbitrary imports into another feature's internals.

## Hard rules

1. Client Components never access business persistence or privileged provider SDKs.
2. Hono never becomes the domain/service layer.
3. Route handlers contain no business logic.
4. Application/domain modules do not know whether the caller was Hono, a Server Component, a Server Action, a job, or a webhook.
5. UI server code calls application use cases directly; it does not HTTP-call localhost.
6. Database/provider access is server-only and behind explicit adapters.
7. Existing production database contracts are mapped before proposing migrations.
8. Shared code is limited to stable cross-cutting primitives/contracts; no miscellaneous dumping-ground module.
9. Cyclic feature dependencies are prohibited.
10. A module can be extracted into another service later without rewriting its business core.

## Target layout

```
src/
  app/                    # Next.js composition + UI only
  api/
    app.ts                # Hono composition root
    middleware/
    routes/
  modules/
    customers/
      domain/
      application/
      infrastructure/
      ui/
    appointments/
      domain/
      application/
      infrastructure/
      ui/
    ...
  platform/
    auth/
    db/
    observability/
    integrations/
  shared/
    contracts/
    primitives/
```

The composition roots may wire modules together. Feature internals remain private by convention and lint/import-boundary enforcement should be added as the module graph stabilizes.
