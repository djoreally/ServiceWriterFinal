# Frontend Refactor — Safety Net & Regression Baseline

Companion to `FRONTEND_DESIGN_AUDIT_2026-10-19.md` and `FRONTEND_REFACTOR_PLAN_2026-10-19.md`.
This document is the operational how-to for the remediation program's guardrails.

## The promise this enforces

The redesign makes **zero backend, database, or business-logic changes** and must
**never widen the regression surface**. Two machines enforce that promise:

1. **Build gates (prebuild, already existed)** — architecture, identity, frontend-ui,
   CRUD, email, onboarding, regression-lock contracts run on every `npm run build`.
2. **Delta gate (new, Phase 0)** — lint error count and jest failure counts are
   compared against the recorded pre-refactor baseline.

## The baseline

`docs/frontend-baseline-2026-10-19.json` records, at commit `01f6022`:

| Signal | Baseline |
|---|---|
| Typecheck / 7 prebuild gates | all PASS |
| ESLint errors (`npm run lint`) | **40** (ceiling — may only decrease) |
| Jest | **121 failed tests / 42 failed suites** of 2,048 tests / 225 suites (ceiling) |
| Failed suite allow-list | the exact 42 suites in the JSON |

The allow-list matters: even when counts improve, a suite that is **not** in the
list must never start failing.

## Using the delta gate

```bash
# Full check (eslint + full jest, ~4-5 min) — run before pushing refactor PRs
npm run verify:frontend-delta

# Fast lanes
node scripts/verify-frontend-delta.mjs --lint-only
node scripts/verify-frontend-delta.mjs --tests-only
```

Exit 0 = the refactor did not widen regressions. Exit 1 tells you exactly what
grew (lint delta, test delta, or which suite newly failed).

When a phase **intentionally** improves the numbers (e.g. dead-code removal fixes
suites, lint cleanup drops errors), re-record the baseline in the same PR and
review that diff like any code change:

```bash
UPDATE_FRONTEND_BASELINE=1 npm run verify:frontend-delta
```

## Visual regression net

`e2e/tests/visual-baseline.spec.ts` captures screenshot pairs (light/dark ×
desktop 1440 / tablet 820 / mobile 390, per the existing Playwright config):

```bash
npm run build && npm run test:visual          # starts prod server on :4173
```

Artifacts are written to `playwright-visual/<project>/<theme>-<screen>.png`
(gitignored). Public screens always run; authenticated screens need the standard
e2e env (`E2E_AUTH_STORAGE_STATE`, `E2E_WORKSPACE_ID` — same pattern as
`auth-invitations.spec.ts`).

Workflow per refactor phase:
1. **Before** the phase branch: run `npm run test:visual`, archive the folder as
   the phase baseline.
2. **After** the phase: re-run, diff the folders (any image-diff tool), attach
   the meaningful diffs to the PR.
3. Only **intentional** design diffs may appear; anything else is a regression.

Animations are disabled in the spec and non-deterministic regions (maps, toasts,
overlays) are masked so diffs reflect design, not noise.

## Install health (fixed in Phase 0)

`npm ci` previously required two non-npm hosts: `cdn.sheetjs.com` (the `xlsx`
tarball) and a Lovable artifact-registry mirror (5 transitive tarballs). Both are
now pinned to registry.npmjs.org equivalents (`xlsx` on the npm-hosted `^0.18.5`
line; mirror URLs rewritten — tarball integrity verified byte-identical).
Any environment with plain npm registry access can now install.
