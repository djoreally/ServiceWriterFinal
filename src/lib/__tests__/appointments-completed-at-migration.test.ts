import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Source-contract tests for the SW-87 migration
// (20261113120000_appointments_completed_at): the tech app's
// on-device completion stamp (jobs.completed_at, Watermelon
// schema v5) had no server home — appointments carried no
// completion-time column, so the sync push dropped the stamp and
// the pull could never return it. The migration adds the column
// expand-only (nullable, no constraint or function changes, safe
// under the deploy-migrate runner's rules) and backfills rows
// completed before the column existed with their updated_at —
// the completion-stamp convention the sync pull already uses for
// inspection reports. Behavior against a live database is proven
// by the post-merge production apply (deploy-time migrations).

const migrationSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261113120000_appointments_completed_at.sql",
  ),
  "utf8",
);

describe("20261113120000_appointments_completed_at", () => {
  it("adds the column expand-only and idempotently", () => {
    expect(migrationSql).toContain(
      "alter table public.appointments\n  add column if not exists completed_at timestamptz;",
    );
    // Expand-only: nothing existing is altered, dropped, or constrained,
    // and the new column itself is nullable (no NOT NULL tightening).
    expect(migrationSql.toLowerCase()).not.toContain("drop ");
    expect(migrationSql.toLowerCase()).not.toContain("completed_at timestamptz not null");
  });

  it("backfills only unstamped completed rows, from updated_at", () => {
    expect(migrationSql).toContain("set completed_at = updated_at");
    expect(migrationSql).toContain("where completed_at is null");
    expect(migrationSql).toContain("and status = 'completed'");
    expect(migrationSql).toContain("and updated_at is not null");
  });

  it("obeys the deploy-migrate authoring rules (runner owns the transaction)", () => {
    expect(migrationSql).not.toMatch(/^\s*(begin|commit|rollback)\s*;/im);
    expect(migrationSql.toLowerCase()).not.toContain("concurrently");
  });
});
