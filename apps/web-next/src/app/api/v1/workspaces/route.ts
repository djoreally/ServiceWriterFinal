import { json, errorResponse, requireUser } from "@/server/api";

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase
      .from("workspace_members")
      .select("workspace_id,role,is_active,workspaces(id,name,slug,kind,timezone,currency_code,is_active)")
      .eq("user_id", user.id)
      .eq("is_active", true);
    if (error) throw error;
    return json({ data: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}
