import { corsHeaders, errorResponse, json, requireUser } from "@/server/api";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const { data, error } = await supabase
      .from("workspace_members")
      .select("workspace_id,role,is_active,workspaces(id,name,slug,kind,timezone,currency_code,is_active)")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("workspace_id", { ascending: true });
    if (error) throw error;
    return json({ data: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
