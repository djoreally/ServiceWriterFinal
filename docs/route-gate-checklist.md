# Route Gate — Standing Checklist for New or Moved Routes

Jira: SW-45 (standing gate). This checklist is attached to **every PR that adds
or moves a route**. A route is not done when the page renders locally — it is
done when its registration is proven in the same PR and its deploy routing is
covered by the repo's standing locks.

## The checklist

Copy this into the PR body and check each line off with evidence:

- [ ] **Registered through the canonical routing.** The route exists as an
      App Router page (`app/…/page.tsx`), and — where the surface uses one —
      it is also registered in that surface's tab/section registry and given a
      deep-link alias. A component that exists but is mounted nowhere is a
      404, not a route.
- [ ] **Source-pin (contract) test in the same PR.** A test reads the real
      registration source and fails if any part of the registration is
      removed: the page/route file, the registry entry, the mount, and the
      alias. If deleting the registration does not fail a test, the proof is
      missing.
- [ ] **Render/journey test in the same PR.** A journey test loads the real
      route (through the route renderer, as a signed-in persona) and asserts
      the screen actually renders — content, key controls, no console or
      plumbing errors. Source pins prove wiring; the journey proves the user
      can reach and use it.
- [ ] **Deploy routing verified.** The route appears in the production
      build's route table (`next build` output), and any rewrites or aliases
      it relies on are covered by the standing regression locks below — not
      by one-off manual checks.

## The standing locks this gate relies on

- **REG-004 — Settings deep links** (`scripts/certify-regression-lock.mjs`,
  catalogued in `docs/regression-contract.md`). Requires every legacy
  Settings `?tab=` value to resolve through `SETTINGS_TAB_ALIASES` in
  `app/(app)/settings/page.tsx`, with the invalid-tab fallback
  (`SETTINGS_TAB_ALIASES[requestedTab] ?? "business"`) intact — so a current
  or historic Settings URL can never render a blank settings body. Runs in
  the `prebuild` chain and under Playwright. Sibling locks in the same file
  cover public-booking route precedence (REG-001/002/003) and other
  previously-broken surfaces.
- **Architecture contract** (`scripts/check-architecture-contract.mjs`,
  driven by `scripts/architecture-contract.json`). Runs **first** in the
  `prebuild` chain of every production build. It pins the deployment shape
  routes depend on: Next.js App Router as the runtime, a single Vercel
  project, `vercel.json` declaring `framework=nextjs` and the canonical
  build command, the canonical build chain (`deploy-migrate.mjs` then
  `next build`), and the presence of the canonical application surfaces —
  failing the build if a competing runtime surface appears.

Both locks run automatically on every production build via `prebuild`; the
PR's own tests are what extend their coverage to the new route.

## Worked example — PR #274 (SW-86), the SW-61 proof application

PR #274 hosted the CARFAX settings screen, which previously existed as a
component mounted nowhere (audit gap G7: every path to it 404'd). It is the
worked example of this gate:

- **Registration:** `CarfaxSettings` imported and mounted in the Settings
  shell (`src/legacy-pages/Settings.tsx`) under a `carfax` section in the
  Integrations tab registry (which drives the sidebar nav, the in-tab
  contents list, and Settings search), served by the canonical App Router
  page `app/(app)/settings/page.tsx`.
- **Deep-link alias:** `carfax: "integrations"` added to
  `SETTINGS_TAB_ALIASES`, so `/settings?tab=carfax` resolves to the
  Integrations tab instead of the blank-body failure REG-004 guards against.
- **Source-pin test:** `src/components/settings/__tests__/carfax-settings-route.test.ts`
  pins the import, the registry entry (including the `carfax` search
  keyword), the anchored mount, and the alias — removing any one fails the
  suite.
- **Journey test:** `src/__journeys__/monetization/carfax-settings.journey.test.tsx`
  renders the real `/settings?tab=carfax` route as the owner persona and
  asserts the screen renders with the saved location ID, the manual export
  actions, and the export monitor.
- **Deploy routing:** `/settings` ships in the production build's route
  table, and the alias behavior is covered by the REG-004 regression lock
  cited above.
