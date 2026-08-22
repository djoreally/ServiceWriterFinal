# ServiceWriter Environment and Blue-Green Deployment Strategy

## Current operating model

ServiceWriter is not yet live and does not contain production customer data. Until the application is feature-complete and ready for launch, development, integration verification, and deployment validation use the current **primary production Supabase project** as the authoritative application backend.

The secondary Supabase project is maintained as a **recovery backup**, not as a fully equivalent staging environment. It must not be treated as a drop-in test target because it may not yet contain a complete, continuously synchronized copy of authentication users, storage objects, database data, database extensions, policies, secrets, webhooks, or third-party configuration.

| Environment role | Current target | Purpose | Current status |
|---|---|---|---|
| Primary application backend | Supabase project `rjfbrfognxqkyhdrpibx` | Build, integration testing, schema verification, and current Vercel deployment | Authoritative |
| Recovery backup | Supabase project `ynegwrgbmszrpmuvafjj` | Recovery copy and backup validation | Not a complete staging environment |
| Current Vercel deployment | `https://service-writer-final.vercel.app` | Application deployment under construction | Must be configured with the primary project before authenticated testing |
| Future blue environment | To be created at launch preparation | Candidate release environment for production cutover | Deferred |
| Future green environment | To be created at launch preparation | Live or previous release environment during controlled promotion | Deferred |
| Future staging | To be established after the platform is ready for launch | Safe pre-release validation with isolated data and credentials | Deferred by design |

## Immediate Vercel correction

The current Vercel deployment was built without the required Vite Supabase environment variables. The deployed bundle therefore falls back to a local development endpoint and cannot authenticate. The current deployment must be rebuilt with the primary project configuration:

```text
VITE_SUPABASE_URL=https://rjfbrfognxqkyhdrpibx.supabase.co
VITE_SUPABASE_PROJECT_ID=rjfbrfognxqkyhdrpibx
VITE_SUPABASE_PUBLISHABLE_KEY=<primary project publishable or anon key>
```

The publishable key is a Vercel secret/configuration value and must be entered directly into Vercel or another approved secret manager. It must not be committed to Git or posted in chat. The backup project’s key should not be placed in the canonical deployment merely to make a smoke test pass.

## Blue-green launch model

When the product is ready for launch, the deployment process should promote an immutable application build between two Vercel targets or deployment aliases while the database remains governed by an explicit migration and compatibility plan. Database migrations must be backward-compatible across the overlap window: the old and new application versions must both be able to read and write the schema during promotion and rollback.

Before switching traffic, the candidate environment must pass typecheck, build, unit tests, integration tests, authenticated role certification, public-booking smoke tests, and read-only production checks. The traffic switch must be reversible by moving the alias back to the prior deployment. Destructive schema changes, data transformations, payment changes, message delivery changes, and irreversible background-job changes require a separately approved migration window rather than being bundled into a routine traffic switch.

The recovery backup remains a disaster-recovery asset. Before launch, it must be upgraded from a partial backup into a documented recovery capability covering schema, database data, authentication export or recovery procedure, storage objects, edge/server configuration, secrets inventory, webhook configuration, and restoration verification. Until that work is completed, it should not be described as staging or used for ordinary application testing.

## Smoke-test rule

The current authenticated smoke test should run against the canonical Vercel deployment configured with the primary Supabase project. It should use a dedicated test account in the primary project and only perform read-safe checks such as login, dashboard rendering, workspace resolution, public booking page rendering, API health, and responsive-layout checks. It must not create bookings, record payments, send messages, issue refunds, delete records, or mutate production tables.

A future staging environment should be created only when it can be isolated and maintained as a real environment, including its own Supabase project, Auth users, storage, secrets, webhook endpoints, payment test mode, messaging test adapters, seed data, and reset procedure. Creating a nominal staging label without those controls would create false confidence rather than safety.
