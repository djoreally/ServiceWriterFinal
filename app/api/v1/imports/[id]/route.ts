import { z } from "zod";
import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { accountExportSchema, executeImportBatch, rollbackImportBatch } from "@/server/accountImport";

const actionSchema = z.object({ workspace_id: z.string().uuid(), action: z.enum(["execute", "rollback"]), export: accountExportSchema.optional() });
const idSchema = z.string().uuid();
const select = "id,workspace_id,source_system,source_version,source_file_name,source_sha256,status,dry_run,total_records,imported_records,skipped_records,failed_records,error_summary,created_at,completed_at,rolled_back_at";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = idSchema.parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const { supabase } = await requireWorkspaceMember(workspaceId, ["owner", "admin"], request);
    const { data: batch, error } = await supabase.from("account_import_batches").select(select).eq("id", id).eq("workspace_id", workspaceId).single();
    if (error) throw error;
    const { data: records, error: recordsError } = await supabase.from("account_import_records").select("id,source_section,source_id,target_table,target_id,action,status,error_code,error_message,created_at").eq("batch_id", id).eq("workspace_id", workspaceId).order("created_at", { ascending: true }).limit(5000);
    if (recordsError) throw recordsError;
    return json({ data: batch, records: records ?? [] });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = idSchema.parse((await context.params).id);
    const body = actionSchema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin"], request);
    const { data: batch, error: batchError } = await supabase.from("account_import_batches").select("id,status,source_sha256,workspace_id").eq("id", id).eq("workspace_id", body.workspace_id).single();
    if (batchError || !batch) throw batchError ?? new Error("Import batch not found");
    if (body.action === "rollback") {
      const result = await rollbackImportBatch({ supabase, user, batchId: id, workspaceId: body.workspace_id, mappings: new Map() });
      return json({ data: result });
    }
    if (!body.export) return json({ error: { code: "missing_export", message: "The original export is required to execute this batch." } }, { status: 400 });
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(JSON.stringify(body.export)).digest("hex");
    if (hash !== batch.source_sha256) return json({ error: { code: "source_mismatch", message: "The supplied export does not match the staged batch." } }, { status: 409 });
    if (!["staged", "approved"].includes(batch.status)) return json({ error: { code: "invalid_batch_state", message: "This import batch is not executable." } }, { status: 409 });
    await supabase.from("account_import_batches").update({ status: "running", dry_run: false }).eq("id", id).eq("workspace_id", body.workspace_id);
    const result = await executeImportBatch({ supabase, user, batchId: id, workspaceId: body.workspace_id, mappings: new Map() }, body.export);
    return json({ data: result });
  } catch (error) { return errorResponse(error); }
}
