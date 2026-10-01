# ServiceWriter Architecture Audit — Phase 0

Read-only audit, 2026-09-22. No code was modified. All paths are relative to the repo root (`~/workspace/servicewriter`). Line numbers were read from the files on this date.

## Headline facts

- **Two routers, one app.** Next.js App Router (`app/`) exists, but the catch-all `app/[[...path]]/page.tsx` returns `null`. The real UI is a legacy React Router SPA: `src/NextClientShell.tsx` (a `"use client"` boundary) mounts `src/App.tsx`, which runs a `BrowserRouter` with **139 unique SPA routes**.
- **The "application layer" runs in the browser.** `src/application/queries/` (208 files) and `src/application/commands/` (135 files) overwhelmingly import the *browser* Supabase client (`@/integrations/supabase/client`) — 186 of 208 query files and most command files. They mix direct `supabase.from(...)` calls with calls to Next.js API routes (`/api/v1/...`) via `src/lib/nextApiClient.ts` (`nextApi`, 239 lines) or raw `fetch`.
- **Server-side helpers exist but are API-route-only.** `createSupabaseRequestClient`, `createSupabaseServerClient`, `createSupabaseAdminClient` (`src/lib/supabase.ts:34,54`) and `requireWorkspaceMember` (`src/server/api.ts:93`) are used by `app/api/*` routes and `src/server/*` only — zero imports from client-side code (`src/legacy-pages`, `src/components`, `src/hooks`, `src/application`).
- **66 API route handlers** under `app/api/` (56 under `app/api/v1/`, plus internal/webhook routes). The domains they cover are a small subset of what the client-side application layer does directly.
- **No Hono.** `hono` is not in `package.json`.

---

## 1. Route map

### 1a. How routing works

- `app/layout.tsx` — Next.js root layout.
- `app/[[...path]]/page.tsx` — catch-all, `export default function ServiceWriterRoute() { return null; }`. Every non-API path resolves here; the client-side SPA then decides what to render.
- `src/NextClientShell.tsx:13` — `"use client"` shell: `AuthProvider` (fed by `supabase.auth`, line 18) → `ThemeProvider` → `<App />` → `GDPRConsentBanner`.
- `src/App.tsx` — `BrowserRouter` + `<Routes>` with 139 unique paths. Every page component is lazy-loaded through `lazyRetry` (`src/App.tsx:66`), a `React.lazy` wrapper with retry + stale-chunk recovery. `AIAssistant` is also lazy (line 17).
- Auth gating: `RequireAuth` (line ~218 — session + role check via `canAccessRoute` from `@/domain/auth/access-policy`), `RequireRole` (admin), `RouteRoleGuard`, `RequirePlanFeature` (subscription entitlement).

### 1b. App Router (non-API) routes

| Path | File | Renders |
|---|---|---|
| `/*` (catch-all) | `app/[[...path]]/page.tsx` | `null` — SPA takes over client-side |
| `/tire` | `app/tire/page.tsx` | `VerticalLandingPage` (static marketing, SEO metadata) |
| `/detailers` | `app/detailers/page.tsx` | `VerticalLandingPage` (static marketing, SEO metadata) |

**Cross-reference result: none of the 139 SPA routes has an App Router equivalent.** `/tire` and `/detailers` exist only as App Router marketing pages; the SPA has no `/tire` or `/detailers` route. Everything else lives exclusively inside `src/App.tsx`.

### 1c. SPA routes (`src/App.tsx`) → component

Guard key: `A` = `RequireAuth`, `R` = `RequireRole(admin)`, `G` = `RouteRoleGuard`, `P` = `RequirePlanFeature`, `public` = no auth.

