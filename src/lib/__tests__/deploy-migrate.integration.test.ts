import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { Client } from "pg";

// Integration tests for the deploy-time migration runner (SW-38).
//
// These drive the REAL CLI (node scripts/deploy-migrate.mjs) as a child
// process against a throwaway Postgres — never any shared or production
// database. The database scenarios run only when
// DEPLOY_MIGRATE_TEST_DATABASE_URL points at a disposable server (its
// username must contain "swtestref", which the tests pass as the expected
// project ref). The gate scenarios (skip / missing credential / ref
// mismatch) need no database and always run.

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const RUNNER = resolve(REPO_ROOT, "scripts/deploy-migrate.mjs");
const TEST_REF = "swtestref";
const ADMIN_URL = process.env.DEPLOY_MIGRATE_TEST_DATABASE_URL;
const describeDb = ADMIN_URL ? describe : describe.skip;

jest.setTimeout(180_000);

type RunResult = { code: number; stdout: string; stderr: string };

function childEnv(overrides: Record<string, string | undefined>) {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}

async function runRunner(
  overrides: Record<string, string | undefined>,
): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync("node", [RUNNER], {
      cwd: REPO_ROOT,
      env: childEnv(overrides),
      maxBuffer: 32 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: unknown; stdout?: string; stderr?: string };
    return {
      code: typeof e.code === "number" ? e.code : 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

function dbUrl(dbName: string): string {
  const url = new URL(ADMIN_URL as string);
  url.pathname = `/${dbName}`;
  return url.toString();
}

function prodEnv(dbName: string, dir: string) {
  return {
    VERCEL_ENV: "production",
    SW_MIGRATION_DATABASE_URL: dbUrl(dbName),
    SW_MIGRATION_EXPECTED_PROJECT_REF: TEST_REF,
    SW_MIGRATIONS_DIR: dir,
  };
}

async function withClient<T>(
  dbName: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: dbUrl(dbName) });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function freshDb(dbName: string): Promise<void> {
  await withClient("postgres", async (client) => {
    await client.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await client.query(`CREATE DATABASE ${dbName}`);
  });
}

async function dropDb(dbName: string): Promise<void> {
  await withClient("postgres", (client) =>
    client.query(`DROP DATABASE IF EXISTS ${dbName}`),
  );
}

async function tableExists(dbName: string, table: string): Promise<boolean> {
  return withClient(dbName, async (client) => {
    const res = await client.query("SELECT to_regclass($1) AS t", [
      `public.${table}`,
    ]);
    return Boolean(res.rows[0].t);
  });
}

async function ledgerRows(
  dbName: string,
): Promise<{ name: string; source: string }[]> {
  return withClient(dbName, async (client) => {
    const res = await client.query(
      "SELECT name, source FROM public.app_schema_migrations ORDER BY name",
    );
    return res.rows as { name: string; source: string }[];
  });
}

const fixtureDirs: string[] = [];
function fixtureDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "sw-deploy-migrate-"));
  for (const [name, sql] of Object.entries(files)) {
    writeFileSync(join(dir, name), sql);
  }
  fixtureDirs.push(dir);
  return dir;
}

function completion(stdout: string): {
  seeded: string[];
  migrations: string[];
  skipped: string[];
} {
  const line = stdout
    .trim()
    .split("\n")
    .find((l) => l.includes('"migration":"complete"'));
  if (!line) throw new Error(`no completion line in runner output:\n${stdout}`);
  return JSON.parse(line) as {
    seeded: string[];
    migrations: string[];
    skipped: string[];
  };
}

afterAll(() => {
  for (const dir of fixtureDirs) rmSync(dir, { recursive: true, force: true });
});

