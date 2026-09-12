import { createHash, randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase";

export async function issueAppointmentManagementToken(
  appointmentId: string,
  workspaceId: string,
  expiresAt: string,
) {
  const admin = createSupabaseAdminClient();
  const rawToken = randomBytes(32).toString("base64url");
  const tokenDigest = createHash("sha256").update(rawToken, "utf8").digest("hex");
  const now = new Date().toISOString();

  const revoke = await admin
    .from("appointment_management_tokens")
    .update({ revoked_at: now, updated_at: now })
    .eq("appointment_id", appointmentId)
    .is("revoked_at", null);
  if (revoke.error) throw revoke.error;

  const insert = await admin.from("appointment_management_tokens").insert({
    appointment_id: appointmentId,
    workspace_id: workspaceId,
    token_digest: tokenDigest,
    issued_at: now,
    expires_at: expiresAt,
    source: "booking_confirmation",
  });
  if (insert.error) throw insert.error;

  return rawToken;
}