| Path | Component (lazy) | Guard |
|---|---|---|
| `/` | `HomeRoute` → `Homepage` (anon) | public |
| `/voice-agent/:slug` | `VoiceAgentEmbed` | public |
| `/unsubscribe` | `Unsubscribe` | public |
| `/find-provider` | `FindProvider` | public |
| `/find-provider/:slug` | `ProviderProfile` | public |
| `/auth` | → redirect `/login` | public |
| `/.lovable/oauth/consent` | `OAuthConsent` | public |
| `/login` | `LoginHub` | public |
| `/login/business` | `WorkforceAuth` | public |
| `/login/dispatch` | `WorkforceAuth` | public |
| `/login/technician` | `WorkforceAuth` | public |
| `/login/admin` | → redirect `/admin/login` | public |
| `/signup` | `WorkforceAuth` | public |
| `/signup/business` | → redirect `/signup` | public |
| `/login/magic-link` | `MagicLinkLogin` | public |
| `/forgot-password` | `ForgotPassword` | public |
| `/reset-password` | `ResetPassword` | public |
| `/google-calendar/callback` | `GoogleCalendarCallback` | public |
| `/pricing` | `Pricing` | public |
| `/about` | `About` | public |
| `/blog` | `Blog` | public |
| `/how-it-works` | `HowItWorks` | public |
| `/faqs` | `Faqs` | public |
| `/careers` | `Careers` | public |
| `/blog/all-features-showcase` | `AllFeaturesShowcaseArticle` | public |
| `/partner-program` | `PartnerProgram` | public |
| `/advertising-network` | `AdvertisingNetwork` | public |
| `/contact` | `ContactUs` | public |
| `/fair-price` | `FairPriceCalculator` | public |
| `/privacy-policy` | `PrivacyPolicyPage` | public |
| `/terms` | `TermsOfServicePage` | public |
| `/security` | `SecurityPage` | public |
| `/white-glove-onboarding` | `WhiteGloveOnboarding` | public |
| `/insights` | `InsightsFeed` | public |
| `/insights/technical-article` | `TechnicalArticle` | public |
| `/features-guide` | `FeaturesGuide` | public |
| `/features/:featureSlug` | `FeatureDetail` | public |
| `/support` | `SupportPage` | public |
| `/book/:slug` | `PublicBooking` | public |
| `/public-services/:slug` | `PublicServices` | public |
| `/subscribe/:slug` | `PublicSubscriptions` | public |
| `/booking-success` | `PaymentSuccess` | public |
| `/messaging-preferences` | `CustomerMessagingPreferences` | public |
| `/testimonial/:slug` | `TestimonialSubmit` | public |
| `/customer/auth` | `CustomerAuth` | public |
| `/customer/dashboard` | `CustomerDashboard` | public |
| `/fleet-manager/auth` | `CustomerAuth` | public |
| `/admin/login` | `AdminLogin` | public |
| `/invite/:token` | `TeamJoin` | public |
| `/team/join` | `InvitationAccept` | public |
| `/team/login` | → redirect `/login` | public |
| `/team/dashboard` | → redirect `/tech-app` | public |
| `/onboarding` | `Onboarding` | A |
| `/plans` | `Plans` | A |
| `/dashboard` | `Dashboard` | A |
| `/crm` | `CRM` | A, G |
| `/settings/import` | `AccountImport` | A, G |
| `/customers` | `Customers` | A |
| `/customers/:id` | `CustomerDetail` | A |
| `/vehicles` | `Vehicles` | A |
| `/vehicles/:id` | `VehicleDetail` | A |
| `/inventory` | `Inventory` | A |
| `/fleet` | `Fleet` | A |
| `/fleet/:id` | `VanDetail` | A |
| `/fleet-manager` | `FleetManagerPortal` | A |
| `/team-os` | `TechnicianOS` | A, G |
| `/technician-os` | → redirect `/team-os` | A |
| `/technician-os/profile` | → redirect `/team-os` | A |
| `/invitations` | `InvitationCenter` | A, G |
| `/dispatch-engine` | `DispatchEngine` | A |
| `/dispatch` | → redirect `/command-center` | A |
| `/weather-guard` | `WeatherGuard` | A |
| `/fleet-os/*` | `FleetSchedulingPage` | A |
| `/work-orders/:id` | → redirect `/appointments` | A |
| `/quotes` | `Quotes` | A |
| `/command-center` | `CommandCenter` | A |
| `/appointments` | `Appointments` | A |
| `/appointments/:id` | `AppointmentDetail` | A |
| `/services` | `Services` | A |
| `/services/:id` | `ServiceDetail` | A |
| `/service-catalog` | `ServiceCatalog` | A |
| `/service-packages` | `ServicePackages` | A |
| `/tire-pricing` | `TirePricing` | A, G |
| `/detailing-pricing` | `DetailingPricing` | A, G |
| `/subscriptions` | `Subscriptions` | A |
| `/quick-service` | → redirect `/appointments` (opens new-appointment) | A |
| `/field-companion` | `FieldCompanion` | A |
| `/settings` | `Settings` | A, G |
| `/settings/sessions` | `SessionManagement` | A |
| `/agent-integrations` | `AgentIntegrations` | A |
| `/availability` | `Availability` | A, G |
| `/marketplace` | `MarketplaceHub` | A, G |
| `/marketplace/:tab` | `MarketplaceHub` | A, G |
| `/pricing-tool` | `JobPricingTool` | A, G |
| `/payments` | `Payments` | A |
| `/reports` | `Reports` | A, P (`has_invoicing_full`) |
| `/financials` | `Financials` | A |
| `/expenses` | `Expenses` | A |
| `/invoices` | `Invoices` | A |
| `/operations` | `Operations` | A |
| `/tax-compliance` | `TaxCompliance` | A |
| `/messages` | `Messages` | A |
| `/receptionist` | `Receptionist` | A, G |
| `/assets` | `Assets` | A |
| `/marketing` | `Marketing` | A |
| `/growth-tools` | `Marketing` | A |
| `/growth-tools/email-diagnostics` | → redirect `/growth-tools?tab=email-testing` | A |
| `/marketing-videos` | `MarketingVideos` | A |
| `/newsletter` | `Newsletter` | A |
| `/retention-engine` | `RetentionEngine` | A |
| `/retention-verify` | `RetentionVerify` | A |
| `/vehicle-specs` | `VehicleSpecs` | A, G |
| `/knowledge-base` | `KnowledgeBase` | A |
| `/knowledge-base/:categorySlug` | `KnowledgeBaseCategory` | A |
| `/tutorials` | `Tutorials` | A |
| `/whats-new` | `WhatsNew` | A |
| `/admin` | `AdminDashboard` | R |
| `/admin/plans` | `AdminPlans` | R |
| `/tech-app` (+15 nested) | `TechAppLayout` + `TechToday` (index), `TechJobs`, `TechFleet`, `TechJobDetail`, `TechDataCenter`, `TechRoute`, `TechNavigation`, `TechMessages`, `TechMore`, `TechInventory`, `TechShift`, `TechShiftReview`, `TechProfile`, `TechSettings`, `TechServices` | A |
| `*` | `NotFound` | public |

