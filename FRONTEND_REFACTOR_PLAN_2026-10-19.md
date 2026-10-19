# Service Writer — Frontend Redesign: Plan of Action

**Date:** 2026-10-19
**Companion document:** `FRONTEND_DESIGN_AUDIT_2026-10-19.md` (evidence & baseline)
**Structure:** hard constraints → design direction → phased execution → verification gates → risk/rollback

---

## 0. Hard constraints (read first)

1. **No backend changes.** Nothing under `app/api/**`, `src/server/**`, `supabase/**`, RPCs, migrations, seeds.
2. **No database changes.** No schema, RLS, grants, or data rewrites. Frontend reads only through existing query modules (`src/application/queries/**`) and commands it already uses.
3. **No business-logic changes.** `src/domain/**`, `src/application/commands/**`, auth/RBAC policy (`access-policy`, `RequireAuth/RequireRole/RouteRoleGuard/RequirePlanFeature`), pricing, booking, offline sync, and embed protocols stay as-is. Touching a file in these areas requires explicit justification in the PR.
4. **Cannot break the app.** Every phase must keep the 7 prebuild gates green, keep TypeScript green, not grow the lint-error count above **40**, and not grow the failing-jest-test count above the **121-failure baseline** (both recorded 2026-10-19).
5. **Unused data points are allowed** per mandate — surfaced by composing *existing* queries client-side (§5 of the audit). No new endpoints, no payload changes.
6. **Contract first.** `docs/FRONTEND_UI_CONTRACT.md` + `scripts/check-frontend-ui-contract.mjs` are the law. Where the redesign needs a new rule (chart palette, motion, overlay z-scale), the rule is *written into the contract and enforced by the script* in the same PR.

**Allowed-to-change surface:** `src/components/**`, `src/legacy-pages/**`, `src/index.css`, `src/material-color-system.css`, `tailwind.config.ts`, `app/**/page.tsx` + layouts (presentation only), `src/hooks` (UI-only hooks), `docs/FRONTEND_UI_CONTRACT.md`, `scripts/check-frontend-ui-contract.mjs`, tests for UI, tooling configs for frontend quality.

---

## 1. Design direction (north star)

**"The shop's instrument panel."** An operations console with the density and honesty of aviation instruments — not marketing chrome. Everything the contract already says, now fully enforced:

1. **Text and numbers are the interface.** One accent (blue), semantic color only for state, tabular numerals everywhere money/time appears.
2. **Information hierarchy by sentence, not by card.** Every screen answers one question first ("how is today going?"), then supports drill-down.
3. **State craft over static craft.** Loading, empty, error, offline, and sync states are designed surfaces with one recovery action — never dead panels ("Could not load map" days are over).
4. **The moat is visible.** Vehicle-service-spec intelligence and dispatch-status truth get premium placement, consistently framed.
5. **Density discipline.** 8pt grid, five type sizes, one radius scale (concentric), no arbitrary values in operational surfaces.
6. **The system enforces itself.** What the contract can't grep, the component layer makes impossible (primitives with no escape hatch for one-off values).

**Visual signature upgrades (token-level, theme-safe):** consolidate to the 4/8/16 concentric radius scale; refresh elevation tokens (flatter, border-forward); define `--chart-1..5` categorical + `--chart-trend-up/down` tokens for both themes; KPI numerals get a true numeric emphasis treatment (size + tabular + optional delta chip); introduce an overlay/motion token layer (`--z-*`, durations/easings, `prefers-reduced-motion` honored).

---

## 2. Phased execution plan

Estimates assume 1 senior frontend engineer/designer, PR-per-slice, no backend dependency.

### Phase 0 — Safety net (0.5–1 wk) *(no visual change)*

