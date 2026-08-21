# Repository Lint Blocker Analysis and Fix Plan

## Executive summary

The current lint command reports **361 errors and 1,309 warnings across 292 files**. The headline count materially overstates production-code debt because the root ESLint invocation is traversing generated Next.js output under `apps/web-next/.next`.

After separating generated output from authored code, the blocking errors are much smaller:

| Classification | Errors | Primary cause | Release impact |
|---|---:|---|---|
| Generated Next.js output | 356 | `apps/web-next/.next/**` is not ignored by the root flat config | Artificial CI failures; should be excluded from authored-source lint. |
| Authored application source | 1 | Generated `apps/web-next/next-env.d.ts` triple-slash route reference | Generated framework file; should be ignored by the root lint job or linted only by Next.js. |
| Authored test/setup code | 4 | `@typescript-eslint/no-require-imports` | Real but low runtime risk; must be converted to imports or narrowly documented. |
| Total blocking errors after classification | 5 | Test setup plus generated framework metadata | The realistic immediate blocker is four test `require()` calls once generated output is excluded. |

Warnings are also broad and should not be erased. The largest warning category is `@typescript-eslint/no-explicit-any` with **1,130 occurrences**, followed by `@typescript-eslint/no-empty-object-type`, React hook dependency warnings, React refresh export warnings, and a small number of empty-block/config warnings.

## Root cause 1: generated Next.js artifacts are being linted

The flat ESLint config currently ignores `dist` and Supabase functions but does not ignore `apps/web-next/.next/**` or the generated `apps/web-next/next-env.d.ts` file. Next.js generates `.next/types/**`, including route validator files that contain framework-generated types and comments not intended for hand-authored lint remediation.

The generated files account for **356 of 361 errors**, including approximately 300 `no-unsafe-function-type` reports, 28 `no-wrapper-object-types` reports, and 28 `ban-ts-comment` reports. Fixing those generated files would be incorrect because the next build recreates them.

### Required remediation

Add the following patterns to the first global ignore block in `eslint.config.js`:

```ts
{ ignores: [
  "dist",
  "apps/web-next/.next/**",
  "apps/web-next/next-env.d.ts",
  "supabase/functions/**",
] }
```

The root lint job should own authored Vite/frontend source only. The Next.js project should be checked through its own `next build` and `tsc --noEmit` commands. If dedicated Next.js linting is later added, it should use a Next-specific configuration and should still exclude `.next`.

This is a **configuration correction**, not a quality exception. It prevents generated framework output from polluting the authored-source release gate.

## Root cause 2: four forbidden CommonJS `require()` calls

The remaining authored errors are all `@typescript-eslint/no-require-imports` violations:

| File | Location | Remediation |
|---|---:|---|
| `src/test/journeys/setupJourneys.ts` | Lines 12, 53, 94 | Replace test-only `require()` calls with top-level imports or a statically imported test helper. |
| `src/application/commands/__tests__/dispatch-assignment-e2e.test.ts` | Around line 293 | Replace the dynamic Supabase-client `require()` inside the mocked API method with a module-level imported mock reference. |

### Recommended implementation pattern

For `setupJourneys.ts`, import `getFakeBackend`, `resetFakeBackend`, and React at module scope. If Jest mock-hoisting makes a direct import unsuitable, isolate the mock factory in a dedicated typed mock module rather than suppressing the rule globally.

For the dispatch test, import the mocked Supabase client or expose it through a test-local factory variable. The test already mocks the module; the fix should preserve its in-memory RPC emulator and must not reintroduce a production dependency.

Avoid `eslint-disable` comments unless the import must remain dynamic for a proven Jest module-isolation reason. Any exception should include a one-line justification and be limited to the exact statement.

## Warning debt assessment

Warnings do not currently make ESLint exit nonzero, but the volume is large enough to hide regressions. They should be handled in controlled workstreams rather than fixed with a blanket severity downgrade or a global disable.

