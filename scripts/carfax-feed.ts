#!/usr/bin/env tsx
/**
 * CARFAX feed job — the runnable form of the production generator
 * (src/server/carfax). Builds the HIST or daily PROD file for one workspace,
 * validates it, records the run in public.carfax_feed_runs, and (with
 * --upload) delivers it by SFTP.
 *
 * Usage:
 *   npm run carfax:feed -- --workspace <workspace-uuid> --kind HIST
 *   npm run carfax:feed -- --workspace <workspace-uuid> --kind PROD --date 2026-11-13
 *   npm run carfax:feed -- --workspace <workspace-uuid> --kind PROD --upload
 *   npm run carfax:feed -- --workspace <workspace-uuid> --kind HIST --dry-run
 *
 * Flags:
 *   --workspace <uuid>   Workspace to generate for (required).
 *   --kind HIST|PROD     HIST = all completed history; PROD = one service
 *                        date (default: PROD).
 *   --date YYYY-MM-DD    PROD service date (default: today, UTC).
 *   --upload             Deliver by SFTP after a successful build. Without
 *                        it the run is generation-only.
 *   --dry-run            Generate + validate + record only. No upload, no
 *                        network connection, no file written.
 *   --out-dir <path>     Also write the built file here (never on --dry-run).
 *
 * Environment: the server's Supabase env (service role) for data + run
 * records, and — only for --upload — the CARFAX_SFTP_* variables documented
 * in src/server/carfax/sftp-config.ts. No secret is ever printed; the
 * summary line is JSON with counts and the file hash only.
 *
 * Exit code: 0 when the run's final status is generated / dry_run /
 * uploaded; 1 otherwise (the run record carries the reason).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createSupabaseAdminClient } from "../src/lib/supabase";
import { generateCarfaxFeedRun } from "../src/server/carfax/generate";
import { createCarfaxFeedRunRecorder } from "../src/server/carfax/runs";

interface CliOptions {
  workspaceId: string;
  kind: "HIST" | "PROD";
  date?: string;
  upload: boolean;
  dryRun: boolean;
  outDir?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { workspaceId: "", kind: "PROD", upload: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--workspace":
        options.workspaceId = argv[++i] ?? "";
        break;
      case "--kind": {
        const kind = (argv[++i] ?? "").toUpperCase();
        if (kind !== "HIST" && kind !== "PROD") throw new Error(`--kind must be HIST or PROD (got "${kind}").`);
        options.kind = kind;
        break;
      }
      case "--date":
        options.date = argv[++i];
        break;
      case "--upload":
        options.upload = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--out-dir":
        options.outDir = argv[++i];
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.workspaceId) throw new Error("--workspace <uuid> is required.");
  if (options.date && !/^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
    throw new Error(`--date must be YYYY-MM-DD (got "${options.date}").`);
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const db = createSupabaseAdminClient();
  const result = await generateCarfaxFeedRun({
    db,
    workspaceId: options.workspaceId,
    kind: options.kind,
    date: options.date,
    dryRun: options.dryRun,
    upload: options.upload,
    recorder: createCarfaxFeedRunRecorder(db),
  });

  let writtenPath: string | null = null;
  if (result.content !== null && options.outDir && !options.dryRun) {
    await mkdir(options.outDir, { recursive: true });
    writtenPath = join(options.outDir, result.fileName);
    await writeFile(writtenPath, result.content, "utf8");
  }

  console.log(JSON.stringify({
    ok: result.ok,
    status: result.status,
    run_id: result.runId,
    file_name: result.fileName,
    record_count: result.recordCount,
    row_count: result.rowCount,
    sha256: result.sha256,
    written_path: writtenPath,
    error: result.error,
  }));
  process.exit(result.ok ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({
    ok: false,
    status: "failed",
    error: error instanceof Error ? error.message : "unknown error",
  }));
  process.exit(1);
});