| Step | Detail |
|---|---|
| 0.1 | Record baselines in `docs/frontend-baseline-2026-10-19.json`: lint errors = 40, jest failures = 121 (list of 42 suites), gate outputs, `tsc` status. Add a verify script (e.g. `scripts/verify-frontend-delta.mjs`) that fails when lint/jest regress beyond baseline. |
| 0.2 | Visual regression net: Playwright screenshot suite for the 20 contract-critical screens (walkthrough checklist) in **both shells** (`/dashboard` via `(app)` route vs SPA fallback), light + dark, 1440/390 breakpoints. Upload diffs as PR artifacts. |
| 0.3 | Fix the supply-chain pins so any machine can install: repin `xlsx` to the npm-hosted line and repoint the 5 Lovable-mirror tarballs to npm equivalents (lockfile-only change; verified locally during this audit). |
| 0.4 | Restore local validation in CI note: `npm run typecheck && npm run lint && npm test` delta-gate usage documented in `AGENTS.md`-adjacent contributor note. |

**Exit:** baseline files committed; screenshot suite runs; install works from npm registry only.

### Phase 1 — Token foundations (1 wk) *(visual change: subtle, global)*

| Step | Detail |
|---|---|
| 1.1 | **Unify radius**: one scale `--radius-sm/md/lg = 4/8/16` (concentric doctrine from `radius.css`); Tailwind `rounded-*` mapped from the same vars; delete the duplicate 6/10/10/12 block in `index.css`. Screenshot-diff review for corner changes. |
| 1.2 | **Font self-hosting**: replace Google Fonts `@import` with self-hosted Inter via `next/font` (or vendored woff2 + `@font-face` with `font-display: swap`). Removes the render-blocking external request. |
| 1.3 | **Token consolidation**: collapse `--surface*`, `--text-*`, `--accent-*` raw duplicates into aliases of the semantic HSL families; fix `.type-mut-soft` naming; add `--chart-*`, `--z-*`, motion tokens. |
| 1.4 | **A11y fix**: attention/amber values move to `text-amber-600` (light) / `amber-400` (dark) via a `--attention-fg` token — kills the 2.5:1 WCAG failure on KPIs (A1). |
| 1.5 | **Contract v2**: amend `FRONTEND_UI_CONTRACT.md` with the single radius scale, chart palette, z-overlay scale, motion rules; extend `check-frontend-ui-contract.mjs` to fail on **new** raw hex / `bg-gradient` / `--radius` redefinitions in operational surfaces (ratchet: violation counts may only go down — encode the current counts in the script). |

**Exit:** prebuild gates pass; screenshots show only intended diffs; WCAG AA on all KPI numerals.

### Phase 2 — App shell & navigation consolidation (1.5–2 wks)

| Step | Detail |
|---|---|
| 2.1 | **One `AppShell`**: `Sidebar + MobileNav + TopHeader + BottomNavBar` collapse into a single config-driven chrome (`navItems.ts` stays the source of truth — role filtering untouched). Fleet chrome (`FleetSidebar/MobileNav/BottomNavBar`) becomes a variant of the same shell. 7 components → 2 (shell + marketing chrome). |
| 2.2 | **Header**: workspace switcher, ⌘K-hinted search button that opens the existing `GlobalCommandPalette`, notification bell, avatar menu. Name/email block truncates cleanly; no overlap at 1280px. |
| 2.3 | **Overlay manager**: toast-history chip, AI FAB, offline banner, PWA prompt get a z-scale and corner ownership rules (bottom-left = status, bottom-right = actions). Toast chip no longer overlaps the sidebar. |
| 2.4 | **Page header unification**: `PageHeader` becomes the ONLY page title; AppLayout-level H1 duplication removed (fixes Appointments double titles and the 4-layer header stack). |
| 2.5 | Keep both shells (`(app)/layout.tsx`, SPA) rendering the same `AppShell`; add screenshot coverage for SPA↔App-Router transition of the same screen. |

**Exit:** nav renders identically in both shells; e2e pass; zero duplicate page titles; gates green.

