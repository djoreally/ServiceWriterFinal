import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Source-contract tests for the inspection results status vocabulary
// migration (20261110170000). History: production's
// inspection_results_status_check predates the repo's current
// vocabulary. The reconcile migration 20260917215245 declares
// ('pass','fail','warning','not_applicable','not_checked') but is
// CREATE TABLE IF NOT EXISTS, so on production -- where the table
// already existed -- it was a no-op and the older constraint survived:
// ('good','attention','urgent','not_applicable','not_checked'), read
// live from pg_constraint 2026-11-10. The current UI sends
// pass/fail/warning/not_applicable (+ the not_checked initial state),
// so any save containing 'warning' (or 'pass'/'fail') died on a 23514
// check violation that the API maps to a generic toast. Proven live
// 2026-11-10: Cody Glenn's completed service_inspections row has zero
// result rows; all 8 historical production result rows are 'good'.
//
// The migration replaces the constraint with the UNION of the three
// vocabularies. These tests pin both sides against drift: the UI /
// repo-DDL literals are extracted from their source files (not copied),
// and the production list is pinned as the live-read constant below.
// Behavior against a live database is proven by the post-merge
// production apply.

// Production's live constraint, read from pg_constraint 2026-11-10.
const PROD_STATUS_CHECK_2026_11_10 = [
  "good",
  "attention",
  "urgent",
  "not_applicable",
  "not_checked",
];

const migrationSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261110170000_inspection_results_status_vocabulary.sql",
  ),
  "utf8",
);

const reconcileSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260917215245_reconcile_inspection_runtime_20260917.sql",
  ),
  "utf8",
);

const performerSource = readFileSync(
  resolve(process.cwd(), "src/components/inspections/InspectionPerformer.tsx"),
  "utf8",
);

const transcriptReviewSource = readFileSync(
  resolve(process.cwd(), "src/components/inspections/TranscriptReview.tsx"),
  "utf8",
);

function literalsInCheckList(sql: string, fromIndex: number): string[] {
  const checkStart = sql.indexOf("check (status in (", fromIndex);
  if (checkStart === -1) throw new Error("status check list not found");
  const listEnd = sql.indexOf("))", checkStart);
  const listText = sql.slice(checkStart, listEnd);
  return [...listText.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

function migrationAllowedSet(): string[] {
  const addIndex = migrationSql.indexOf(
    "add constraint inspection_results_status_check",
  );
  if (addIndex === -1)
    throw new Error("migration does not add the named constraint");
  return literalsInCheckList(migrationSql, addIndex);
}

function repoDdlAllowedSet(): string[] {
  const tableIndex = reconcileSql.indexOf(
    "create table if not exists public.inspection_results",
  );
  if (tableIndex === -1)
    throw new Error("inspection_results create not found in reconcile migration");
  return literalsInCheckList(reconcileSql, tableIndex);
}

function performerOptionValues(): string[] {
  const optionsStart = performerSource.indexOf("const STATUS_OPTIONS = [");
  if (optionsStart === -1) throw new Error("STATUS_OPTIONS not found");
  const optionsEnd = performerSource.indexOf("];", optionsStart);
  const block = performerSource.slice(optionsStart, optionsEnd);
  return [...block.matchAll(/value: "([a-z_]+)"/g)].map((m) => m[1]);
}

function findingStatusUnion(): string[] {
  const match = transcriptReviewSource.match(
    /status: ((?:"[a-z_]+" \| ?)+)/,
  );
  if (!match) throw new Error("InspectionFinding status union not found");
  return [...match[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

function uiSendableSet(): string[] {
  const values = new Set<string>([
    ...performerOptionValues(),
    ...findingStatusUnion(),
  ]);
  // The performer's per-item initial state, saved verbatim for any
  // non-required item the technician leaves untouched.
  if (!performerSource.includes('status: "not_checked"'))
    throw new Error("performer not_checked initial state not found");
  values.add("not_checked");
  return [...values];
}

describe("inspection results status vocabulary migration", () => {
  it("replaces the production constraint by its exact live name, idempotently", () => {
    expect(migrationSql).toContain(
      "drop constraint if exists inspection_results_status_check",
    );
    expect(migrationSql).toContain(
      "add constraint inspection_results_status_check",
    );
  });

  it("keeps every production-proven status legal", () => {
    const allowed = new Set(migrationAllowedSet());
    for (const status of PROD_STATUS_CHECK_2026_11_10) {
      expect(allowed.has(status)).toBe(true);
    }
  });

  it("keeps every repo-DDL status legal", () => {
    const allowed = new Set(migrationAllowedSet());
    for (const status of repoDdlAllowedSet()) {
      expect(allowed.has(status)).toBe(true);
    }
  });

  it("allows every status the UI can send", () => {
    const allowed = new Set(migrationAllowedSet());
    for (const status of uiSendableSet()) {
      expect(allowed.has(status)).toBe(true);
    }
  });

  it("allows exactly the union of the three vocabularies -- no silent extras", () => {
    const union = new Set([
      ...PROD_STATUS_CHECK_2026_11_10,
      ...repoDdlAllowedSet(),
      ...uiSendableSet(),
    ]);
    expect(new Set(migrationAllowedSet())).toEqual(union);
  });

  it("documents the defect: the old production list rejects the current UI vocabulary", () => {
    // Negative control, pinned: under the pre-migration production
    // constraint the UI's save payload was illegal. If a future change
    // makes this pass, the migration's reason to exist has changed and
    // this file should be revisited, not just updated.
    const prod = new Set(PROD_STATUS_CHECK_2026_11_10);
    const rejected = uiSendableSet().filter((status) => !prod.has(status));
    expect(rejected).toEqual(
      expect.arrayContaining(["pass", "fail", "warning"]),
    );
  });
});
