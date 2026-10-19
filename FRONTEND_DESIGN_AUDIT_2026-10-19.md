# Service Writer — Senior Frontend Design Audit

**Audit date:** 2026-10-19
**Auditor role:** Senior frontend / product design engineer
**Repository:** `djoreally/ServiceWriterFinal` @ `01f6022` (branch `arena/6e532ee3-servicewriterfinal`)
**Scope:** 100% frontend — visual design system, UX/IA, component architecture, accessibility, frontend performance. **Zero backend, database, or business-logic changes were made or proposed.**
**Explicit mandate:** the redesign may consume *existing* data points that the UI does not currently display, as long as no endpoint, command, RPC, or schema changes.

---

## 1. Executive summary

Service Writer is a multi-tenant service-operations platform (booking → dispatch → technician execution → invoice → payment) with an unusually strong **frontend discipline foundation already in place**: a written UI contract (`docs/FRONTEND_UI_CONTRACT.md`), a build-enforcing contract script, a semantic token layer with light/dark themes, a five-size/two-weight type system, and canonical page primitives.

The gap is not the absence of a design language — it is **adoption, consolidation, and craft**:

- Only **14 of 103 legacy pages use the canonical page primitives**; the rest hand-roll layout.
- There are **7 different navigation/chrome components** and **2 duplicated provider stacks** as a side effect of the SPA → App Router migration.
- **~894 arbitrary Tailwind values, 265 inline styles, 208 hard-coded `text-white`/`bg-white` classes, and 37 files with raw hex colors** bypass the token system.
- Two **conflicting radius scales ship in production** (6/10/10px in `index.css` vs 4/8/16px in `radius.css`).
- Data the frontend **already fetches is not rendered** (dashboard 7-day lookahead, churn risk, technician utilization, payment refunds/fees), while screens still show persistent dead panels ("Could not load map") in prime positions.
- **Dead UI code** reads as product surface: `useReportsData`/`useReportsFilters` (330+ lines), `DashboardMetrics`, `RevenueChart`, `ServiceBreakdownChart`.

**Overall grades**

| Area | Grade | Comment |
|---|---|---|
| Design tokens & theming | **B−** | Mature semantic layer, but duplicate/contradictory scales and 3 bypass paths (hex, inline, arbitrary) |
| Component architecture | **C+** | Solid shadcn/Radix core; low adoption of canonical primitives; monolith pages up to 1,830 LOC |
| UX / information hierarchy | **C+** | Contract rules are right; screens stack 3–4 header layers; error surfaces outrank content |
| Accessibility | **B−** | Good bones (aria-current, focus rings, labels); real failures in KPI contrast, overlays, target consistency |
| Frontend performance | **C+** | Lazy routes done well; render-blocking font import, dual toasters, dual QueryClients, no chart lazy-loading strategy |
| Code health (gates) | **A−** | Typecheck PASS; all 7 prebuild contract gates PASS |
| Code health (hygiene) | **D+** | 40 lint errors; 121 pre-existing failing tests in 42 suites; dead code; two non-npm tarball pins |

