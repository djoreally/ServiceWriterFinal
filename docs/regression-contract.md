# Service Writer Regression Contract

Service Writer uses a permanent-regression policy: once a production behavior breaks, the failure mode becomes an executable contract and may not be removed merely because the immediate bug is fixed.

## Release rule

A production change is not complete when the bug is fixed. It is complete when:

1. the failure is reproduced or expressed as a deterministic invariant;
2. a regression test or build certification protects that invariant;
3. the test runs in a release gate that does not depend on paid GitHub Actions;
4. responsive user workflows are covered at desktop, tablet, and phone widths where applicable;
5. any authenticated or seeded end-to-end requirement is explicit rather than hidden behind unconditional `test.skip()` placeholders.

The Vercel `prebuild` chain is the minimum always-on release gate. Playwright provides full journey certification when seeded/authenticated fixtures are available.

## Current permanent regression IDs

| ID | Surface | Failure that must not return | Gate |
| --- | --- | --- | --- |
| REG-001 | Public booking | `booking-progress` shadowed by `/appointments/[id]` and returned 405 | prebuild + Jest route precedence |
| REG-002 | Public booking | `booking-recovered` shadowed by `/appointments/[id]` | prebuild + Jest route precedence |
| REG-003 | Public booking | `booking-rpc` shadowed by `/appointments/[id]` | prebuild + Jest route precedence |
| REG-004 | Settings | legacy/invalid `?tab=` can render a blank settings body | prebuild + Playwright |
| REG-005 | Settings/mobile | fixed save bar can sit underneath bottom navigation | prebuild + Playwright |
| REG-006 | Settings/tablet | save bar can reserve a desktop sidebar that does not exist | prebuild + Playwright |
| REG-007 | Appointment/mobile | Start/Complete action can disappear below the bottom navigation | prebuild |
| REG-008 | Appointment pricing | list/card totals can diverge from stamped appointment pricing | prebuild + financial tests |
| REG-009 | Scheduling | create/reschedule can bypass shared availability, blackout, or buffer rules | prebuild + scheduling tests |
| REG-010 | Data boundary | browser code can bypass the server-owned API boundary | architecture prebuild |
| REG-011 | Auth/RBAC | unresolved identity or role drift can expose protected routes | identity prebuild + Jest |
| REG-012 | Signup/onboarding | retired onboarding can re-enter startup or signup flow | onboarding prebuild |
| REG-013 | Email settings | settings can drift back to direct browser-owned persistence | prebuild |
| REG-014 | CRUD/tenancy | mutable resources can lose lifecycle methods or workspace scoping | CRUD prebuild |
| REG-015 | E2E integrity | critical-path files can become unconditional skipped placeholders | prebuild |
| REG-016 | Responsive coverage | E2E can silently return to desktop-only coverage | prebuild |

## Breakable surfaces that require permanent coverage

Every change touching one of these areas must either already be covered by an existing regression ID or add/extend coverage in the same change:

- authentication, login, signup, password/session migration, startup routing;
- workspace selection, tenant isolation, roles, invitations, admin/owner permissions;
- Settings navigation, persistence, responsive layout, provider configuration;
- public booking, availability, blackout dates, buffers, same-day policy, recovery/progress/RPC routing;
- appointment creation, edit, reschedule, start job, inspections, completion, cancellation;
- customer and vehicle CRUD, VIN/engine identity, duplicate prevention, ownership;
- services, packages, subscriptions, catalog, pricing snapshots, taxes, fees, discounts, extra oil;
- quotes, approvals, invoices, payments, refunds, Stripe/Square and financial authority;
- email, SMS, voice, notifications, lifecycle delivery and provider settings;
- fleet accounts, fleet vehicles, work orders, dispatch, service records;
- API route precedence, request validation, authorization, workspace binding and error recovery;
- offline synchronization, autosave, retry behavior and stale data;
- desktop/tablet/mobile navigation, fixed/sticky controls, overflow and reachability;
- migrations and schema compatibility required by current application code;
- deployment/install/build gates and dependency-manifest integrity.

## Incident rule

For every future production incident:

1. assign the next `REG-###` identifier;
2. add the failing behavior to `scripts/certify-regression-lock.mjs`, Jest, Playwright, or the relevant existing certification script;
3. prefer behavioral assertions over implementation-string assertions when a reliable fixture exists;
4. never delete the regression simply because the implementation is refactored—move the assertion to the new authority;
5. do not mark a critical workflow covered when all executable cases are skipped.

This document is the policy registry. The executable authority is the test suite plus the prebuild certification chain.