describe("deploy-migrate gates", () => {
  it("skips cleanly outside production and never needs a database", async () => {
    const res = await runRunner({
      VERCEL_ENV: "preview",
      SW_MIGRATION_DATABASE_URL: undefined,
      SW_MIGRATION_EXPECTED_PROJECT_REF: undefined,
      SW_MIGRATIONS_DIR: undefined,
    });
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('"migration":"skipped"');
    expect(res.stdout).toContain("not a production deployment");
  });

  it("fails the build in production when the credential is missing", async () => {
    const res = await runRunner({
      VERCEL_ENV: "production",
      SW_MIGRATION_DATABASE_URL: undefined,
      SW_MIGRATION_EXPECTED_PROJECT_REF: TEST_REF,
      SW_MIGRATIONS_DIR: undefined,
    });
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("SW_MIGRATION_DATABASE_URL is not set");
  });

  it("refuses a connection string that does not encode the expected ref, without leaking it", async () => {
    const url = "postgres://someone:sup3rsecretpw@127.0.0.1:1/nowhere";
    const res = await runRunner({
      VERCEL_ENV: "production",
      SW_MIGRATION_DATABASE_URL: url,
      SW_MIGRATION_EXPECTED_PROJECT_REF: "rjfbrfognxqkyhdrpibx",
      SW_MIGRATIONS_DIR: undefined,
    });
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("does not encode the expected project ref");
    expect(res.stdout + res.stderr).not.toContain("sup3rsecretpw");
    expect(res.stdout + res.stderr).not.toContain(url);
  });
});

