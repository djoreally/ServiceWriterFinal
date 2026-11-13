/**
 * CARFAX feed run records — the write side for public.carfax_feed_runs.
 *
 * One row per generation/transfer attempt: opened when the attempt starts
 * (status "running") and closed with the final status, counts, file hash,
 * and error. Writes go through the trusted server client (service role);
 * the table's only RLS policy lets workspace owners/admins read their own
 * shop's history.
 */

export type CarfaxFeedRunStatus =
  | "running"
  | "generated"
  | "dry_run"
  | "validation_failed"
  | "upload_failed"
  | "uploaded"
  | "failed";

export interface CarfaxFeedRunStart {
  workspaceId: string;
  kind: "HIST" | "PROD";
  fileName: string;
  dryRun: boolean;
}

export interface CarfaxFeedRunFinish {
  status: Exclude<CarfaxFeedRunStatus, "running">;
  recordCount: number;
  rowCount: number;
  sha256: string | null;
  error: string | null;
}

export interface CarfaxFeedRunRecorder {
  start(run: CarfaxFeedRunStart): Promise<string>;
  finish(runId: string, finish: CarfaxFeedRunFinish): Promise<void>;
}

interface RunRecordDb {
  from(table: string): {
    insert(values: Record<string, unknown>): {
      select(columns: string): {
        single(): Promise<{ data: { id: string } | null; error: unknown }>;
      };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{ error: unknown }>;
    };
  };
}

/** Recorder backed by the carfax_feed_runs table. */
export function createCarfaxFeedRunRecorder(db: unknown): CarfaxFeedRunRecorder {
  const client = db as RunRecordDb;
  return {
    async start(run) {
      const { data, error } = await client
        .from("carfax_feed_runs")
        .insert({
          workspace_id: run.workspaceId,
          kind: run.kind,
          file_name: run.fileName,
          status: "running",
          dry_run: run.dryRun,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error("Failed to open the CARFAX feed run record.");
      return data.id;
    },
    async finish(runId, finish) {
      const { error } = await client
        .from("carfax_feed_runs")
        .update({
          status: finish.status,
          record_count: finish.recordCount,
          row_count: finish.rowCount,
          sha256: finish.sha256,
          error: finish.error,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
      if (error) throw new Error("Failed to close the CARFAX feed run record.");
    },
  };
}
