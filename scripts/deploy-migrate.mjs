#!/usr/bin/env node
/**
 * Deploy-time database migrations for Service Writer (Jira SW-38).
 *
 * Port of Fleet Mail's deploy-migrate pattern (see
 * your_files/sw-auto-migrations-design-2026-11-12.md, the approved design):
 * the production build applies pending Supabase migrations itself, in
 * order, records them in an app-owned ledger, and fails the build if any
 * migration fails. `package.json` wires this as the first step of `build`,
 * after the `prebuild` contract checks and before `next build`, so a failed
 * migration means Vercel never promotes the deployment.
 *
 * Behavior:
 * - Gate: unless VERCEL_ENV === "production", log a JSON skip line and
 *   exit 0. Preview/development/local builds never touch a database.
 * - In production, SW_MIGRATION_DATABASE_URL (Supabase Session pooler
 *   string, Production env scope only) is required; missing => exit 1.
 * - Ref guard: SW_MIGRATION_EXPECTED_PROJECT_REF (also required in
 *   production) must be encoded in the connection string's username or
 *   host; otherwise exit 1 without connecting. The connection string is
 *   never printed; error output is sanitized.
 * - One dedicated client connection holds a session advisory lock for the
 *   whole run. A concurrent run waits (retry every 2s, up to 5 minutes),
 *   then re-reads the ledger and finds the work already done.
 * - Ledger: public.app_schema_migrations, keyed by FULL FILENAME (this
 *   repo has duplicated version prefixes, so a version key would be
 *   lossy), with a `source` column ('deploy' | 'baseline-seed' | 'manual').
 * - Baseline seed (first run only): if and only if the ledger is empty,
 *   every migration file whose version is <= BASELINE_VERSION, or whose
 *   version is recorded in the Supabase CLI ledger
 *   (supabase_migrations.schema_migrations), is recorded as
 *   'baseline-seed' WITHOUT being executed — those files were applied by
 *   hand over the repo's history. Once the ledger is non-empty the seed
 *   branch can never run again.
 * - Each remaining file runs in its own transaction:
 *   BEGIN -> file text -> ledger insert (source 'deploy') -> COMMIT.
 *   On error: ROLLBACK, log the file name, exit 1; later files do not run.
 *
 * Authoring rules for NEW migration files (enforced by
 * src/lib/__tests__/deploy-migrations-contract.test.ts):
 * - Name: ^\d{14}_.+\.sql$ (14-digit version, underscore, name).
 * - No top-level BEGIN;/COMMIT;/ROLLBACK; — the runner owns the
 *   transaction.
 * - No CREATE INDEX CONCURRENTLY (Postgres forbids it inside a
 *   transaction); such an index is the documented manual exception path.
 * - Expand-only / backward-compatible: the currently live code must keep
 *   working after the migration, so code rollback never needs a database
 *   rollback.
 *
 * Log contract (build-log proof surface, same shape as Fleet Mail):
 *   {"migration":"skipped","reason":"not a production deployment"}
 *   {"migration":"complete","success":true,"seeded":[...],"migrations":[...],"skipped":[...],"timestamp":"..."}
 *
 * Env overrides (tests only; unset in every real environment):
 * - SW_MIGRATIONS_DIR: scan this directory instead of supabase/migrations.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

/** Last hand-applied + verified migration (SW-7, 2026-11-12). Files at or
 *  below this version are baseline-seeded on the first run, never executed. */
export const BASELINE_VERSION = "20261112031000";

export const MIGRATION_FILE_PATTERN = /^\d{14}_.+\.sql$/;

const LOCK_KEY = "service-writer-deploy-migrations";
const LOCK_RETRY_MS = 2_000;
const LOCK_TIMEOUT_MS = 5 * 60 * 1_000;

const LEDGER_DDL = `
CREATE TABLE IF NOT EXISTS public.app_schema_migrations (
  name       text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  source     text NOT NULL DEFAULT 'deploy'
)`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Remove the connection string (and any postgres URL) from text that is
 *  about to be logged. Error messages must never carry the credential. */
export function sanitize(text, connectionString) {
  let out = String(text ?? "");
  if (connectionString) out = out.split(connectionString).join("[redacted]");
  return out.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[redacted-url]");
}

/** The Supabase connection string encodes the project ref in the username
 *  (pooler: "postgres.<ref>") or the host (direct: "db.<ref>.supabase.co").
 *  Accept either; refuse anything else so a wrong-database paste fails the
 *  build loudly instead of migrating the wrong project. */
export function connectionStringEncodesRef(connectionString, ref) {
  if (!ref) return false;
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    return false;
  }
  let username = "";
  try {
    username = decodeURIComponent(url.username || "");
  } catch {
    username = url.username || "";
  }
  return username.includes(ref) || (url.hostname || "").includes(ref);
}

/** Scan the migrations directory: files matching the naming pattern,
 *  sorted by (version, full filename). The filename tiebreak gives the
 *  repo's duplicated version prefixes a deterministic order. Files that
 *  do not match the pattern are invisible here on purpose — the contract
 *  test fails the suite if any exist, so one can never be silently
 *  skipped in a real deploy. */
