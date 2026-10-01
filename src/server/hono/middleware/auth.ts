/**
 * Auth helpers for Hono route handlers.
 *
 * These are thin wrappers over the canonical server auth functions in
 * `@/server/api` — the behavior (bearer-token identity, workspace membership
 * checks, role checks, ApiError codes/statuses) is identical to the original
 * Next.js route handlers. Pass `c.req.raw` (the raw Request) through.
 */
import type { Context } from "hono";
import {
  requireUser,
  requireWorkspaceMember,
  requireWorkspacePaymentsAddon,
} from "@/server/api";
import type { RequestAuthContext } from "../types";

export async function requireAuth(c: Context): Promise<RequestAuthContext> {
  const { supabase, user } = await requireUser(c.req.raw);
  return { supabase, user: user as unknown as RequestAuthContext["user"] };
}

export async function requireWorkspaceAuth(
  c: Context,
  workspaceId: string,
  roles?: string[],
): Promise<RequestAuthContext> {
  const { supabase, user, membership } = await requireWorkspaceMember(
    workspaceId,
    roles,
    c.req.raw,
  );
  return {
    supabase,
    user: user as unknown as RequestAuthContext["user"],
    membership: membership as unknown as RequestAuthContext["membership"],
  };
}

export async function requireWorkspacePaymentsAddonAuth(
  c: Context,
  workspaceId: string,
  roles?: string[],
): Promise<RequestAuthContext & { billing: unknown }> {
  const result = await requireWorkspacePaymentsAddon(workspaceId, roles, c.req.raw);
  return {
    supabase: result.supabase,
    user: result.user as unknown as RequestAuthContext["user"],
    membership: result.membership as unknown as RequestAuthContext["membership"],
    billing: result.billing,
  };
}
