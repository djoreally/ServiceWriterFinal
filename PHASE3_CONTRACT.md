# Phase 3 Contract — SPA → App Router Migration

This is the exact contract every section worker MUST follow when migrating a
legacy SPA route to an App Router page. It is written against the
infrastructure built in Phase 3 (repo root, uncommitted).

## 1. Files created by Phase 3 (do not move or rename)

| Path | Exports | Purpose |
|---|---|---|
| `app/(app)/layout.tsx` | default `MigratedAppLayout({ children })` | Route-group layout (no URL impact). Fully self-sufficient shell for ALL migrated authenticated routes: `StrictMode` → `ErrorBoundary` → `AuthProvider authStateSource={supabase.auth}` → `ThemeProvider` → `QueryClientProvider` (5-min staleTime, 30-min gcTime, no refetchOnWindowFocus, retry 1) → `TooltipProvider` → `TerminologyProvider` → `RegionalSettingsProvider` → `FeatureProvider` → `SubscriptionProvider` → `TenantProvider` → layout-level `NextRouterAdapter` → `KeyboardShortcutsProvider` → `PostHogIdentity`, `OfflineStatusBanner`, `Toaster`, `Sonner`, `NextSeoManager`, `ShellWiring` (`useServiceWorkerUpdate`, `useOfflinePhase1Bootstrap`, `useOfflineOutboxWorker`, `setCurrentOfflineTenantSlug` effect), `AppStartupNavigator` (wraps `{children}`), `AssistantMount` (lazy `AIAssistant`, suppressed on tenant hosts), `GDPRConsentBanner`. **Do NOT duplicate providers per page — the layout covers every migrated route.** |
| `src/components/routing/NextRouterAdapter.tsx` | `NextRouterAdapter({ children })`, `buildAdapterLocation({ pathname, search?, hash? })`, `AdapterLocationInput` | Bridges react-router-dom v7 to Next.js navigation. See §3. |
| `src/components/routing/legacy-guards.tsx` | `RequireAuth({ children })`, `RequirePlanFeature({ feature, children })`, `LoadingScreen({ message? })` | Guards moved verbatim out of `src/App.tsx`. Behavior identical in SPA and App Router hosts. |
| `src/components/routing/AppStartupNavigator.tsx` | `AppStartupNavigator({ children })` | Next.js port of `useStartupNavigation`. Mounted once in the `(app)` layout; wraps `{children}` and renders `LoadingScreen` while startup routing is undecided. |
| `src/components/routing/NextSeoManager.tsx` | `NextSeoManager()` | Next.js port of the SPA `SeoManager` (uses `usePathname()`). Mounted in the `(app)` layout. |
| `src/components/routing/useSeoSync.ts` | `useSeoSync(pathname)` | The shared SEO DOM effect (title/meta/canonical/robots table). Single source of truth for both shells. |
| `src/lib/lazyRetry.ts` | `lazyRetry(factory, retries?)` | The `React.lazy` retry + stale-chunk recovery wrapper, extracted verbatim from `src/App.tsx`. |
| `src/lib/migratedRoutes.ts` | `MIGRATED_ROUTE_PREFIXES: string[]`, `MIGRATED_TENANT_ROUTE_PREFIXES: string[]`, `isMigratedPath(pathname)`, `isMigratedTenantPath(pathname)`, `getTenantSlugFromHostname(hostname)` | Migration registry + pure tenant-hostname resolution. See §5. |

Modified (behavior-preserving refactors): `src/App.tsx` (imports the guards, `lazyRetry`, and `useSeoSync` from their new homes; `RequireAuth`/`RequirePlanFeature`/`LoadingScreen`/`SeoManager` behave exactly as before), `src/ClientOnlyShell.tsx` (suppresses the SPA shell on migrated paths), `eslint.config.js` (one `allowExportNames` entry: `buildAdapterLocation`).

## 2. The page pattern (copy-pasteable)

Every migrated section gets ONE file: `app/(app)/<section>/page.tsx`.
It MUST start with `"use client"`. Import the legacy page component
**directly** — no `lazyRetry` (App Router code-splits per route automatically).

```tsx
"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct imports of legacy page components (no lazyRetry — App Router code-splits per route)
import Dashboard from "@/legacy-pages/Dashboard";
export default function DashboardPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/dashboard" element={<RequireAuth><RouteErrorBoundary section="Dashboard"><Dashboard /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
```

Rules for the page file:

