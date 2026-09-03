import { createHash } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { ApiError, errorResponse, json } from "@/server/api";

const tokenSchema = z.string().trim().min(20).max(200);
const digest = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");

export async function GET(request: Request) {
  try {
    const token = tokenSchema.parse(new URL(request.url).searchParams.get("token") ?? "");
    const admin = createSupabaseAdminClient();
    const { data: invitation, error } = await admin
      .from("invitations")
      .select("id,expires_at,accepted_at,revoked_at")
      .eq("token_hash", digest(token))
      .maybeSingle();
    if (error) throw error;
    if (!invitation) throw new ApiError(404, "Invitation not found or token is invalid", "invalid_invitation");
    if (invitation.accepted_at) throw new ApiError(409, "Invitation has already been accepted", "invitation_used");
    if (invitation.revoked_at || new Date(invitation.expires_at).getTime() <= Date.now()) throw new ApiError(410, "Invitation is no longer valid", "invitation_expired");

    return json({ data: { invitation_id: invitation.id } });
  } catch (error) {
    return errorResponse(error);
  }
}