**Verdict:** the product looks "clean but generic 2023-SaaS." It does not yet express the quality bar of the business (fleet dispatch that competitors can't do, vehicle-spec intelligence). The redesign should be executed as a **contract-preserving modernization**: same routes, same data layer, same guards — new surfaces. Nothing in this audit requires a single backend change.

---

## 2. Verified baseline (evidence)

Run inside this checkout on 2026-10-19 (Node 22 sandbox; repo declares `node: 24.x`):

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** (0 errors) |
| `scripts/check-frontend-ui-contract.mjs` | **PASS** |
| `scripts/check-architecture-contract.mjs` | **PASS** |
| `scripts/check-identity-contract.mjs` | **PASS** |
| `scripts/certify-crud-contract.mjs` | **PASS** |
| `scripts/certify-email-lifecycle.mjs` | **PASS** |
| `scripts/certify-onboarding-contract.mjs` | **PASS** |
| `scripts/certify-regression-lock.mjs` | **PASS** |
| `npm run lint` (eslint --quiet) | **40 errors** (0 warnings), all pre-existing |
| `npm test` (jest --runInBand) | **1,924 passed / 121 failed / 3 skipped**, 42 failed suites of 225, all pre-existing |

Lint error histogram: `react-hooks/set-state-in-effect` ×27, `no-restricted-imports` (stripe SDK outside edge) ×8, `react-hooks/refs` ×1, `react-hooks/purity` ×1, `react-hooks/preserve-manual-memoization` ×1, `prefer-const` ×1, `no-var` ×1.

Failing test families (regression baseline the redesign must not grow): `__journeys__` (auth-routing, public-booking, dispatch-tech, fleet, monetization-settings, reports-inventory), `ThemeProvider.test.tsx`, booking configuration/pricing units, offline phase-5 outbox QA, server API-route suites, several command/query suites.

Supply-chain note (dev-ops finding, frontend-adjacent): `xlsx` is pinned to `https://cdn.sheetjs.com/…tgz` and 5 packages (`lint-staged`, `picomatch`, `side-channel`, `side-channel-list`, `tinyexec`) are pinned to a Lovable artifact-registry mirror. Environments without access to those hosts cannot `npm ci`. I worked around this **locally only** to produce the verified baseline above and restored both manifest files afterward.

Code volume: 607 `.tsx` under `src/` + 143 route files under `app/`; 103 legacy page components; ~139.7k lines of TSX. Largest files: `Settings.tsx` 1,830 LOC, `PublicBooking.tsx` 1,637, `Quotes.tsx` 1,537, `FleetWorkOrderDetailPage.tsx` 1,408, `VehicleDetail.tsx` 1,383.

---

## 3. The architecture you are redesigning inside (constraints that cannot break)

1. **Two routers, one component set.** The authenticated product renders through BOTH:
   - `app/(app)/**/page.tsx` — Next.js App Router route files that import the **same** `src/legacy-pages/**` components and mount them via `NextRouterAdapter` + react-router `<Routes>`;
   - `app/[[...path]]` catch-all → `NextClientShell` → `src/App.tsx` legacy `BrowserRouter` SPA (139 routes).
   → Any component change lands in **both** shells simultaneously. This is why a visual modernization can be done without touching routing or data.
2. **Duplicated provider stacks.** `app/(app)/layout.tsx` replicates `src/App.tsx`'s provider tree (own `QueryClient`, `AuthProvider`, `ThemeProvider`, tenant, subscription, feature flags…). Two `QueryClient` instances → **cache does not survive** SPA↔App-Router transitions. Header/skeleton assumptions must be tested in both shells.
3. **The UI contract is build-enforced.** `check-frontend-ui-contract.mjs` runs in `prebuild` and fails Vercel builds on: non-system default theme, unscoped theme storage, a second Settings tab strip, Settings in mobile bottom nav, non-tabular table numerals, lucide icons in `DashboardCockpit`, icon metadata in nav items, and `bg-gradient` in 10 listed operational files. The redesign must pass it — or amend it in the same PR that teaches it the new rules.
4. **Role/plan gating is presentation-layer but load-bearing.** `RequireAuth`, `RequireRole`, `RouteRoleGuard`, `RequirePlanFeature`, `canAccessRoute`, `canWrite` drive what nav items, KPIs, and CTAs render. Redesigns must consume these, never duplicate them.
5. **Embeds are external-facing.** `TenantBooking` publishes `servicewriter:booking-resize` postMessages with a pinned payload shape (`type` + `height` only) — any booking-flow restyle must keep observer + message code byte-compatible.
6. **Offline-first machinery is mounted globally** (outbox worker, phase-1 bootstrap, status banner, pull-to-refresh). Visual work must not unmount or permanently obscure these.

---

## 4. Design-system audit

### 4.1 What is strong (keep)

- **Semantic token families beyond shadcn defaults:** financial (`revenue-positive/neutral/negative`), operational status (scheduled/in-progress/completed/awaiting/po-pending/payment-captured/failed), logistics, alerts, sidebar — each with `bg`/`fg` pairs for light AND dark. This is genuinely rare at this company stage.
- **Type doctrine** (`typography.css`): 5 sizes (13/16/20/25/32, ratio 1.25), 2 weights, 3 text colors, tabular numerals, 45–75ch measure — written as rules, and enforced in tables by the contract script.
- **Radius doctrine** (`radius.css`): concentric corners, pill-is-a-shape, bottom-sheet rule — the best-articulated piece of the system.
- **Page primitives** (`PagePrimitives.tsx`): `PageContainer/PageHeader/PageToolbar/Section/Panel/ResponsiveGrid/EmptyState/StickyActionBar` — exactly right for an ops console.
- `ResponsiveTable` with priority columns + card transformation, `ListPagination`, row-selection + undo, clickable-contact, commit-button/autosave/inline-edit primitives: the makings of a real application framework.

### 4.2 Conflicts and defects

| # | Finding | Evidence |
|---|---|---|
| D1 | **Two radius scales coexist.** `index.css` sets `--radius-sm:6px; --radius-md:10px; --radius-lg:10px; --radius-xl:12px` (plus `--radius:.625rem` feeding Tailwind `rounded-*`), while `radius.css` sets `--radius-sm:4px; --radius-md:8px; --radius-lg:16px`. Both load globally from `app/layout.tsx`; the un-layered `radius.css` values silently win over `@layer base`. One system, two truths. | `src/index.css` vs `src/components/ui/radius.css` |
| D2 | **Token bypass is the norm, not the exception.** 894 arbitrary-value classes (`w-[…]`, `text-[…]`…), 265 inline `style={{}}`, 208 raw `text-white`/`bg-white`/`bg-black`/`text-black`, 37 TSX files containing raw `#rrggbb`. | repo-wide grep, 2026-10-19 |
| D3 | **Residual gradients** in 8 files, incl. operational pages (`VehicleDetail`, `PublicSubscriptions`, `CustomerDashboard`, `VehicleStep`, `AdminLogin`, `PaymentSuccess`…). The contract script only guards 10 named files, so these pass today. | `grep bg-gradient` |
| D4 | **Font loading is render-blocking external CSS** (`@import fonts.googleapis.com` inside `index.css`), no `font-display` control, no self-hosting; adds a blocking request before first paint on every cold load. | `src/index.css:8` |
| D5 | **Duplicate radius token names across files** (D1) plus duplicated raw families (`--surface*`, `--text-*`, `--accent-*`) that partially mirror the HSL tokens — three ways to say the same color. | `src/index.css` `:root` |
| D6 | **Chart theming is per-component** (`chart.tsx`, `AnimatedChartFrame`, hard-coded series colors); no `--chart-*` token family; several chart components (`RevenueChart`, `ServiceBreakdownChart`, `DashboardMetrics`) are **dead code**. | `src/components/ui/chart.tsx`, `src/components/dashboard/` |
| D7 | Type utility naming glitch: `.type-mut-soft` (typo relative to `type-secondary`/`type-primary` family); doctrine says "three text colors" but ships a fourth opacity-based class. | `typography.css` |
| D8 | **Adoption failure:** `PagePrimitives` used by 14/103 pages; 64 use `AppLayout`; the remaining pages hand-roll containers/headers, producing the drift the contract was written to prevent. | grep counts |

### 4.3 Chrome & navigation

- **Seven** layout components implement product chrome: `Sidebar`, `MobileNav`, `TopHeader`, `BottomNavBar`, `FleetSidebar`, `FleetMobileNav`, `FleetBottomNavBar` (+ `FleetOSLayout`, `MarketingSiteChrome`). One nav config (`navItems.ts`, role-filtered — good) is rendered by multiple hand-built surfaces, so every visual change must be made N times. This is the single highest-leverage consolidation.
- `BottomNavBar` is role-aware (admin/manager/dispatcher) — correct pattern, keep.
- The desktop header search input **is not wired to the `GlobalCommandPalette`** visibly; the palette has no discoverable affordance (no ⌘K hint). The header right cluster (`workspace switcher → theme → bell → avatar+name`) overflows on ~1280px viewports when the workspace name is long.
- "Toast history" chip renders fixed bottom-left and **overlaps the sidebar**; AI assistant FAB bottom-right; `OfflineStatusBanner` + PWA update prompts compete for the same edges. No overlay priority system.

### 4.4 Deep-dive screens

**Dashboard (`DashboardCockpit`)** — already the best screen: text pulse line, 4 KPIs max, attention queue, today's work in 2 columns, collapsible revenue detail. Issues: KPI trend math computed but barely surfaces (`revenueTrend` unused); **`upcomingNext7` is fetched and never rendered**; attention queue handles only the unpaid-invoice case; no visualization of week/month (data exists); header action row wraps awkwardly <sm. Screenshot evidence: `public/homepage-dashboard-redacted.png`.

**Appointments** — 4 stacked chrome layers (offline/export row → Appointments/Dispatch-Board toggle → Upcoming(7d)/All-Appointments pill bar → H1+search/`+`), then a full-width List/Day/Month tab strip. The page title duplicates the top header title. Month cells carry appointment bars with weak contrast (cyan-on-white). Evidence: `public/homepage-schedule-redacted.png`.

**Appointment detail** — Vehicle Service Specifications card occupies the entire first viewport (this is the product's moat data — good instinct), but: `Service Location` panel shows a **persistent "Could not load map"** state in prime position instead of collapsing; `Provider Sync` card with red `unreachable` badge + full-width CTA reads as an error the operator must fix on every visit; `Timeline` — the story of the job — is demoted below the fold in the right rail. Evidence: `public/homepage-job-detail-redacted.png`.

**Reports** — the most data-rich and least disciplined surface: 7 ranges × scope toggle × 7+ fetchers (`fetchReportsCanonical`, funnel, location demographics, customer analytics, technicians, fleet report, raw pivot records, audit). Renders dense StatCards/tables with per-component colors. Meanwhile the legacy `useReportsData` hook (330 LOC) with rich fields **has zero importers** — dead.

**Settings** — compliant with the single-rail rule, 8 categories / 40+ sections, but implemented as one 1,830-LOC file with per-section components up to 1,184 LOC (`PaymentSettings`). IA is fine; the file structure is the defect (code-splitting, ownership, testability).

**Customers** — good `ResponsiveTable` usage; `company_name`, `created_at`/`updated_at` from the API schema are unused (no "New" badge, no company display, no sort by recency) — available without backend change.

**Tech app / field / fleet** — separate, mobile-lean surfaces; they reuse tokens but not `PagePrimitives`; technician surfaces are the daily-driver screens and deserve first-wave polish per `ROADMAP.md`.

### 4.5 Accessibility

Passes observed: `aria-current` in bottom nav, table caption-able headers, labeled icon buttons (`aria-label` on row actions), visible focus rings (`focus-visible:ring-2`), semantic empty/loading states with `aria-busy`, 44px touch targets on canonical nav (`min-h-11`).

Failures/risks:

| # | Issue | Where |
|---|---|---|
| A1 | **KPI "attention" value `text-amber-500` on white ≈ 2.5:1** — fails WCAG AA (3:1 large text). Dark theme passes. | `DashboardCockpit.tsx` |
| A2 | Status communicated by pill color in some surfaces uses muted custom classes instead of the tokenized `status-*` family — drift in semantics AND contrast. | various legacy pages |
| A3 | Sticky/fixed overlays (`Toast history`, FAB, offline banner) have no managed z-index scale or collision rules; chip overlaps sidebar content and can cover focus targets. | global chrome |
| A4 | `prefers-reduced-motion` not honored by custom animation utilities (`tailwindcss-animate`, count-up hooks). | global |
| A5 | Some `text-[11px]` usages (workspace role badges) below comfortable minimum for operational UI. | `TopHeader` |

### 4.6 Frontend performance

- ✅ Route-level code splitting via `lazyRetry` in the SPA; App Router pages split per route; AI assistant deferred behind its own Suspense boundary.
- ⚠️ Render-blocking Google Fonts `@import` (D4).
- ⚠️ Two toast systems mounted globally forever (`ui/toaster` radix + `ui/sonner`) — two portals, two styles; consolidation is a pure-frontend change (call-site APIs can be preserved via adapter).
- ⚠️ Dual `QueryClient`s (§3.2): full refetch when crossing shells; normalization is an SPA-migration artifact — document, don't "fix" blindly.
- ⚠️ Recharts is imported in several always-loaded pages; no shared lazy `<ChartFrame>` boundary.
- ⚠️ `style={{}}` inline objects re-created per render (265) — mostly harmless, but on hot lists (DispatchBoard 1,217 LOC, tables) this is measurable.

---

## 5. Available-but-unused data points (redesign fuel — zero backend change)

All of these already flow through **existing** queries/hooks (live code paths, workspace-scoped). Using them is presentation-only.

| Surface | Data point | Already fetched by | Today | Redesign use |
|---|---|---|---|---|
| Dashboard | `upcomingNext7` (appointments next 7 days with status/cost) | `dashboard-cockpit.query` | **fetched, 0 renderers** | "Next 7 days" strip w/ load forecast per day |
| Dashboard | `revenueWeek/Month/YTD` + `revenueTodayPrev/MonthPrev` | same | collapsible detail only | KPI sparklines + WoW/MoM delta chips |
| Dashboard/CRM | `customer_segment`, `churn_risk`, `lifetime_value`, `average_order_value`, `days_since_last_service` | canonical report/customer-analytics queries | reports tab only | "Customers at risk" attention item; LTV badges in customer list |
| Team/Dispatch | `utilization_rate`, `avg_duration_minutes`, `jobs_total/completed` (`techPerformance`) | `useReportsData` (dead) | **never rendered** | Technician load cards on Dispatch; dashboard "Team today" |
| Dispatch | `travel_time_minutes`, `duration_minutes`, `actual_start_time/end_time` per appointment | appointments/reports queries | hidden | Route-load bars; "running late" indicators (variance actual vs scheduled) |
| Geography | `customer_postal_code`, `location_address` on appointments | reports queries | location tab only |热力/z zip-density chips for service-area decisions |
| Finance | `tax_amount`, `refund_amount`, `platform_fee`, `subtotal`, `payment_type` on payments | reports queries | raw tabs | Payment list badges (refunded/fee), financial summary polish |
| Vehicles | `mileage`, `engine`, `oil_type`, `updated_at` (+ service specs moat) | fleet/report queries | specs card only | "Prep card" reuse on work orders; stale-vehicle flags |
| Customers list | `company_name`, `created_at`, `updated_at` (API schema) | `customers.query` | parsed, unused | Company display, "New" badge, recency sort |
| Cockpit quality | `jobsCompletedToday`, appointment statuses | `dashboard-cockpit.query` | KPI hint text | Day-progress ring/bar in Today header |

> Boundary rule for the plan: enrichment = **compose existing query modules client-side** (they already exist in `src/application/queries/**`). Do NOT create new API routes, RPCs, joins server-side, or payload shape changes.

## 6. Dead code to remove during the refactor (verified zero-importer)

- `src/hooks/useReportsData.ts` (330 LOC) + `useReportsFilters.ts` — superseded by `fetchReportsCanonical` path.
- `src/components/dashboard/DashboardMetrics.tsx`, `RevenueChart.tsx`, `ServiceBreakdownChart.tsx` — no importers outside their folder.
- `src/material-color-system.css` (120 LOC) — imported once by `app/layout.tsx`, defines a parallel tonal family nothing references (verify, then merge-or-delete).
- Duplicate toast primitives after consolidation (keep call-site adapters).

---

## 7. Risk register for the redesign

| Risk | Likelihood | Mitigation |
|---|---|---|
| Visual change breaks `check-frontend-ui-contract` (build gate) | High if ignored | Contract rules amended in the same PR, script extended, never weakened silently |
| SPA + App Router shells render differently (padding, provider timing) | Medium | Visual regression screenshots per screen in both shells; shared primitives |
| Offline/toast/embed invariants broken by chrome restyle | Medium | Keep mount points + `BOOKING_RESIZE_MESSAGE` protocol untouched; e2e specs green |
| Jest failures grow beyond the 121-failure baseline | Medium | Baseline file + CI delta check before merge of every phase |
| Token value changes cascade to 600 files | Low–Medium | Tokens are CSS variables — rename-free value updates; sweep dark mode with screenshot diff |
| Radius unification alters every component's corners subtly | Medium | Ship behind one PR + full screenshot diff review; document as intentional |
| `Settings.tsx` split introduces state-loss bugs (unsaved forms) | Medium | Split by category boundary only; keep each section component byte-identical initially |

---

## 8. Scores by surface (designer rubric: IA 25%, hierarchy 25%, consistency 25%, state craft 25%)

| Surface | Score | Note |
|---|---:|---|
| Dashboard | 72% | Best screen; missing trends + 7-day lookahead |
| Customers | 70% | Solid table; unused identity fields |
| Appointments | 55% | Chrome stacking ruins hierarchy |
| Appointment detail | 58% | Right idea (specs first), wrong state priorities |
| Reports | 50% | Powerful, undisciplined, dead sibling hook confuses |
| Settings | 62% | Good IA, monolith implementation |
| Global chrome | 60% | Seven nav components, palette invisible, overlay collisions |
| Public/tenant booking | 65% | Contract-style embed invariants; polish opportunity (top of funnel) |
| Marketing pages | — | Explicitly allowed separate art direction; out of contract scope |

---

*Next document: `FRONTEND_REFACTOR_PLAN_2026-10-19.md` — the phased plan of action.*
