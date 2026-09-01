import { createHash } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { ApiError, errorResponse, json, requireUser, requireWorkspaceMember } from "@/server/api";

const idSchema = z.string().uuid();
const acceptSchema = z.object({ token: z.string().trim().min(20).max(200) });
const invitationSelect = "id,workspace_id,customer_id,invited_email,invited_role,expires_at,accepted_at,accepted_by,revoked_at,created_by,created_at,updated_at";
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

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = idSchema.parse((await context.params).id);
    const { supabase, user } = await requireUser();
    const { data: invitation, error: readError } = await supabase.from("invitations").select("id,workspace_id,accepted_at,revoked_at").eq("id", id).single();
    if (readError || !invitation) throw new ApiError(404, "Invitation not found", "not_found");
    await requireWorkspaceMember(invitation.workspace_id, ["owner", "admin"]);
    if (invitation.accepted_at || invitation.revoked_at) return json({ data: invitation });
    const { data, error } = await supabase.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", id).select(invitationSelect).single();
    if (error) throw error;
    const { error: eventError } = await supabase.from("invitation_events").insert({ invitation_id: id, workspace_id: invitation.workspace_id, event_type: "revoked", actor_user_id: user.id, metadata: {} });
    if (eventError) throw eventError;
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = idSchema.parse((await context.params).id);
    const { token } = acceptSchema.parse(await request.json());
    const { user } = await requireUser(request);
    if (!user.email) throw new ApiError(400, "The authenticated account has no email address", "email_required");
    const admin = createSupabaseAdminClient();
    const { data: invitation, error: readError } = await admin.from("invitations").select("id,workspace_id,customer_id,invited_email,invited_role,expires_at,accepted_at,revoked_at").eq("id", id).eq("token_hash", digest(token)).maybeSingle();
    if (readError) throw readError;
    if (!invitation) throw new ApiError(404, "Invitation not found or token is invalid", "invalid_invitation");
    if (invitation.accepted_at) throw new ApiError(409, "Invitation has already been accepted", "invitation_used");
    if (invitation.revoked_at || new Date(invitation.expires_at).getTime() <= Date.now()) throw new ApiError(410, "Invitation is no longer valid", "invitation_expired");
    if (user.email.trim().toLowerCase() !== invitation.invited_email.trim().toLowerCase()) throw new ApiError(403, "This invitation was issued to a different email address", "invitation_email_mismatch");

    const { error: membershipError } = await admin.from("workspace_members").upsert({ workspace_id: invitation.workspace_id, user_id: user.id, role: invitation.invited_role, is_active: true }, { onConflict: "workspace_id,user_id" });
    if (membershipError) throw membershipError;
    if (invitation.customer_id) {
      const { error: customerLinkError } = await admin.from("customer_users").upsert({ workspace_id: invitation.workspace_id, customer_id: invitation.customer_id, user_id: user.id }, { onConflict: "workspace_id,customer_id,user_id" });
      if (customerLinkError) throw customerLinkError;
    }
    const { data, error: updateError } = await admin.from("invitations").update({ accepted_at: new Date().toISOString(), accepted_by: user.id }).eq("id", id).is("accepted_at", null).is("revoked_at", null).select(invitationSelect).single();
    if (updateError) throw updateError;
    const { error: eventError } = await admin.from("invitation_events").insert({ invitation_id: id, workspace_id: invitation.workspace_id, event_type: "accepted", actor_user_id: user.id, metadata: {} });
    if (eventError) throw eventError;
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