Tenant-subdomain branch (when `useTenant()` resolves a slug, `src/App.tsx` renders a separate route set instead): `/customer/dashboard`, `/fleet-manager/auth`, `/fleet-manager`, `/my-bookings` (→ `/customer/dashboard`), `/customer/auth`, `/booking-success`, `/messaging-preferences`, `/services` (`PublicServices`), `/subscribe` (`PublicSubscriptions`), `/embed/services`, `/embed/subscribe`, `/embed/booking` (`TenantBooking`), and catch-all `*` → `TenantBooking`.

---
## 2. Direct data-access inventory

Scope: `src/**`, excluding `__tests__`, `*.test.*`, `__journeys__`.

### 2a. Files importing the browser Supabase client — 360 files

Import target: `@/integrations/supabase/client` (`supabase` at `src/integrations/supabase/client.ts:192`, `productionSupabase` at `:182`). Breakdown by directory:

| Directory | Files |
|---|---|
| `src/application/` (commands + queries + services + tenant-workspace) | 310 |
| `src/` top level (hooks, lib) | 29 |
| `src/components/` | 4 |
| `src/lib/` | 4 |
| `src/application/services/` | 3 |
| `src/features/vehicle-import/services/` | 2 |
| `src/legacy-pages/` (+ fleet-os, tech-app subdirs) | 3 |
| `src/offline/` | 2 |
| `src/domain/` | 1 |
| `src/packages/auth/` | 1 |
| `src/test/journeys/` | 1 |

The 310 `src/application/` files are the intended data layer — but they run client-side. The non-application-layer importers (the ones Phase 2 must reroute or move) are:

