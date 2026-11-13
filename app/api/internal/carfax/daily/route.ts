import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  generateCarfaxFeedRun,
  listCarfaxEnrolledWorkspaceIds,
} from "@/server/carfax/generate";
import { createCarfaxFeedRunRecorder } from "@/server/carfax/runs";
import { readCarfaxSftpConfig, isCarfaxSftpConfigMissing } from "@/server/carfax/sftp-config";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Daily CARFAX PROD feed (Vercel cron, see vercel.json).
 *
 * Sends yesterday's completed services (UTC) for every workspace enrolled
 * for the feed (a CARFAX location ID is set). The PROD file is named for
 * its generation date, per the CARFAX naming convention.
 *
 * Inert until activation: while the CARFAX_SFTP_* environment is incomplete
 * the route reports "carfax_sftp_not_configured" and touches nothing — no
 * run records, no files. Once CARFAX issues credentials and they are placed
 * in the environment, this schedule is the daily delivery; each workspace's
 * attempt is recorded in public.carfax_feed_runs either way.
 */

function authorized(request: Request, secret: string) {
  const header = request.headers.get("authorization");
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!supplied) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ ok: false, error: "worker_not_configured" }, { status: 503 });
  if (!authorized(request, secret)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const sftp = readCarfaxSftpConfig();
  if (isCarfaxSftpConfigMissing(sftp)) {
    return NextResponse.json({ ok: true, skipped: "carfax_sftp_not_configured", missing: sftp.missing });
  }

  try {
    const db = createSupabaseAdminClient();
    const recorder = createCarfaxFeedRunRecorder(db);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const workspaceIds = await listCarfaxEnrolledWorkspaceIds(db);
    const results = [];
    for (const workspaceId of workspaceIds) {
      const result = await generateCarfaxFeedRun({
        db,
        workspaceId,
        kind: "PROD",
        date: yesterday,
        upload: true,
        recorder,
        sftpConfig: sftp,
      });
      results.push({
        workspace_id: workspaceId,
        status: result.status,
        file_name: result.fileName,
        row_count: result.rowCount,
        error: result.error,
      });
    }
    return NextResponse.json({ ok: true, date: yesterday, workspaces: results });
  } catch (error) {
    console.error("[CARFAX] daily feed worker failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, error: "worker_failed" }, { status: 500 });
  }
}
