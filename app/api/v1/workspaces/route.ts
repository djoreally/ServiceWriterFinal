import { corsHeaders, errorResponse, json, requireUser } from "@/server/api";

export const dynamic = "force-dynamic";

// This legacy route handler shadows the identical Hono registration
// (platformRouter, src/server/hono/routes/platform.ts) because Next.js
// gives specific route.ts files precedence over the [[...route]]
// catch-all — so the Hono CORS middleware never sees these responses.
// The request Origin is therefore threaded through json()/errorResponse()/
// corsHeaders() explicitly, the same allowlist reflection the Hono app
// applies (see corsHeaders in @/server/api): allowlisted origins (the
// technician app) get the reflected headers, strangers get none, and
// no-Origin callers keep the historical behavior exactly.

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export async function GET(request: Request) {
  const requestOrigin = request.headers.get("origin");
  try {
    const { supabase, user } = await requireUser(request);
    const { data, error } = await supabase
      .from("workspace_members")
      .select("workspace_id,role,is_active,workspaces(id,name,slug,kind,timezone,currency_code,is_active)")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("workspace_id", { ascending: true });
    if (error) throw error;
    return json({ data: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } }, requestOrigin);
  } catch (error) {
    return errorResponse(error, {}, requestOrigin);
  }
}