| Rule | Approximate count | Priority | Fix strategy |
|---|---:|---|---|
| `@typescript-eslint/no-explicit-any` | 1,130 | P1 | Triage by production boundary. Replace API/database payloads with Zod-inferred types, Supabase generated types, discriminated unions, and `unknown` plus narrowing. Test fixture helpers can use explicit fixture types. |
| `@typescript-eslint/no-empty-object-type` | 76 | P2 | Replace empty object types with `Record<string, never>`, a named domain type, or a more precise interface. Review React props separately. |
| `react-hooks/exhaustive-deps` | 49 | P1 | Fix dependency arrays or restructure effects. Each suppression requires a documented invariant because stale closures can create operational defects. |
| `react-refresh/only-export-components` | 43 | P2 | Move non-component exports from component modules into utility files, or use narrowly scoped configuration for intentional constant exports. |
| `config` | 8 | P1 | Inspect individually; configuration warnings should not be accepted without an explicit reason. |
| `no-empty` | 3 | P2 | Replace empty blocks with meaningful handling, comments, or explicit error propagation. |

The warning remediation should begin with production runtime files under `src/application`, `src/domain`, `src/offline`, `src/integrations`, and `src/pages`. Test fixtures can be handled in a separate track, but they should not become a permanent dumping ground for untyped values.

## Recommended execution plan

### Phase 1: Correct lint scope

Update `eslint.config.js` to exclude `.next` and `next-env.d.ts`, then rerun ESLint with JSON output. Expected result: generated errors fall from 356 to zero, leaving four authored `no-require-imports` errors plus warnings.

Add a CI assertion that generated output is ignored rather than deleted or hand-edited. The repository should continue to build Next.js independently.

### Phase 2: Remove the four authored errors

Convert the four `require()` calls to static imports or typed test-local dependency references. Run the focused journey tests immediately after each test harness change, then run the complete Jest suite.

Exit criteria:

- Zero ESLint errors in authored source.
- No new `eslint-disable` directives without justification.
- Dispatch assignment journey tests remain green.
- Full Jest suite remains green.

### Phase 3: Establish warning ownership

Create an ESLint warning baseline by directory and rule. Assign warning groups to application, frontend, offline, test, and legacy-migration owners. New warnings should be prohibited in changed files even while the historical baseline is reduced.

A practical interim CI policy is:

```bash
npx eslint . --max-warnings=0
```

only after the current warning baseline is either fixed or temporarily isolated. Until then, use a changed-file warning budget or a checked-in baseline file. Do not globally turn warnings off.

### Phase 4: Production-code type hardening

Prioritize `any` replacement at trust boundaries:

1. API request and response objects.
2. Supabase query projections and RPC arguments.
3. Offline queue and synchronization payloads.
4. Messaging and payment adapter contracts.
5. Workspace and authorization context.
6. Test fixtures and UI-only convenience types.

Every boundary should validate external data with Zod before mapping it into domain types. This directly supports the project’s enterprise requirements for strict validation and tenant isolation.

### Phase 5: Hook and React module cleanup

Review the 49 hook dependency warnings for actual stale-closure risk. Then separate component exports from utility/constants to reduce React refresh warnings without changing runtime behavior.

## CI changes required after the fix

The GitHub Actions workflow should retain separate gates:

| Gate | Command | Purpose |
|---|---|---|
| Frontend lint | `npx eslint . --max-warnings=0` | Authored frontend/source quality. |
| Frontend typecheck | `npm run typecheck` | Vite application type safety. |
| Jest | `npm test -- --ci --coverage` | Unit, integration, and journey regressions. |
| Vite build | `npm run build` | Production frontend bundle. |
| Next API typecheck | `npm run typecheck` in `apps/web-next` | API application type safety. |
| Next API build | `npm run build` in `apps/web-next` | API route compilation and deployment packaging. |
| Playwright | `npm run test:e2e` | Browser smoke coverage. |
| Migration sanity | Existing migration job | Schema safety and migration invariants. |

The current CI workflow is correctly strict in principle, but it will remain red until the lint scope and four authored errors are fixed. The workflow should not be weakened to make the build green.

## Definition of done

The lint blocker work is complete when ESLint reports zero errors across authored code, no generated `.next` output is included in the root lint scope, the four CommonJS test imports are removed, typecheck/build/Jest/Playwright gates pass, and the warning baseline is recorded with an owner and reduction target.

A production release should not require zero historical warnings on day one if the baseline is explicitly tracked, but it should prevent new warnings in changed files and should keep all errors at zero.