### Phase 3 — Primitive adoption & state kit (2 wks) *(codemod-heavy)*

| Step | Detail |
|---|---|
| 3.1 | **Codemod to `PageContainer/PageHeader/Section/Panel` on all 103 legacy pages** (14 → 103). Mechanical: container/header extraction, then manual pass only on the 9 biggest files. |
| 3.2 | **State kit**: one `LoadingState/EmptyState/ErrorState/OfflineState` family built on existing primitives; every list/detail gets loading + error + empty (contract rule 8 enforced by review + a lint rule for pages missing states). |
| 3.3 | **Toast consolidation**: single toast system (keep `sonner` UX); `ui/toaster` API becomes an adapter re-export so call sites don't change — one portal, one style. |
| 3.4 | **Field primitive**: `FormField` (label + control + hint + error) adopted in the five worst forms; labels never hidden (contract rule 6). |
| 3.5 | **Lazy chart frame**: shared `<LazyChart>` boundary around recharts usage; define chart palette from `--chart-*` tokens; proves out on the two live chart consumers before Phase 4 dashboards. |

**Exit:** 100% `PagePrimitives` adoption; one toaster; charts unified; no new lint errors.

### Phase 4 — Surface redesign waves (4–5 wks)

Each wave ships independently behind screenshot review. Redesigns use **existing data only** (audit §5).

**Wave 4.1 — Dashboard & Today (owner home).**
- Replace the flat KPI row with KPI + delta chip + 7-pt sparkline (data: `revenue*Prev` pairs already in `CockpitData`).
- Render **`upcomingNext7`** as a "Next 7 days" load strip (days × jobs × est. revenue).
- Attention queue v2: unpaid invoices (existing) **+ customers at risk** (compose existing customer-analytics query: `churn_risk`, `days_since_last_service`) — still zero backend change.
- Team-today panel: technician `utilization_rate`, `jobs_completed` (existing reporting data) — the dispatcher truth at a glance.
- Fix KPI amber token (from Phase 1) and the unused `revenueTrend` indicator.

**Wave 4.2 — Schedule & Dispatch (the operational core).**
- Appointments: one toolbar (view tabs + range + filters + search + export + `+`), killing the 4-layer stack; keep `<Tabs>` semantics, compact segmented control; month cells with tokenized status bars (readable contrast).
- Appointment detail 2-column re-architecture: LEFT = job story (Timeline promoted, services, notes, payments), RIGHT = context (specs prep card — the moat —, location with **collapsing map failure state**, sync status quiet by default, loud only when action required).
- Dispatch board polish: status pills from the `status-*` token family; travel-time chips (`travel_time_minutes`) and "running late" variance indicators (`actual_start_time` vs scheduled) on job cards.

**Wave 4.3 — Money surfaces (Invoices/Payments/Financials/Quotes).**
- Payment rows gain refund/fee/tax badges from existing `payments` columns; tables verified tabular-nums (contract), right-aligned numerics; empty states from the kit.
- Invoice detail: keep business behavior identical; layout + state craft only.

**Wave 4.4 — Customers/CRM/Reports.**
- Customer list: `company_name`, recency ("New" from `created_at`), LTV/churn badges (existing analytics queries), sort by last service (`lastServiceDates` already fetched).
- Reports: consolidate the 7-range × scope chrome into one filter bar; pivot builder kept; retire dead `useReportsData`/`useReportsFilters` after badges ship from the canonical queries; charts via Phase-3 frame.

**Wave 4.5 — Settings & long-tail pages.**
- Split `Settings.tsx` (1,830 LOC) into per-category modules under `src/legacy-pages/settings/` — copy sections byte-identical, then restyle. Keeps single-rail IA (contract rule 7).
- Restyle remaining legacy pages via the codemod + state kit (long tail: Fleet OS, Tech app surfaces, Weather Guard, Marketplace…).

