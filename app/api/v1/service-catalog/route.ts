import { json, errorResponse, requireWorkspaceMember } from "@/server/api";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) {
      return json({ error: { code: "missing_workspace", message: "workspace_id is required" } }, { status: 400 });
    }

    const { supabase } = await requireWorkspaceMember(workspaceId, undefined, request);
    const { data, error } = await supabase
      .from("service_catalog")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) throw error;
    return json({ data: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}
