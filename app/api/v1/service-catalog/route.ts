import { errorResponse, json } from "@/server/api";
import { ApiService, legacyService } from "@/server/cutover/services";
import { serviceWriterApi } from "@/server/service-writer-api";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) return json({ error: { code: "missing_workspace", message: "workspace_id is required" } }, { status: 400 });
    const rows = await serviceWriterApi<ApiService[]>(request, `/api/v1/workspaces/${workspaceId}/services?includeArchived=false&limit=100&offset=0`);
    return json({ data: rows.filter((row) => row.status === "active").map(legacyService) });
  } catch (error) {
    return errorResponse(error);
  }
}