**Wave 4.6 — Public & tenant surfaces (top of funnel).**
- Tenant booking / embed: visual polish ONLY; `servicewriter:booking-resize` protocol, observers, and step logic untouched (contract-enforced strings stay).
- Public booking + public subscriptions: gradient cleanup (D3), conversion-focused spacing/type.

### Phase 5 — Motion, theming & polish QA (1 wk)

- Motion tokens applied (150–250ms, ease-out; `prefers-reduced-motion` disables transforms + count-ups).
- Full dark-mode sweep with screenshot diffs for the 20 baseline screens.
- Focus-order audit (tab through: shell → page → modal) + axe pass; fix A2/A3/A5 residuals.

### Phase 6 — Dead-code cleanup & contract finalization (0.5–1 wk)

- Delete verified dead code (audit §6): `useReportsData`, `useReportsFilters`, `DashboardMetrics`, `RevenueChart`, `ServiceBreakdownChart`, `material-color-system.css` (merge or remove), stale gradient files.
- Ratchet the contract script thresholds to the post-refactor counts (hex/arbitrary-values = hard fail, not warning).
- Update `FRONTEND_UI_CONTRACT.md` to v2 final; add "how to add a screen" guide showing the primitive-only pattern.

---

## 3. Verification gates (every PR, every phase)

1. `node scripts/check-frontend-ui-contract.mjs` (+ all 7 prebuild gates) — **PASS**.
2. `npx tsc --noEmit` — **PASS**.
3. Lint errors ≤ 40, trending to 0; **no new `react-hooks/set-state-in-effect`** in touched files.
4. Jest failed-count ≤ **121 baseline** (delta script from Phase 0); suites touched by the PR green.
5. Playwright e2e (`auth-invitations`, `booking-invoice-payment`, `public-home`, `settings-regression`) — **PASS**.
6. Screenshot diff review — intentional changes only, both shells, both themes.
7. Manual smoke of the golden path: book → start job → complete → invoice → pay (per `ROADMAP.md`), plus one fleet dispatch round-trip.

## 4. Rollback strategy

- Token phases ship as **single-value PRs**: rollback = revert one commit; no data or state is ever at risk (presentation only).
- Each Wave is an independent PR chain; any wave can be reverted without touching others.
- Screenshot baselines double as the "before" record for review.

## 5. Effort & sequencing summary

| Phase | Effort | Depends on | Breaks if skipped |
|---|---|---|---|
| 0 Safety net | 0.5–1 wk | — | everything (no safety) |
| 1 Tokens | 1 wk | 0 | inconsistent redesign |
| 2 Shell/nav | 1.5–2 wks | 1 | every screen restyle pays 7× |
| 3 Primitives/states | 2 wks | 1 (parallel to 2) | waves slow, drift returns |
| 4 Waves (6 slices) | 4–5 wks | 2 + 3 | — |
| 5 Motion/theme QA | 1 wk | 4 | polish debt |
| 6 Cleanup/contract v2 | 0.5–1 wk | 4 | dead code persists |

**Total: ~10–12 weeks single-lane; 7–9 with Phases 2+3 parallel.** Highest user-visible value per week: ship order 0 → 1 → 2 → 4.1 (dashboard) → 4.2 (schedule) exactly as sequenced.

## 6. What this plan deliberately does NOT do

- ❌ No new API routes, RPCs, or query server-side changes — enrichment reuses existing client query modules only.
- ❌ No router migration work (the SPA/App-Router convergence is a separate architecture program).
- ❌ No behavior changes to booking, auth, RBAC, offline, or Stripe flows.
- ❌ No rebrand. Same name, same blue; the redesign is craft + consolidation + data surfacing, not identity change.
- ❌ No changes to the 8 marketing/SEO site pages beyond optional token alignment (they're contract-exempt by design).

---

*Prepared from the 2026-10-19 verified audit baseline. First recommended action: approve Phase 0 and let the safety net land before any pixel moves.*
