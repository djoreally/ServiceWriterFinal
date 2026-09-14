import { z } from "zod";
import { ApiError, errorResponse, json, requireUser } from "@/server/api";

const selectionSchema = z.object({
  workspaceUserId: z.string().uuid(),
  role: z.enum([
    "admin",
    "owner",
    "manager",
    "dispatcher",
    "fleet_manager",
    "technician",
    "service_advisor",
    "receptionist",
    "viewer",
  ]),
});

export async function GET(request: Request) {
  try {
    const { supabase } = await requireUser(request);
    const { data, error } = await supabase.rpc("get_workforce_identity_v1");
    if (error) throw error;
    return json({ data: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = selectionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "Invalid workspace selection", "invalid_workspace_selection");
    }

    const { supabase } = await requireUser(request);
    const { data, error } = await supabase.rpc("select_active_workspace_v1", {
      p_owner_user_id: parsed.data.workspaceUserId,
      p_role: parsed.data.role,
    });
    if (error) throw error;
    if (!data?.[0]) {
      throw new ApiError(404, "The selected workspace is no longer available.", "workspace_not_found");
    }

    return json({ data: data[0] });
  } catch (error) {
    return errorResponse(error);
  }
}
