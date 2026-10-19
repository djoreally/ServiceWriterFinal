#!/usr/bin/env node
/**
 * Frontend refactor delta gate.
 *
 * Compares the current tree against the pre-refactor regression ceiling in
 * docs/frontend-baseline-2026-10-19.json. The frontend redesign is allowed to
 * improve these numbers — never to worsen them:
 *
 *   - ESLint error count must not exceed the baseline.
 *   - Jest failed-test count must not exceed the baseline.
 *   - A test suite that is NOT in the baseline's failed-suites list must not
 *     fail (no new suite failures, even if the count stays under the ceiling).
 *
 * Usage:
 *   node scripts/verify-frontend-delta.mjs                # lint + jest
 *   node scripts/verify-frontend-delta.mjs --lint-only    # fast lane
 *   node scripts/verify-frontend-delta.mjs --tests-only
 *   UPDATE_FRONTEND_BASELINE=1 node scripts/verify-frontend-delta.mjs
 *     # intentionally re-record the baseline (review the diff like any code)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const baselinePath = process.env.BASELINE_PATH || "docs/frontend-baseline-2026-10-19.json";
const lintOnly = process.argv.includes("--lint-only");
const testsOnly = process.argv.includes("--tests-only");
const update = process.env.UPDATE_FRONTEND_BASELINE === "1";

const runLint = !testsOnly;
const runTests = !lintOnly;

const baseline = JSON.parse(fs.readFileSync(path.join(root, baselinePath), "utf8"));

/** Run a tool that exits non-zero on findings (eslint, jest) and capture its stdout JSON. */
function runJsonTool(args) {
  const result = spawnSync("npx", args, {
    cwd: root,
    maxBuffer: 512 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  // Exit 1 = findings present (expected). Parse stdout regardless.
  if (!result.stdout || !result.stdout.trim()) {
    throw new Error(`no JSON output from ${args[0]} (exit ${result.status})`);
  }
  return JSON.parse(result.stdout);
}

function lintErrors() {
  console.log("frontend-delta: running eslint (quiet, json)…");
  const results = runJsonTool(["eslint", ".", "--quiet", "--format", "json"]);
  return results.reduce((sum, file) => sum + (file.errorCount || 0) + (file.fatalErrorCount || 0), 0);
}

function jestResults() {
  console.log("frontend-delta: running jest --runInBand --json (full suite)…");
  return runJsonTool(["jest", "--runInBand", "--json"]);
}

let failures = [];
const current = { capturedAt: new Date().toISOString().slice(0, 10) };

if (runLint) {
  const errors = lintErrors();
  current.lint = { errors };
  const delta = errors - baseline.lint.errors;
  console.log(`frontend-delta: lint errors ${errors} (baseline ${baseline.lint.errors}, delta ${delta >= 0 ? "+" : ""}${delta})`);
  if (errors > baseline.lint.errors) failures.push(`lint errors grew by ${delta}`);
}

if (runTests) {
  const results = jestResults();
  const failedSuites = results.testResults
    .filter((suite) => suite.status === "failed")
    .map((suite) => path.relative(root, suite.name))
    .sort();
  const known = new Set(baseline.jest.failedSuites);
  const newFailures = failedSuites.filter((name) => !known.has(name));
  const fixedSuites = baseline.jest.failedSuites.filter((name) => !failedSuites.includes(name));
  current.jest = {
    suitesTotal: results.numTotalSuites,
    suitesFailed: results.numFailedSuites,
    suitesPassed: results.numPassedSuites,
    suitesSkipped: results.numPendingSuites,
    testsTotal: results.numTotalTests,
    testsFailed: results.numFailedTests,
    testsPassed: results.numPassedTests,
    testsPending: results.numPendingTests,
    failedSuites,
  };
  console.log(
    `frontend-delta: jest failed tests ${results.numFailedTests} (baseline ${baseline.jest.testsFailed}), ` +
    `failed suites ${failedSuites.length} (baseline ${baseline.jest.failedSuites.length})`,
  );
  if (fixedSuites.length) console.log(`frontend-delta: FIXED since baseline: ${fixedSuites.length} suite(s): ${fixedSuites.join(", ")}`);
  if (results.numFailedTests > baseline.jest.testsFailed) {
    failures.push(`jest failed tests grew by ${results.numFailedTests - baseline.jest.testsFailed}`);
  }
  if (newFailures.length) {
    failures.push(`new suite failure(s) not in baseline: ${newFailures.join(", ")}`);
  }
}

if (update) {
  const next = {
    ...baseline,
    ...current,
    purpose: baseline.purpose,
  };
  if (current.lint) next.lint = { ...baseline.lint, ...current.lint };
  if (current.jest) next.jest = current.jest;
  fs.writeFileSync(path.join(root, baselinePath), JSON.stringify(next, null, 2) + "\n");
  console.log(`frontend-delta: baseline updated at ${baselinePath} — review this diff deliberately.`);
}

if (failures.length) {
  console.error(`frontend-delta: FAIL — refactor widened the regression surface:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log("frontend-delta: PASS — refactor did not widen the regression surface.");
}
