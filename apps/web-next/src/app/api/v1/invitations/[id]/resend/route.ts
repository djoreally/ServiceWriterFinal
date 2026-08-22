import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { sendInvitationEmail } from "@/server/invitations/mailer";
import { ApiError, errorResponse, json, requireWorkspaceMember } from "@/server/api";

const idSchema = z.string().uuid();
const digest = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
const invitationSelect = "id,workspace_id,customer_id,invited_email,invited_role,expires_at,accepted_at,accepted_by,revoked_at,created_by,created_at,updated_at";
const exposeToken = process.env.INVITATION_EXPOSE_RAW_TOKEN === "true" && process.env.NODE_ENV !== "production";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = idSchema.parse((await context.params).id);
    const { supabase, user } = await requireWorkspaceMemberForInvitation(id);
    const { data: invitation, error: readError } = await supabase.from("invitations").select("id,workspace_id,customer_id,invited_email,invited_role,expires_at,accepted_at,revoked_at").eq("id", id).single();
    if (readError || !invitation) throw new ApiError(404, "Invitation not found", "not_found");
    const { data: attempts, error: attemptsError } = await supabase.from("invitation_delivery_attempts").select("id,created_at").eq("invitation_id", id).gte("created_at", new Date(Date.now() - 3_600_000).toISOString()).order("created_at", { ascending: false }).limit(10);
    if (attemptsError) throw attemptsError;
    if ((attempts ?? []).length >= 5) throw new ApiError(429, "Invitation delivery rate limit exceeded", "rate_limited");
    if ((attempts ?? []).some((attempt) => Date.now() - new Date(attempt.created_at).getTime() < 60_000)) throw new ApiError(429, "Please wait at least one minute before resending", "cooldown_active");
    if (invitation.accepted_at) throw new ApiError(409, "Invitation has already been accepted", "invitation_used");
    if (invitation.revoked_at) throw new ApiError(410, "Invitation has been revoked", "invitation_revoked");

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const { data, error } = await supabase.from("invitations").update({ token_hash: digest(token), expires_at: expiresAt }).eq("id", id).is("accepted_at", null).is("revoked_at", null).select(invitationSelect).single();
    if (error) throw error;
    const { error: eventError } = await supabase.from("invitation_events").insert({ invitation_id: id, workspace_id: data.workspace_id, event_type: "resent", actor_user_id: user.id, metadata: { expires_at: expiresAt } });
    if (eventError) throw eventError;
    try {
      const result = await sendInvitationEmail({ invitationId: id, workspaceId: data.workspace_id, recipientEmail: data.invited_email, role: data.invited_role, token, expiresAt });
      await supabase.from("invitation_delivery_attempts").insert({ workspace_id: data.workspace_id, invitation_id: id, invited_email: data.invited_email, actor_user_id: user.id, provider: result.providerName, provider_message_id: result.providerMessageId, status: "accepted" });
      return json({ data, delivery: { status: "accepted", provider: result.providerName, provider_message_id: result.providerMessageId }, ...(exposeToken ? { token } : {}) });
    } catch (deliveryError) {
      const message = deliveryError instanceof Error ? deliveryError.message : "Invitation delivery failed";
      await supabase.from("invitation_delivery_attempts").insert({ workspace_id: data.workspace_id, invitation_id: id, invited_email: data.invited_email, actor_user_id: user.id, provider: "resend", status: "failed" });
      return json({ data, delivery: { status: "failed", error: message } }, { status: 502 });
    }
  } catch (error) {
    return errorResponse(error);
  }
}

async function requireWorkspaceMemberForInvitation(invitationId: string) {
  const { createSupabaseServerClient } = await import("@/lib/supabase");
  const supabase = await createSupabaseServerClient();
  const { data: invitation, error } = await supabase.from("invitations").select("workspace_id").eq("id", invitationId).single();
  if (error || !invitation) throw new ApiError(404, "Invitation not found", "not_found");
  return requireWorkspaceMember(invitation.workspace_id, ["owner", "admin"]);
}