- `src/NextClientShell.tsx:8` — feeds `supabase.auth` to `AuthProvider` (auth wiring, keep)
- `src/components/ThemeProvider.tsx`
- `src/components/admin/AdminTrainingRewards.tsx`
- `src/components/ai/AIAssistant.tsx`
- `src/components/pricing/CatalogBenchmarkDialog.tsx`
- `src/components/settings/GDPRDataManagement.tsx`
- `src/domain/auth/build-trust-context.ts`
- `src/features/vehicle-import/services/commit.service.ts`
- `src/features/vehicle-import/services/staging-persistence.service.ts`
- `src/hooks/useAppAccessGate.ts`, `useAssetUploads.ts`, `useAssetsRealtime.ts`, `useBookingSubmit.ts`, `useFeeSettings.ts`, `useGoogleCalendar.ts`, `useNotifications.ts`, `useRealTimeTechStatus.ts`, `useSuggestNextSlots.ts`, `useTechShiftManagement.ts`
- `src/legacy-pages/FleetManagerPortal.tsx`, `GoogleCalendarCallback.tsx`, `InvitationAccept.tsx`, `ResetPassword.tsx`, `SessionManagement.tsx`, `Unsubscribe.tsx`, `WorkforceAuth.tsx`, `fleet-os/FleetHelpPage.tsx`, `fleet-os/work-orders/create/FleetWorkOrderCreatePage.tsx`, `tech-app/TechToday.tsx`
- `src/lib/appointmentItemsApi.ts`, `lib/assets/safe.ts`, `lib/auditLog.ts`, `lib/auth/current-user.ts`, `lib/coreApiFetch.ts`, `lib/dispatch-guardrails.ts`, `lib/livePresence.ts`, `lib/marketplaceTracking.ts`, `lib/nextApiClient.ts`, `lib/retention/use-retention-realtime.ts`, `lib/security/audit.ts`, `lib/tech-push.ts`
- `src/offline/database/syncPull.ts`, `offline/outbox/index.ts`, `offline/rollout.ts`
- `src/application/services/fleet-operations/fleet-operations.service.ts`, `service-defaults/service-defaults.service.ts`, `vehicle-intelligence/vehicle-intelligence.service.ts`, `src/application/tenant-workspace.ts`
- `src/packages/auth/index.tsx` — `AuthProvider` context (auth wiring, keep)

72 of these files additionally call `supabase.from(...)` directly (the rest use `supabase.auth`, realtime, storage, or functions). The `supabase.from(` callers include: 31 command files (e.g. `admin-database-explorer.command.ts`, `automation-rules.command.ts`, `campaigns.command.ts`, `fleet*.command.ts` ×15, `invoices.command.ts`, `retention*.command.ts` ×3, `sms-credits.command.ts`, `tax-settings.command.ts`, `team-members.command.ts`, `tech-app.command.ts`, `technician-os.command.ts`, `testimonial-submit.command.ts`, `tracking-settings.command.ts`, `van-detail.command.ts`, `vehicle-parts-registry.command.ts`, `inspections.command.ts`, `onboarding-wizard.command.ts`, `playbook-seed.command.ts`, `recurring-expenses.command.ts`, `service-images.command.ts`, `declined-services.command.ts`, `fleet-batch.command.ts`), 22 query files (e.g. `admin-carfax.query.ts`, `fleet*.query.ts` ×7, `payments.query.ts`, `public-booking.query.ts`, `quotes.query.ts`, `retention*.query.ts` ×2, `service-form.query.ts`, `team-dashboard.query.ts`, `technician-availability.query.ts`, `technician-tracking.query.ts`, `van-detail.query.ts`, `vehicle-recommendations.query.ts`, `vehicle-specs-page.query.ts`, `weather-guard.query.ts`, `billing-settings.query.ts`, `carfax.query.ts`, `document-intake.query.ts`, `repair-pricing.query.ts`), plus `src/components/admin/AdminTrainingRewards.tsx`, `src/features/vehicle-import/services/commit.service.ts`, `src/legacy-pages/fleet-os/work-orders/create/FleetWorkOrderCreatePage.tsx`, `src/lib/auditLog.ts`.

### 2b. Files calling `fetch(` — 58 files

Format: `file — line(s) — first URL target seen`. `(dynamic/url)` = URL built at runtime (not a string literal). Server-side files (`src/server/messaging/*`) are listed for completeness but already run server-side.