describeDb("deploy-migrate against a throwaway Postgres", () => {
  const dbs = ["swmig_seed", "swmig_fail", "swmig_again", "swmig_race"];

  afterAll(async () => {
    for (const db of dbs) await dropDb(db);
  });

  it("seeds the baseline WITHOUT executing it, honors the CLI ledger, and applies post-baseline files", async () => {
    const db = "swmig_seed";
    await freshDb(db);
    // The CLI-ledger union: a file above the baseline whose version the
    // Supabase CLI recorded must be seeded, not executed.
    await withClient(db, async (client) => {
      await client.query("CREATE SCHEMA supabase_migrations");
      await client.query(
        "CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY, name text, statements text[])",
      );
      await client.query(
        "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20270101000000', 'cli_recorded')",
      );
    });
    const dir = fixtureDir({
      "20260101000000_base_alpha.sql":
        "create table public.fixture_alpha (id integer);",
      "20260202000000_base_beta.sql":
        "create table public.fixture_beta (id integer);",
      "20270101000000_cli_recorded.sql":
        "create table public.fixture_cli (id integer);",
      "20270202000000_proof_noop.sql":
        "do $$ begin raise notice 'deploy-migrate proof'; end $$;",
      "20270303000000_new_table.sql":
        "create table public.fixture_new (id integer);",
    });

    const res = await runRunner(prodEnv(db, dir));
    expect(res.code).toBe(0);
    const report = completion(res.stdout);
    expect(report.seeded).toEqual([
      "20260101000000_base_alpha.sql",
      "20260202000000_base_beta.sql",
      "20270101000000_cli_recorded.sql",
    ]);
    expect(report.migrations).toEqual([
      "20270202000000_proof_noop.sql",
      "20270303000000_new_table.sql",
    ]);
    expect(report.skipped).toEqual([]);

    // Non-execution proof: seeded files created nothing at all.
    expect(await tableExists(db, "fixture_alpha")).toBe(false);
    expect(await tableExists(db, "fixture_beta")).toBe(false);
    expect(await tableExists(db, "fixture_cli")).toBe(false);
    // The post-baseline file really applied.
    expect(await tableExists(db, "fixture_new")).toBe(true);

    const rows = await ledgerRows(db);
    expect(rows).toEqual([
      { name: "20260101000000_base_alpha.sql", source: "baseline-seed" },
      { name: "20260202000000_base_beta.sql", source: "baseline-seed" },
      { name: "20270101000000_cli_recorded.sql", source: "baseline-seed" },
      { name: "20270202000000_proof_noop.sql", source: "deploy" },
      { name: "20270303000000_new_table.sql", source: "deploy" },
    ]);
  });

  it("a failing migration rolls back, records nothing, and later files never run", async () => {
    const db = "swmig_fail";
    await freshDb(db);
    const dir = fixtureDir({
      "20270101000000_good.sql": "create table public.fixture_good (id integer);",
      "20270202000000_bad.sql":
        "create table public.fixture_bad (id integer);\ninsert into public.no_such_table values (1);",
      "20270303000000_never.sql":
        "create table public.fixture_never (id integer);",
    });

    const res = await runRunner(prodEnv(db, dir));
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("20270202000000_bad.sql");

    // Rolled back: the bad file's own DDL is gone and it has no ledger row.
    expect(await tableExists(db, "fixture_bad")).toBe(false);
    // The earlier file in the same run stayed applied and recorded.
    expect(await tableExists(db, "fixture_good")).toBe(true);
    // Later files did not run.
    expect(await tableExists(db, "fixture_never")).toBe(false);
    expect(await ledgerRows(db)).toEqual([
      { name: "20270101000000_good.sql", source: "deploy" },
    ]);
  });

  it("a second run applies nothing (idempotent)", async () => {
    const db = "swmig_again";
    await freshDb(db);
    const dir = fixtureDir({
      "20260101000000_base_alpha.sql":
        "create table public.fixture_alpha (id integer);",
      "20270202000000_new_table.sql":
        "create table public.fixture_new (id integer);",
    });
    const env = prodEnv(db, dir);

    const first = await runRunner(env);
    expect(first.code).toBe(0);
    const firstReport = completion(first.stdout);
    expect(firstReport.seeded).toEqual(["20260101000000_base_alpha.sql"]);
    expect(firstReport.migrations).toEqual(["20270202000000_new_table.sql"]);
    const rowsAfterFirst = await ledgerRows(db);

    const second = await runRunner(env);
    expect(second.code).toBe(0);
    const secondReport = completion(second.stdout);
    // The seed branch never runs again once the ledger is non-empty.
    expect(secondReport.seeded).toEqual([]);
    expect(secondReport.migrations).toEqual([]);
    expect(secondReport.skipped).toEqual([
      "20260101000000_base_alpha.sql",
      "20270202000000_new_table.sql",
    ]);
    expect(await ledgerRows(db)).toEqual(rowsAfterFirst);
  });

  it("two concurrent runs serialize on the advisory lock", async () => {
    const db = "swmig_race";
    await freshDb(db);
    const dir = fixtureDir({
      "20270101000000_slow.sql":
        "select pg_sleep(4);\ncreate table public.fixture_slow (id integer);",
      "20270202000000_second.sql":
        "create table public.fixture_second (id integer);",
    });
    const env = prodEnv(db, dir);

    const [r1, r2] = await Promise.all([runRunner(env), runRunner(env)]);
    expect(r1.code).toBe(0);
    expect(r2.code).toBe(0);

    const reports = [completion(r1.stdout), completion(r2.stdout)];
    const appliedSomewhere = reports.flatMap((r) => r.migrations).sort();
    // Each file was applied exactly once, by whichever run won the lock;
    // the other waited, re-read the ledger, and found nothing to do.
    expect(appliedSomewhere).toEqual([
      "20270101000000_slow.sql",
      "20270202000000_second.sql",
    ]);
    const idleReport = reports.find((r) => r.migrations.length === 0);
    expect(idleReport).toBeDefined();
    expect(idleReport?.skipped.sort()).toEqual([
      "20270101000000_slow.sql",
      "20270202000000_second.sql",
    ]);

    expect(await tableExists(db, "fixture_slow")).toBe(true);
    expect(await tableExists(db, "fixture_second")).toBe(true);
    expect(await ledgerRows(db)).toHaveLength(2);
  });
});