- **Copy the guard composition EXACTLY from `src/App.tsx`.** If the SPA route is `<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="CRM"><CRM/></RouteErrorBoundary></RouteRoleGuard></RequireAuth>`, the migrated `<Route>` element must nest the same components in the same order. Import `RouteRoleGuard` from `@/components/security/RouteRoleGuard`, `RequireRole` from `@/components/security/RequireRole`.
- **Legacy page components are NEVER edited.** `src/legacy-pages/*` (and everything they import) is frozen. If a page needs something the new host doesn't provide, wrap it — do not modify it.
- **One migrated `<Route>` per page file**, except nested route trees that belong together (see §4).
- **Each migrated `<Route>` is REMOVED from `src/App.tsx`** in the same change — including its `lazyRetry` const at the top of `App.tsx` once no remaining SPA route references it. (Shared components like `Marketing`, used by both `/marketing` and `/growth-tools`, keep their `lazyRetry` const until their last route migrates.)
- The page-level `NextRouterAdapter` is **required** even though the layout also mounts one: the adapter is idempotent — when a router context already exists above, it renders children straight through instead of nesting routers (react-router throws on nested `<Router>`). Keep the page pattern exactly as above; it works standalone and under the layout.

## 3. `NextRouterAdapter` — public API and guarantees

```tsx
NextRouterAdapter({ children }: { children: React.ReactNode })
buildAdapterLocation({ pathname, search?, hash? }: AdapterLocationInput): Location
```

- **Location source:** react-router's low-level `<Router>` is driven by a `location` built from Next's `usePathname()` + `useSearchParams()`; `window.location.hash` is synced via `useSyncExternalStore` (SSR-safe, no hydration mismatch).
- **Navigation:** the custom `Navigator` forwards `push`/`replace` to Next's `useRouter().push/replace`; `go(delta)` falls back to `window.history.go(delta)`. Types match react-router v7's `Navigator`/`RouterProps` exactly.
- **`<Link>`, `useNavigate`, `useParams`, `useLocation`, react-router's `useSearchParams`, `useHref`, `<Navigate>`** all work unchanged — `useNavigate` resolves against the custom navigator, so legacy code needs zero changes.
- **Navigation state shim:** Next.js has no `location.state`. `navigate(to, { state })` and `<Navigate state={...}>` store the state in a module-level `Map` keyed by the destination href (`createPath(to)`); the adapter exposes it as `location.state` on render. Entries are overwritten on every push/replace to the same href (mirrors history-entry semantics). This is what makes flows like `/quick-service` → `<Navigate to="/appointments" replace state={{ openNewAppointment: true }} />` → `location.state` in `Appointments.tsx` keep working.
- **Accepted deltas (intentional, audited):** `useNavigationType()` always reports `"POP"` under the adapter (no legacy page/component uses it — verified); `location.key` is always `"default"` (no readers in legacy pages — verified); `useBlocker`/data-router APIs are unavailable under the low-level `Router` (no usages — verified). The state map is keyed by href string, so exotic query-param encodings that Next normalizes differently could miss on read (falls back to `null`, same as no state).

## 4. Detail routes, nested routes, and redirects

**Detail routes (`:id` params).** The Next.js file path only decides *which page renders*; the react-router `:param` syntax stays inside the adapter:

```tsx
// app/(app)/customers/[id]/page.tsx
"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
import CustomerDetail from "@/legacy-pages/CustomerDetail";
export default function CustomerDetailPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/customers/:id" element={<RequireAuth><RouteErrorBoundary section="Dashboard"><CustomerDetail /></RouteErrorBoundary></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}
```

Rule: the Next segment name SHOULD mirror the SPA param (`[id]` ↔ `:id`) but the adapter is authoritative — `useParams()` reads from the `<Route path>`, not from Next params. The two must describe the same shape.

**Nested route trees** (e.g. `/tech-app` with 15 children, `/fleet-os/*`): use a Next catch-all segment and keep the whole nested `<Route>` tree in ONE page file:

```tsx
// app/(app)/tech-app/[[...segments]]/page.tsx
<NextRouterAdapter>
  <Routes>
    <Route path="/tech-app" element={<RequireAuth><RouteErrorBoundary section="Tech App"><TechAppLayout /></RouteErrorBoundary></RequireAuth>}>
      <Route index element={<TechToday />} />
      <Route path="jobs" element={<TechJobs />} />
      {/* …all children copied verbatim from src/App.tsx… */}
    </Route>
  </Routes>
</NextRouterAdapter>
```

**Redirect routes: keep `<Navigate>` inside the adapter.** Do NOT rewrite redirects with next/navigation's `redirect()`. The adapter's navigator turns `<Navigate to="/x" replace />` (and `navigate("/x", { replace: true })`) into `nextRouter.replace("/x")`, so SPA redirect routes (`/auth` → `/login`, `/technician-os` → `/team-os`, `/quick-service` → `/appointments` with state, etc.) migrate by copying the `<Route>` verbatim:

```tsx
<Route path="/auth" element={<Navigate to="/login" replace />} />
```