**Client-side, hitting this app's own API (`/api/...`) — 16 files:**
- `src/application/commands/appointment-detail.command.ts` — L68 — `/api/v1/appointments/${...}/start`
- `src/application/commands/appointments.command.ts` — L17 — `/api/v1/appointments/${...}/confirmation`
- `src/application/commands/email-testing.command.ts` — L17 — `/api/v1/email-testing/send`
- `src/application/commands/invoice-send.command.ts` — L23 — `${baseUrl}/v1/invoices/${...}/send`
- `src/application/commands/review-request.command.ts` — L25 — `/api/v1/reviews/actions`
- `src/application/commands/tech-dispatch.command.ts` — L123, L186 — `/api/v1/appointments/${...}/technician-status`, `.../start`
- `src/application/queries/appointment-service.query.ts` — L19 — `/api/v1/appointments/${...}/confirmation`
- `src/application/queries/stripe-direct.query.ts` — L41, L49, L64 — `/api/v1/payments/stripe-direct[?workspace_id=...]`
- `src/application/queries/vehicle-specs.query.ts` — L32 — `/api/v1/public-vehicle-catalog`
- `src/application/queries/workforce-identity.query.ts` — L37 — `/api/v1/workforce-identity`
- `src/contexts/SubscriptionContext.tsx` — L240, L294, L319 — `/api/v1/billing/checkout`, `/api/v1/billing/portal`, `/api/v1/billing/subscription`
- `src/legacy-pages/InvitationAccept.tsx` — L70 — `/api/v1/invitations/${...}?token=...`
- `src/legacy-pages/TeamJoin.tsx` — L21 — `/api/v1/invitations/resolve?token=...`
- `src/lib/appointmentItemsApi.ts` — L11 — `${baseUrl}/v1/appointment-items`
- `src/lib/tech-push.ts` — L54 — `/api/notifications/push/public-key`
- `src/lib/versionCheck.ts` — L51, L52 — `/app-identity.json`, `/version.json`

**Client-side typed API clients (wrappers, not direct calls):**
- `src/lib/nextApiClient.ts` — L61 — `fetch(\`${baseUrl}${path}\`)`; attaches `Authorization: Bearer <access_token>` from `supabase.auth.getSession()` (L48–50). Used by 38 files under `src/application/`.
- `src/lib/coreApiFetch.ts` — L7 — `fetch(\`${baseUrl}${path...}\`)`; similar wrapper.

**Client-side, third-party / external APIs — 9 files:**
- `src/application/queries/mapbox.ts` — L57 — Mapbox geocoding (dynamic)
- `src/application/queries/payouts.query.ts` — L14 — `${FN_BASE}${path}` (Supabase edge function)
- `src/application/queries/sync-function-version.query.ts` — L17 — edge function version check (dynamic)
- `src/components/fleet/FleetCommandMap.tsx` — L61 — map tiles (dynamic)
- `src/components/fleet/TerritoryMap.tsx` — L78 — map tiles (dynamic)
- `src/components/weather-guard/WeatherMap.tsx` — L50 — weather tiles (dynamic)
- `src/components/integrations/McpConnectPanel.tsx` — L83 — `${MCP_SERVER_URL}/.well-known/oauth-protected-resource`
- `src/legacy-pages/admin/AdminLogin.tsx` — L46 — `https://api.ipify.org?format=json`
- `src/lib/weather-guard.ts` — L104 — weather API (dynamic)
- `src/lib/marketplaceTracking.ts`, `src/lib/client-observability.ts` (via `client.ts` L123 fetch wrapper) — telemetry

**Client-side, other / dynamic — 12 files:** `src/application/commands/mobile-dispatch.command.ts` (L10), `provider-sync-manager.command.ts` (L10), `provider-sync.command.ts` (L34), `src/application/queries/appointment-sync.query.ts` (L21, L32), `customers.query.ts` (L144–145), `fleet.query.ts` (L343), `provider-sync.query.ts` (L59, L72, L82), `service-catalog.query.ts` (L47), `vehicles.query.ts` (L92–93), `src/components/ai/AIAssistant.tsx` (L126, L246), `src/components/onboarding/steps/ServiceAreaStep.tsx` (L46), `src/components/settings/GDPRDataManagement.tsx` (L50, L108), `src/components/settings/ServiceAreaSection.tsx` (L44), `src/features/accounting/book-tools.ts` (L55), `src/hooks/useBookingSubmit.ts` (L554), `src/legacy-pages/Availability.tsx` (L286), `PublicBooking.tsx` (L857), `Settings.tsx` (L466), `Unsubscribe.tsx` (L21), `VehicleSpecs.tsx` (L378, L415), `fleet-os/FleetClientDetail.tsx` (L701, L956, L1131), `fleet-os/FleetReportsPage.tsx` (L57)