export function scanMigrations(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && MIGRATION_FILE_PATTERN.test(entry.name))
    .map((entry) => ({ name: entry.name, version: entry.name.slice(0, 14) }))
    .sort((a, b) =>
      a.version !== b.version
        ? a.version < b.version
          ? -1
          : 1
        : a.name < b.name
          ? -1
          : a.name > b.name
            ? 1
            : 0,
    );
}

async function ensureLedger(client) {
  await client.query(LEDGER_DDL);
  // Revoke from PUBLIC always; from the app roles when they exist (they do
  // on Supabase; a vanilla Postgres used in tests may not have them).
  const { rows } = await client.query(
    "SELECT rolname FROM pg_roles WHERE rolname = ANY($1)",
    [["anon", "authenticated"]],
  );
  const roles = rows.map((r) => r.rolname);
  const targets = ["PUBLIC", ...roles].join(", ");
  await client.query(
    `REVOKE ALL PRIVILEGES ON TABLE public.app_schema_migrations FROM ${targets}`,
  );
}

async function acquireLock(client) {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    const { rows } = await client.query(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
      [LOCK_KEY],
    );
    if (rows[0]?.locked) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out waiting ${LOCK_TIMEOUT_MS / 1000}s for the deploy-migration advisory lock (another production build is mid-migration)`,
      );
    }
    await sleep(LOCK_RETRY_MS);
  }
}

/** Versions recorded by the Supabase CLI, if its ledger exists. A file the
 *  CLI recorded is definitionally already applied. */
async function cliLedgerVersions(client) {
  const { rows } = await client.query(
    "SELECT to_regclass('supabase_migrations.schema_migrations') AS t",
  );
  if (!rows[0]?.t) return new Set();
  const result = await client.query(
    "SELECT version FROM supabase_migrations.schema_migrations",
  );
  return new Set(result.rows.map((r) => String(r.version)));
}

/**
 * Run the seed + apply pass on an already-connected client.
 * Returns the completion report. Throws on the first failing migration
 * (after rolling it back); the caller turns that into a failed build.
 */
export async function runMigrations(client, { migrationsDir }) {
  const files = scanMigrations(migrationsDir);
  const applied = [];
  const seeded = [];
  let skipped = [];

  await acquireLock(client);
  try {
    await ensureLedger(client);

    const { rows: ledgerRows } = await client.query(
      "SELECT name FROM public.app_schema_migrations",
    );
    const recorded = new Set(ledgerRows.map((r) => r.name));
    skipped = files.filter((f) => recorded.has(f.name)).map((f) => f.name);

    // Baseline seed — first run only, and only while the ledger is empty.
    // Runs inside one transaction; from the moment it commits, the ledger
    // is non-empty and this branch can never run again.
    if (recorded.size === 0 && files.length > 0) {
      const cliVersions = await cliLedgerVersions(client);
      const toSeed = files.filter(
        (f) => f.version <= BASELINE_VERSION || cliVersions.has(f.version),
      );
      if (toSeed.length > 0) {
        await client.query("BEGIN");
        try {
          for (const file of toSeed) {
            await client.query(
              "INSERT INTO public.app_schema_migrations (name, source) VALUES ($1, 'baseline-seed')",
              [file.name],
            );
            recorded.add(file.name);
            seeded.push(file.name);
          }
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK").catch(() => {});
          throw err;
        }
      }
    }

    for (const file of files) {
      if (recorded.has(file.name)) continue;
      const sql = readFileSync(join(migrationsDir, file.name), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO public.app_schema_migrations (name, source) VALUES ($1, 'deploy')",
          [file.name],
        );
        await client.query("COMMIT");
        recorded.add(file.name);
        applied.push(file.name);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`Migration ${file.name} failed: ${detail}`);
      }
    }
  } finally {
    await client
      .query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_KEY])
      .catch(() => {});
  }

  return {
    success: true,
    seeded,
    migrations: applied,
    skipped,
    timestamp: new Date().toISOString(),
  };
}

async function main() {
  if (process.env.VERCEL_ENV !== "production") {
    console.log(
      JSON.stringify({ migration: "skipped", reason: "not a production deployment" }),
    );
    return;
  }

  const connectionString = process.env.SW_MIGRATION_DATABASE_URL;
  if (!connectionString) {
    console.error(
      "Production migration failed: SW_MIGRATION_DATABASE_URL is not set. " +
        "In production, 'could not migrate' must never silently become 'shipped anyway'.",
    );
    process.exitCode = 1;
    return;
  }

  const expectedRef = process.env.SW_MIGRATION_EXPECTED_PROJECT_REF;
  if (!expectedRef) {
    console.error(
      "Production migration failed: SW_MIGRATION_EXPECTED_PROJECT_REF is not set; refusing to run without the project-ref guard.",
    );
    process.exitCode = 1;
    return;
  }
  if (!connectionStringEncodesRef(connectionString, expectedRef)) {
    console.error(
      "Production migration failed: SW_MIGRATION_DATABASE_URL does not encode the expected project ref; refusing to connect (wrong database?).",
    );
    process.exitCode = 1;
    return;
  }

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const migrationsDir =
    process.env.SW_MIGRATIONS_DIR || join(repoRoot, "supabase", "migrations");

  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    const report = await runMigrations(client, { migrationsDir });
    console.log(JSON.stringify({ migration: "complete", ...report }));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("Production migration failed:", sanitize(detail, connectionString));
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  await main();
}
