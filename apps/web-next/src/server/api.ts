import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase";

export const workspaceIdSchema = z.string().uuid();

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = "api_error") {
    super(message);
  }
}

export function corsHeaders() {
  const headers = new Headers();
  const origin = process.env.NEXT_PUBLIC_CORS_ORIGIN;
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Headers", "authorization, content-type");
    headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    headers.set("Vary", "Origin");
  }
  return headers;
}

export function json<T>(data: T, init?: ResponseInit) {
  const headers = corsHeaders();
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  return NextResponse.json(data, { ...init, headers });
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message } }, { status: error.status });
  console.error("[api] unexpected error", error instanceof Error ? error.message : "unknown");
  return json({ error: { code: "internal_error", message: "An unexpected error occurred." } }, { status: 500 });
}

export async function requireUser(request?: Request) {
  const authorization = request?.headers.get("authorization");
  const bearerToken = authorization?.match(/^Bearer\\s+(.+)$/i)?.[1];

  if (bearerToken) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser(bearerToken);
    if (error || !data.user) throw new ApiError(401, "Authentication required", "unauthenticated");
    return { supabase, user: data.user };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new ApiError(401, "Authentication required", "unauthenticated");
  return { supabase, user: data.user };
}

export async function requireWorkspaceMember(workspaceId: string, roles?: string[]) {
  const parsed = workspaceIdSchema.safeParse(workspaceId);
  if (!parsed.success) throw new ApiError(400, "Invalid workspace_id", "invalid_workspace");
  const { supabase, user } = await requireUser();
  const query = supabase
    .from("workspace_members")
    .select("workspace_id,user_id,role,is_active")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  const { data: membership, error } = await query;
  if (error) throw error;
  if (!membership) throw new ApiError(403, "You are not a member of this workspace", "forbidden");
  if (roles && !roles.includes(membership.role)) throw new ApiError(403, "Insufficient workspace permissions", "forbidden");
  return { supabase, user, membership };
}

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