**Client-side offline sync — 3 files:** `src/offline/database/syncPull.ts` (L73, L86, L110, L175), `src/offline/observability.ts` (L93, L162), `src/offline/outbox/appointments.ts` (L18), `src/offline/outbox/index.ts` (L132, L370, L717, L736, L761, L802)

**Server-side already (`src/server/`, run inside API routes / jobs) — 4 files:** `src/server/messaging/enginemailer.ts` (L110), `resend-reconciliation.ts` (L47 — `${RESEND_API_URL}/emails/...`), `resend.ts` (L48, L72 — `${RESEND_API_URL}/domains`, `/emails`), `twilio.ts` (L49, L66 — `${TWILIO_API_URL}/Accounts/...`)

**Supabase client internals:** `src/integrations/supabase/client.ts` L123 — a wrapped `fetch` adding auth-timeout/abort + error telemetry around all Supabase REST/edge-function requests.

---
## 3. Application layer map

Location: `src/application/`. **It executes in the browser**, not on the server.

| Subdir | Files | Contents |
|---|---|---|
| `commands/` | 135 | `*.command.ts` mutation functions; 186-ish total import the browser Supabase client; 38 use `nextApi` (typed API client); 9 use raw `fetch` to `/api/...` |
| `queries/` | 208 | `*.query.ts` read functions; **186 of 208 import the browser Supabase client**; many call `supabase.from(...)` directly; some call `/api/v1/...` |
| `presenters/` | 3 | `fleet-invoice-compliance.ts`, `fleet-invoice-operations.ts`, `fleet-invoice-status.ts` |
| `services/` | 7 | `fleet-operations/`, `service-defaults/`, `vehicle-intelligence/` subdirs |
| `notifications/` | — | `notification.service.ts` |
| root | — | `tenant-workspace.ts` |

### 3a. Domain coverage (by filename prefix)

**Commands (135):** fleet 17, booking 5, customer 5, service 4, appointment 3, dispatch 3, loyalty 3, sms 3, retention 3, admin 2, automation 2, email 2, google 2, inventory 2, marketing 2, mobile 2, onboarding 2, payment 2, provider 2, recurring 2, rewards 2, team 2, tech 2, vehicle 2, voice 2, + ~45 single-file domains (carfax, cash-drawer, catalog, checkout, gdpr, inspections, invoices, quotes, subscriptions, tax-settings, vin, work-order helpers, etc.)

**Queries (208):** fleet 20, admin 11, service 10, vehicle 9, customer 8, booking 7, appointment 5, team 5, dispatch 4, reports 4, carfax 3, email 3, marketing 3, onboarding 3, provider 3, public 3, rewards 3, sms 3, stripe 3, technician 3, retention 3, availability 2, business 2, command 2, dashboard 2, + ~100 single-file domains (quotes, invoices, payments, payouts, subscriptions, tax-settings, time-clock, upsells, weather-guard, vin-lookup, visual-inspection, voice-agent, webhooks, workforce-identity, etc.)

### 3b. How they reach the backend (three mixed paths)

1. **Direct Supabase (browser client).** Example: `src/application/queries/appointments.query.ts:2` — `import { productionSupabase } from "@/integrations/supabase/client"`, then `supabase.from("workspaces")...`. Authorization relies on Supabase RLS + the anon/publishable key; there is no server in the middle.
2. **Via `/api/v1/...` route handlers** using the typed client: `src/lib/nextApiClient.ts` (`nextApi`, L61 `request()` attaches `Authorization: Bearer <access_token>`). Example: `src/application/commands/appointments.command.ts` calls `nextApi.appointments.create(payload)` for writes but `supabase.from("workspaces")` for reads — in the *same file*.
3. **Raw `fetch` to `/api/...`** with manually attached bearer tokens. Example: `src/application/commands/appointments.command.ts:17` (`sendStaffAppointmentConfirmation` posts to `/api/v1/appointments/:id/confirmation` with `Authorization: Bearer ${session.access_token}`).

