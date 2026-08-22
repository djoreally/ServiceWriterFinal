import { z } from "zod";
import { errorResponse, json, paginationSchema, requireWorkspaceMember } from "@/server/api";
import { accountExportSchema, createImportBatch } from "@/server/accountImport";

const createSchema = z.object({
  workspace_id: z.string().uuid(),
  file_name: z.string().trim().min(1).max(255),
  export: accountExportSchema,
});

const batchSelect = "id,workspace_id,source_system,source_version,source_file_name,source_sha256,status,dry_run,total_records,imported_records,skipped_records,failed_records,error_summary,created_at,completed_at,rolled_back_at";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = z.string().uuid().parse(url.searchParams.get("workspace_id"));
    const pagination = paginationSchema.parse({ limit: url.searchParams.get("limit") || undefined, offset: url.searchParams.get("offset") || undefined });
    const { supabase } = await requireWorkspaceMember(workspaceId, ["owner", "admin"], request);
    const { data, error, count } = await supabase.from("account_import_batches").select(batchSelect, { count: "exact" }).eq("workspace_id", workspaceId).order("created_at", { ascending: false }).range(pagination.offset, pagination.offset + pagination.limit - 1);
    if (error) throw error;
    return json({ data: data ?? [], meta: { limit: pagination.limit, offset: pagination.offset, total: count ?? 0 } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const payload = createSchema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(payload.workspace_id, ["owner", "admin"], request);
    const result = await createImportBatch({ supabase, user, workspaceId: payload.workspace_id, fileName: payload.file_name, input: payload.export });
    return json({ data: result.batch, preview: { source_version: result.exportData.exportVersion, sections: Object.fromEntries(Object.entries(result.exportData.data).map(([section, rows]) => [section, rows.length])) } }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
