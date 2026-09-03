import { createHash } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { ApiError, errorResponse, json, requireUser, requireWorkspaceMember } from "@/server/api";

const idSchema = z.string().uuid();
const acceptSchema = z.object({ token: z.string().trim().min(20).max(200) });
const digest = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = idSchema.parse((await context.params).id);
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const parsed = acceptSchema.safeParse({ token });
    if (!parsed.success) throw new ApiError(404, "Invitation not found or token is invalid", "invalid_invitation");

    const admin = createSupabaseAdminClient();
    const { data: invitation, error } = await admin
      .from("invitations")
      .select("id,workspace_id,invited_email,invited_role,expires_at,accepted_at,revoked_at")
      .eq("id", id)
      .eq("token_hash", digest(parsed.data.token))
      .maybeSingle();
    if (error) throw error;
    if (!invitation) throw new ApiError(404, "Invitation not found or token is invalid", "invalid_invitation");
    if (invitation.accepted_at) throw new ApiError(409, "Invitation has already been accepted", "invitation_used");
    if (invitation.revoked_at || new Date(invitation.expires_at).getTime() <= Date.now()) throw new ApiError(410, "Invitation is no longer valid", "invitation_expired");

    const { data: workspace } = await admin.from("workspaces").select("name").eq("id", invitation.workspace_id).maybeSingle();
    return json({
      data: {
        id: invitation.id,
        invited_email: invitation.invited_email,
        invited_role: invitation.invited_role,
        expires_at: invitation.expires_at,
        workspace_name: workspace?.name ?? "Service Writer",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = idSchema.parse((await context.params).id);
    const { user } = await requireUser(request);
    const admin = createSupabaseAdminClient();
    const { data: invitation, error: readError } = await admin
      .from("invitations")
      .select("id,workspace_id,accepted_at,revoked_at")
      .eq("id", id)
      .single();
    if (readError || !invitation) throw new ApiError(404, "Invitation not found", "not_found");

    await requireWorkspaceMember(invitation.workspace_id, ["owner", "admin"], request);

    const { data, error } = await admin.rpc("revoke_invitation_v1", {
      p_invitation_id: id,
      p_workspace_id: invitation.workspace_id,
      p_actor_user_id: user.id,
    });
    if (error) {
      if (/not found/i.test(error.message ?? "")) throw new ApiError(404, "Invitation not found", "not_found");
      if (/state changed/i.test(error.message ?? "")) throw new ApiError(409, "Invitation state changed", "invitation_conflict");
      throw error;
    }

    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = idSchema.parse((await context.params).id);
    const { token } = acceptSchema.parse(await request.json());
    const { supabase, user } = await requireUser(request);
    if (!user.email) throw new ApiError(400, "The authenticated account has no email address", "email_required");

    const { data, error } = await supabase.rpc("accept_invitation_v1", {
      p_invitation_id: id,
      p_token: token,
    });
    if (error) {
      const message = error.message ?? "Invitation could not be accepted";
      if (/already been accepted/i.test(message)) throw new ApiError(409, message, "invitation_used");
      if (/revoked/i.test(message)) throw new ApiError(410, message, "invitation_revoked");
      if (/expired/i.test(message)) throw new ApiError(410, message, "invitation_expired");
      if (/different email/i.test(message)) throw new ApiError(403, message, "invitation_email_mismatch");
      if (/not found|token is invalid/i.test(message)) throw new ApiError(404, message, "invalid_invitation");
      throw error;
    }

    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