The API-route surface (66 handlers, §1) covers only a fraction of domains: appointments, billing, command-center, crm, customers, dispatch, email-testing, health, identity, imports, invitations, invoices, newsletter, payments, public-booking, public-vehicle-catalog, quotes, reviews, service-catalog, service-records, vehicles, webhooks (stripe/twilio/enginemailer/resend), work-orders, workforce-identity, workspaces. Everything else the app does goes direct from browser → Supabase.

### 3c. Shared barrels

- `src/application/queries/index.ts` — 399 lines, re-exports the query surface. Imported by **34 files**.
- `src/application/commands/index.ts` — 198 lines, re-exports the command surface. Imported by **22 files**.
- **74 query files import sibling queries directly** (e.g. `appointments.query.ts` imports `settings.query`; `quotes.query.ts` and `invoices.query.ts` import `workspaces.selection`), so the barrels are not the only coupling vector.

---

## 4. Auth flow (end to end)

1. **Browser session source.** `src/integrations/supabase/client.ts:182` exports `productionSupabase` (also aliased as `supabase`, line 192). It pins the canonical project (`rjfbrfognxqkyhdrpibx`, URL + publishable key fallbacks) and throws on project mismatch. Session persists in browser storage (`isBrowser` check, line ~59); `supabase.auth.getSession()` is the local, non-network read.
2. **React auth context.** `src/packages/auth/index.tsx` — `AuthProvider` accepts an `authStateSource` (defaults to the imported browser `supabase` client, line 2) and exposes `{ session, user, loading, signOut }` via `useAuth()`. `src/NextClientShell.tsx:18` wires it: `<AuthProvider authStateSource={supabase.auth}>`.
3. **Client-side cached identity.** `src/lib/auth/current-user.ts:65` `getCurrentAuthUser()` — resolves identity once from the locally stored session (avoids the `GET /auth/v1/user` network call that ~50 query/command modules used to make; cache invalidated on `onAuthStateChange`, reset via `resetCurrentAuthUserCache()` at line 105).
4. **Edge middleware.** `proxy.ts` (repo root, `export async function proxy`, matcher covers `/api/:path*` + all non-static pages):
   - Canonical-host redirect for `*.vercel.app` → `www.servicewriter.xyz` (skips `/api/*` so signed webhook/API traffic is untouched).
   - Rewrites `/api/v1/payments/actions` → `/api/v1/payments/actions-entitled`.
   - Refreshes the Supabase session via `createServerClient` cookie handling (`await supabase.auth.getUser()`).
5. **API-route authorization.** `src/server/api.ts:93` `requireWorkspaceMember(workspaceId, roles?, request?)` — the choke point used by `app/api/v1/*` handlers (e.g. `app/api/v1/appointments/route.ts:1` imports it):
   - Client sends `Authorization: Bearer <access_token>` (attached by `nextApiClient.ts:50` or manually per-fetch).
   - Server builds a user-scoped client via `createSupabaseRequestClient(accessToken)` (`src/lib/supabase.ts:54`) — bearer token is the effective identity; service-role key used only as apikey when present.
   - Verifies the user is an active member of the workspace (and optionally holds one of the required roles), then hands the handler a workspace-scoped Supabase client.
   - Error mapping: `errorResponse` (`src/server/api.ts:26`) translates PostgREST codes (`PGRST116` → 404, `23505` → 409, `23503` → ...) and `ApiError` statuses into JSON.
6. **Other server client factories** (`src/lib/supabase.ts`): `createSupabaseServerClient()` (line 34, cookie-based, for Server Components/route handlers), `createSupabaseAdminClient()` (line ~62, service-role; "Use only in trusted server jobs/webhooks. Never expose this client to the browser").
7. **Route-level guards (client).** `RequireAuth` (`src/App.tsx`, ~line 218): no session → `<Navigate to="/login">`; role present but `!canAccessRoute(role, pathname)` (`src/domain/auth/access-policy.ts`) → `<AccessDenied/>` (no redirect bounce). `RequireRole` (admin-only), `RouteRoleGuard`, `RequirePlanFeature` (subscription entitlements via `SubscriptionContext`).

