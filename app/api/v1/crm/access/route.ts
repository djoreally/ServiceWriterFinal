import { NextResponse } from "next/server";
import { errorResponse, json, requireCrmCapability, workspaceIdSchema } from "@/server/api";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id") || "";
    const parsed = workspaceIdSchema.safeParse(workspaceId);
    if (!parsed.success) {
      return json({ error: { code: "invalid_workspace", message: "Invalid workspace_id" } }, { status: 400 });
    }

    await requireCrmCapability(request, workspaceId, "crm.view");
    return json({ data: { workspace_id: workspaceId, can_view: true } });
  } catch (error) {
    return errorResponse(error);
  }
}
