#!/usr/bin/env tsx
/**
 * Spec backfill job — the runnable form of src/server/qld/spec-backfill.
 *
 * Walks vehicles whose learned working specs (vehicle_service_specs)
 * are blank despite a resolvable identity (year/make/model, completed
 * blanks-only from the VIN decode when a VIN exists) and fills the
 * blanks from Quick Lube Data through the resolver — blanks only,
 * learned/human values always win, the engine settled by evidence
 * (stored → booking snapshot → decode → lone hierarchy engine),
 * never probed into a guess. Idempotent: a re-run fills nothing.
 *
 * Usage:
 *   npm run specs:backfill
 *   npm run specs:backfill -- --workspace <workspace-uuid>
 *   npm run specs:backfill -- --dry-run
 *   npm run specs:backfill -- --limit 50
 *
 * Flags:
 *   --workspace <uuid>   Scope to one workspace (default: all).
 *   --dry-run            Audit + resolve + count only. No writes.
 *                        (Resolutions still read the QLD cache / live
 *                        API exactly as a real run would.)
 *   --limit <n>          Stop after scanning n vehicles.
 *
 * Environment: the server's Supabase env (service role) and
 * QLD_API_KEY. No secret is ever printed; the summary line is JSON
 * with counts only — no vehicle, customer, or VIN data.
 *
 * Exit code: 0 when the walk completes with zero per-vehicle errors;
 * 1 otherwise (the summary carries the counts).
 */
import { createSupabaseAdminClient } from "../src/lib/supabase";
import { runSpecBackfill } from "../src/server/qld/spec-backfill";

interface CliOptions {
  workspaceId?: string;
  dryRun: boolean;
  limit?: number;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--workspace":
        options.workspaceId = argv[++i] ?? "";
        if (!options.workspaceId) throw new Error("--workspace requires a value.");
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--limit": {
        const value = Number(argv[++i]);
        if (!Number.isFinite(value) || value <= 0) throw new Error("--limit must be a positive number.");
        options.limit = Math.floor(value);
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const db = createSupabaseAdminClient();
  const report = await runSpecBackfill(db, {
    workspaceId: options.workspaceId ?? null,
    dryRun: options.dryRun,
    limit: options.limit ?? null,
    log: (line) => console.log(line),
  });
  console.log(JSON.stringify({ ok: report.errors === 0, ...report }));
  process.exit(report.errors === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : "unknown error",
  }));
  process.exit(1);
});