**Net:** auth is Supabase Auth throughout. Browser holds the session; API routes trust the bearer token and re-scope to workspace membership; direct-from-browser Supabase calls rely on RLS alone with no server check.

---

## 5. Entanglement hotspots

The 5–7 places Phase 2–3 must untangle most carefully:

1. **`src/application/queries/settings.query.ts` — the workspace god-module.** Imported by **95 files** (`fetchBusinessSettings`, `resolveCurrentWorkspace`). Nearly every query/command resolves workspace context through it; changing its shape or moving it server-side ripples across the whole application layer. (`workspaces.selection` is second at 29 importers.)
2. **The application layer itself (client-side data access).** 360 files import the browser Supabase client; 186/208 queries and most of 135 commands call it directly, while the same files also call `/api/v1/...` (38 via `nextApi`, 9 via raw `fetch`). Single files mix all three paths (e.g. `appointments.command.ts`: `supabase.from("workspaces")` for reads, `nextApi.appointments.create()` for writes, raw `fetch` for confirmation emails). There is no clean client/server boundary to lift — each file must be audited individually.
3. **The two-router architecture.** `app/[[...path]]/page.tsx` returns `null`; `src/NextClientShell.tsx` mounts `src/App.tsx`'s `BrowserRouter` with 139 routes. Any App Router migration must move routes one domain at a time while the catch-all keeps serving the SPA — and the tenant-subdomain branch in `AppRoutes` (13 routes rendering `TenantBooking`/`PublicServices` for `{slug}.servicewriter.xyz`) is a second, hostname-dependent router hidden inside the first.
4. **Cross-query imports (74 files).** Queries import sibling queries directly, not just via barrels — e.g. fleet queries import `settings.query`, `quotes.query.ts`/`invoices.query.ts` import `workspaces.selection`, `tech-app.query` is imported 16× across domains. Untangling one domain drags its dependencies with it.
5. **Global provider stack in `src/App.tsx`.** Every route renders under `QueryClientProvider → TooltipProvider → TerminologyProvider → RegionalSettingsContext → FeatureProvider → SubscriptionProvider → TenantProvider → BrowserRouter → KeyboardShortcutsProvider`, plus `PostHogIdentity`, `OfflineStatusBanner`, `useOfflinePhase1Bootstrap`, `useOfflineOutboxWorker`. `TerminologyContext` alone is imported by 20 files; `useTeamRole` by 19. Moving any route to App Router requires deciding which of these providers move with it.
6. **The offline layer (`src/offline/`).** `outbox/index.ts` (fetch at L132/370/717/736/761/802), `outbox/appointments.ts`, `database/syncPull.ts`, `rollout.ts` — commands queue offline mutations through this layer (e.g. `appointments.command.ts:2` imports `@/offline/outbox/appointments`). It assumes a client-side Supabase client and a browser environment; it cannot move server-side as-is.
7. **Shared UI/state utilities used across domains.** `src/lib/dispatch-state.ts`, `src/hooks/useRealtimeWorkflow.ts` (realtime subscriptions), `src/lib/livePresence.ts`, `src/lib/dispatch-guardrails.ts`, `src/stores/appBootstrapStore.ts` / `startupRoutingStore.ts` — imported by fleet, dispatch, appointments, and tech-app code alike. These are the seams where a domain-by-domain migration will hit shared state.

---

## Appendix: raw counts

| Metric | Value |
|---|---|
| SPA routes (`src/App.tsx`, unique paths) | 139 |
| App Router non-API routes | 3 (`/`, `/tire`, `/detailers`; `/` renders `null`) |
| API route handlers (`app/api/**/route.ts`) | 66 |
| Query modules (`src/application/queries/`) | 208 |
| Command modules (`src/application/commands/`) | 135 |
| Files importing browser Supabase client | 360 |
| Files calling `supabase.from(` | 72 |
| Files calling `fetch(` | 58 |
| Files using typed `nextApi` client | 38 |
| Files importing queries barrel | 34 |
| Files importing commands barrel | 22 |
| Query files importing a sibling query | 74 |
| Top fan-in: `settings.query` | 95 importers |
| `createSupabaseRequestClient`/`Server`/`Admin` used by client-side code | 0 files |
| Hono installed | No |
