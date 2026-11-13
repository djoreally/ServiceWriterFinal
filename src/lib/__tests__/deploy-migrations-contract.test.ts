import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// Source-contract tests for the deploy-time migration runner (SW-38,
// design: sw-auto-migrations-design-2026-11-12.md).
//
// Why these exist: the runner discovers migration files by scanning
// supabase/migrations and trusting the naming pattern. A misnamed file
// would be silently invisible to the scanner — the exact failure class
// the runner was built to eliminate — so the naming pattern is enforced
// here, in the suite every change runs. The authoring rules (no
// transaction control, no CREATE INDEX CONCURRENTLY) bind only files
// above the runner's baseline: historical files were written for the
// manual era (38 contain their own BEGIN;/COMMIT;) and are
// baseline-seeded, never re-executed. The baseline value is read out of
// the runner itself so this test can never drift from the code it guards.

const REPO_ROOT = process.cwd();
const MIGRATIONS_DIR = resolve(REPO_ROOT, "supabase/migrations");
const RUNNER_PATH = resolve(REPO_ROOT, "scripts/deploy-migrate.mjs");
const NAME_PATTERN = /^\d{14}_.+\.sql$/;

function runnerSource(): string {
  return readFileSync(RUNNER_PATH, "utf8");
}

function baselineVersion(): string {
  const match = runnerSource().match(/BASELINE_VERSION\s*=\s*"(\d{14})"/);
  if (!match) {
    throw new Error(
      "BASELINE_VERSION constant not found in scripts/deploy-migrate.mjs",
    );
  }
  return match[1];
}

function migrationFiles(): { name: string; version: string }[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && NAME_PATTERN.test(entry.name))
    .map((entry) => ({ name: entry.name, version: entry.name.slice(0, 14) }));
}

/** SQL lines that are not comment-only, so checks run on code, not prose. */
function codeOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("deploy-migrate runner contracts", () => {
  it("the runner script exists", () => {
    expect(existsSync(RUNNER_PATH)).toBe(true);
  });

  it("every entry in supabase/migrations is a file matching the naming pattern", () => {
    const offenders = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => !entry.isFile() || !NAME_PATTERN.test(entry.name))
      .map((entry) => entry.name);
    expect(offenders).toEqual([]);
  });

  it("the runner carries the production guards from the design", () => {
    const source = runnerSource();
    // Gate: non-production builds skip without touching a database.
    expect(source).toContain('process.env.VERCEL_ENV !== "production"');
    expect(source).toContain('"not a production deployment"');
    // Credential + project-ref guard.
    expect(source).toContain("SW_MIGRATION_DATABASE_URL");
    expect(source).toContain("SW_MIGRATION_EXPECTED_PROJECT_REF");
    // Session advisory lock.
    expect(source).toContain("pg_try_advisory_lock");
    // App-owned ledger, keyed by full filename, with a source column.
    expect(source).toContain("public.app_schema_migrations");
    expect(source).toContain("'baseline-seed'");
    // The baseline constant is a 14-digit version.
    expect(baselineVersion()).toMatch(/^\d{14}$/);
  });

  it("package.json hooks the runner into the build and depends on pg", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"),
    ) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
    };
    expect(pkg.scripts.build.startsWith("node scripts/deploy-migrate.mjs && ")).toBe(
      true,
    );
    expect(pkg.scripts.build).toContain("next build");
    expect(pkg.dependencies.pg).toBeDefined();
  });

  it("migrations above the baseline obey the runner's authoring rules", () => {
    const baseline = baselineVersion();
    const newFiles = migrationFiles().filter((f) => f.version > baseline);
    // The telemetry migration sits above the baseline today, so this set
    // must never be empty by accident (a broken filter would no-op here).
    expect(newFiles.length).toBeGreaterThan(0);

    const txnOffenders: string[] = [];
    const concurrentlyOffenders: string[] = [];
    for (const file of newFiles) {
      const code = codeOnly(
        readFileSync(resolve(MIGRATIONS_DIR, file.name), "utf8"),
      );
      if (/^\s*(begin|commit|rollback)\s*;/im.test(code)) {
        txnOffenders.push(file.name);
      }
      if (/create\s+(unique\s+)?index\s+concurrently/i.test(code)) {
        concurrentlyOffenders.push(file.name);
      }
    }
    // No top-level transaction control: the runner owns the transaction.
    expect(txnOffenders).toEqual([]);
    // No CREATE INDEX CONCURRENTLY: Postgres forbids it inside a
    // transaction. Such an index is the manual exception path (owner-ordered).
    expect(concurrentlyOffenders).toEqual([]);
  });
});