(Rationale: `redirect()` from `next/navigation` throws during render and can't carry react-router `state`; `<Navigate>` preserves both, including the state shim in §3.)

## 5. The prefix registry (`src/lib/migratedRoutes.ts`)

`ClientOnlyShell` mounts the legacy SPA shell for a path **unless**:

- `isMigratedPath(pathname)` — `pathname` matches `MIGRATED_ROUTE_PREFIXES`, or
- the hostname resolves to a tenant slug (via `getTenantSlugFromHostname`, a pure replication of `resolveTenant`'s hostname branch: lowercase/trim, skip `localhost`/`127.0.0.1`/`servicewriter.xyz`/`www.servicewriter.xyz`, require `.{slug}.servicewriter.xyz`, slug must match `^[a-z0-9-]+$`, skip reserved infrastructure subdomains via `isReservedSubdomain` — so `auth.servicewriter.xyz` still renders normal app routes) **and** `isMigratedTenantPath(pathname)` — `pathname` matches `MIGRATED_TENANT_ROUTE_PREFIXES`.

**Prefix rule — follow it exactly:**

1. When you add `app/(app)/<section>/page.tsx`, append the section's root prefix to `MIGRATED_ROUTE_PREFIXES` **in the same change**. Never add a page without its prefix (the SPA would double-mount and fight the page for the URL); never add a prefix without its page (users would get a blank catch-all).
2. Matching is **segment-aware**: `/customers` matches `/customers` and `/customers/123` but NOT `/customers-foo`.
3. Migrating `/tech-app` (or any subtree) needs only `"/tech-app"` — children match by prefix. Add `"/customers"` once to cover `/customers/:id`; the `[id]` page file still declares its own full `<Route path="/customers/:id">`.
4. Tenant-subdomain routes use `MIGRATED_TENANT_ROUTE_PREFIXES` with the same rule. The tenant branch of `src/App.tsx` serves `/customer/dashboard`, `/customer/auth`, `/fleet-manager`, `/fleet-manager/auth`, `/my-bookings`, `/booking-success`, `/messaging-preferences`, `/services`, `/subscribe`, `/embed/services`, `/embed/subscribe`, `/embed/booking`, and catch-all `*` → `TenantBooking`. Migrate the concrete paths first; the catch-all stays SPA-served until a tenant catch-all page exists.
5. Both lists start empty (`[]`) — empty means today's behavior: the SPA serves everything. Section workers grow the lists.

## 6. Startup navigation (`AppStartupNavigator`)

The `(app)` layout mounts `AppStartupNavigator` around `{children}`. It is a faithful port of the `useStartupNavigation` hook (same `isReady` memo, same `resolveStartupRoute`/`safeNextPath`/store/gate inputs, same `router.replace` destinations), with two mechanical translations: `useLocation()` → `usePathname()`, `navigate(dest, { replace: true })` → `nextRouter.replace(dest)`. It handles customer-portal users → `/customer/dashboard`, `requiresOnboarding` → `/onboarding`, `requiresPlan` → `/plans`, persisted `intendedPath`, and role landing paths — and renders the same `LoadingScreen` ("Opening your workspace...") while blocking, instead of the page. It is `enabled` only on non-tenant hosts, exactly like the SPA. It uses `useSearchParams()`, so the layout wraps it in `<Suspense>` — do not mount it outside a Suspense boundary.

## 7. What the layout deliberately does NOT replicate

- The module-level `vite:preloadError` / `unhandledrejection` stale-chunk listeners from `src/App.tsx` live in `src/lib/lazyRetry.ts` and run on import — both shells get them. (Direct, non-lazy imports in migrated pages are covered by Next's own chunk handling.)
- `HomeRoute`'s anonymous-vs-authenticated homepage fork stays SPA-only (`/` is not migrated).
- `document.title`/meta behavior for migrated paths is preserved via `NextSeoManager` + the shared `useSeoSync` table.

## 8. Verification checklist (per section PR)

- [ ] `app/(app)/<section>/page.tsx` follows §2 (verbatim guard composition, direct component imports, `"use client"`).
- [ ] Prefix added to `MIGRATED_ROUTE_PREFIXES` (or the tenant list) in the same change (§5).
- [ ] Migrated `<Route>`(s) removed from `src/App.tsx`; orphaned `lazyRetry` consts removed.
- [ ] Legacy page components untouched (`git status` shows no changes under `src/legacy-pages/`).
- [ ] `npx tsc --noEmit` clean.
- [ ] `npx eslint` clean on touched files.
- [ ] Manual: visit the migrated path logged-out → lands on `/login`; logged-in with wrong role → `AccessDenied` (no bounce); deep link with `?next=`/startup flow behaves as in the SPA.
